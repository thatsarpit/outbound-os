import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createEmailIngressRouter } from '../src/routes/emailIngress.js';
import { EMAIL_INGRESS_MAX_BYTES, EMAIL_INGRESS_HEADERS as H, emailIngressSignature, readEmailIngressHeaders } from '../src/utils/emailIngressSignature.js';

const secret = 'fixture-email-ingress-not-a-production-secret';
const clock = Date.parse('2026-10-24T00:00:00.000Z');
const mime = Buffer.from('From: customer@example.test\r\nTo: sales@example.test\r\nSubject: Fixture\r\n\r\nPlease share the details.');
function signed(raw = mime, overrides = {}) {
  const values = { secret, timestamp: String(clock / 1000), eventId: 'fixture-event-12345678',
    from: Buffer.from('customer@example.test').toString('base64url'), to: Buffer.from('sales@example.test').toString('base64url'),
    receivedAt: new Date(clock - 10000).toISOString(), payloadHash: createHash('sha256').update(raw).digest('hex'), ...overrides };
  return Object.fromEntries(Object.entries({ ...values, signature: emailIngressSignature(values) })
    .filter(([key]) => key in H).map(([key, value]) => [H[key], value]));
}
async function withReceiver(run, options = {}) {
  const calls = [];
  const app = express();
  app.use('/api/webhooks/email-ingress', createEmailIngressRouter({ env: { EMAIL_INGRESS_ENABLED: 'true', EMAIL_INGRESS_SECRET: secret },
    now: () => clock, limiter: (_req, _res, next) => next(),
    ingest: async input => { calls.push(input); return { receipt: { id: 1, state: 'matched' } }; }, ...options }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/webhooks/email-ingress`;
  const post = (raw = mime, headers = signed(raw), more = {}) => fetch(base, { method: 'POST', headers: { 'content-type': 'message/rfc822', ...headers }, body: raw, ...more });
  try { await run({ base, post, calls }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('email ingress is disabled until explicitly enabled with a dedicated strong secret', async () => {
  for (const env of [{}, { EMAIL_INGRESS_ENABLED: 'true' }, { EMAIL_INGRESS_ENABLED: 'true', EMAIL_INGRESS_SECRET: 'short' }, { EMAIL_INGRESS_ENABLED: 'false', EMAIL_INGRESS_SECRET: secret }]) {
    await withReceiver(async ({ post, calls }) => { assert.equal((await post()).status, 503); assert.equal(calls.length, 0); }, { env });
  }
});

test('receiver verifies signed envelope and raw MIME before invoking the provider-independent ingester', async () => {
  await withReceiver(async ({ post, calls }) => {
    const response = await post();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accepted: true, receiptId: 1, state: 'matched', duplicate: false });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { provider: 'cloudflare', dedupeKey: 'cloudflare-inbound:fixture-event-12345678', envelopeFrom: 'customer@example.test', envelopeTo: ['sales@example.test'],
      receivedAt: new Date(clock - 10000), rawMime: mime, strictRecipient: true });
  });
});

test('tampered bodies, envelopes, timestamps and browser credentials cannot enter the raw receiver', async () => {
  await withReceiver(async ({ post, calls, base }) => {
    const valid = signed();
    for (const headers of [
      {}, { ...valid, [H.signature]: 'v1=' + '0'.repeat(64) },
      { ...valid, [H.from]: Buffer.from('attacker@example.test').toString('base64url') },
      { ...valid, [H.to]: Buffer.from('other@example.test').toString('base64url') },
      signed(mime, { timestamp: String(clock / 1000 - 301) }),
      signed(mime, { receivedAt: new Date(clock + 120000).toISOString() }),
      signed(mime, { eventId: '../invalid-event' }),
      { ...valid, cookie: 'session=fixture' }, { ...valid, authorization: 'Bearer fixture' },
    ]) assert.equal((await post(mime, headers)).status, 401);
    assert.equal((await post(Buffer.from('Tampered body'), valid)).status, 401);
    assert.equal((await post(Buffer.alloc(0), signed(Buffer.alloc(0)))).status, 401);
    assert.equal((await post(mime, { ...valid, 'content-type': 'application/json' })).status, 415);
    assert.equal((await fetch(base)).status, 405);
    assert.equal(calls.length, 0);
  });
});

test('signed deliveries larger than the MIME cap are rejected before ingestion', async () => {
  await withReceiver(async ({ post, calls }) => {
    const oversized = Buffer.alloc(EMAIL_INGRESS_MAX_BYTES + 1, 65);
    assert.equal((await post(oversized, signed(oversized))).status, 413);
    assert.equal(calls.length, 0);
  });
});

test('receiver exposes retryable failures and identity conflicts without accepting lost messages', async () => {
  for (const [statusCode, expected] of [[undefined, 503], [409, 409], [413, 413]]) {
    await withReceiver(async ({ post }) => {
      const response = await post();
      assert.equal(response.status, expected);
      assert.equal((await response.json()).accepted, undefined);
    }, { ingest: async () => { throw Object.assign(new Error('fixture ingestion unavailable'), { statusCode }); } });
  }
});

test('signature validation rejects noncanonical addresses and accepts an empty SMTP bounce sender', () => {
  const valid = signed();
  const parsed = readEmailIngressHeaders(valid, clock);
  assert.equal(parsed.envelopeTo, 'sales@example.test');
  assert.equal(readEmailIngressHeaders(signed(mime, { from: '' }), clock).envelopeFrom, '');
  for (const override of [
    { to: Buffer.from('line\r\nbreak@example.test').toString('base64url') },
    { to: 'not+base64==' }, { payloadHash: 'short' },
    { receivedAt: 'not-a-date' }, { timestamp: 'not-a-number' },
  ]) assert.equal(readEmailIngressHeaders(signed(mime, override), clock), null);
});

test('a busy receiver rejects additional MIME work and releases its slot after acknowledgement', async () => {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  await withReceiver(async ({ post }) => {
    const first = post();
    await entered;
    const busy = await post();
    assert.equal(busy.status, 503);
    assert.equal(busy.headers.get('retry-after'), '30');
    release();
    assert.equal((await first).status, 200);
    assert.equal((await post()).status, 200);
  }, { maxConcurrent: 1, ingest: async () => { enter(); await blocked; return { receipt: { id: 1, state: 'matched' } }; } });
});
