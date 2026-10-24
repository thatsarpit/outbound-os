import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { storeIncomingEmail, relayStoredEmail, reconcileStoredMail, signedDeliveryHeaders } from '../cloudflare/email-ingress/worker.js';
import { readEmailIngressHeaders, verifyEmailIngressSignature, EMAIL_INGRESS_MAX_BYTES } from '../src/utils/emailIngressSignature.js';

const clock = Date.parse('2026-10-24T00:00:00.000Z');
const eventId = 'fixture-relay-event-123456';
const raw = Buffer.from('From: customer@example.test\r\nTo: sales@example.test\r\nSubject: Fictional enquiry\r\n\r\nPlease share the details.');
function fixture() {
  const entries = new Map(), queued = [];
  const env = { RELAY_ENABLED: 'true', EMAIL_INGRESS_SECRET: 'fixture-relay-secret-with-at-least-32-characters', EMAIL_INGRESS_URL: 'https://api.example.test/api/webhooks/email-ingress',
    MAIL_DELIVERIES: { send: async body => { queued.push(body); } },
    MAIL_SPOOL: {
      async put(key, value, options = {}) {
        const bytes = Buffer.from(await new Response(value).arrayBuffer());
        entries.set(key, { bytes, customMetadata: options.customMetadata || {}, uploaded: new Date(clock - 2 * 3_600_000) });
      },
      async get(key) {
        const row = entries.get(key);
        return row ? { size: row.bytes.length, customMetadata: row.customMetadata,
          arrayBuffer: async () => Uint8Array.from(row.bytes).buffer, json: async () => JSON.parse(row.bytes.toString()) } : null;
      },
      async head(key) { return entries.has(key) ? { key } : null; },
      async list({ prefix, limit }) {
        return { objects: [...entries.entries()].filter(([key]) => key.startsWith(prefix)).slice(0, limit).map(([key, row]) => ({ key, uploaded: row.uploaded })), truncated: false };
      },
    },
  };
  const incoming = (overrides = {}) => ({ from: 'customer@example.test', to: 'sales@example.test', rawSize: raw.length, raw,
    setReject: reason => { incoming.rejected = reason; }, ...overrides });
  const capture = async () => storeIncomingEmail(incoming(), env, { eventId, now: clock - 2 * 3_600_000 });
  return { env, incoming, entries, queued, capture };
}
const ack = () => new Response(JSON.stringify({ accepted: true, receiptId: 7, state: 'matched' }), { headers: { 'content-type': 'application/json' } });

test('Cloudflare WebCrypto HMAC matches the backend signature contract for the full raw body and envelope', async () => {
  const { env } = fixture();
  const headers = await signedDeliveryHeaders({ secret: env.EMAIL_INGRESS_SECRET, eventId, from: 'customer@example.test', to: 'sales@example.test', receivedAt: new Date(clock - 1000).toISOString(), raw, now: clock });
  const parsed = readEmailIngressHeaders(headers, clock);
  assert.ok(parsed);
  assert.equal(verifyEmailIngressSignature(parsed, raw, env.EMAIL_INGRESS_SECRET), true);
  assert.equal(verifyEmailIngressSignature(parsed, Buffer.from('Changed'), env.EMAIL_INGRESS_SECRET), false);
});

test('email handler awaits original storage and does not need the VM or a successful separate enqueue to retain mail', async () => {
  const { env, incoming, entries } = fixture();
  const key = await storeIncomingEmail(incoming(), env, { eventId, now: clock });
  assert.deepEqual(entries.get(key).bytes, raw);
  assert.equal(entries.get(key).customMetadata.to, 'sales@example.test');
  assert.equal(entries.get(key).customMetadata.receivedAt, new Date(clock).toISOString());
  env.MAIL_SPOOL.put = async () => { throw new Error('R2 unavailable'); };
  await assert.rejects(storeIncomingEmail(incoming(), env), /R2 unavailable/);
});

test('relay remains inactive by default, restricts backend URLs and rejects oversized raw MIME', async () => {
  const { env, incoming, entries } = fixture();
  await assert.rejects(storeIncomingEmail(incoming(), { ...env, RELAY_ENABLED: 'false' }), /not configured/);
  for (const url of ['http://api.example.test/api/webhooks/email-ingress', 'https://user:secret@api.example.test/api/webhooks/email-ingress', 'https://api.example.test/api/other', 'https://api.example.test/api/webhooks/email-ingress?token=bad']) {
    await assert.rejects(storeIncomingEmail(incoming(), { ...env, EMAIL_INGRESS_URL: url }), /Invalid email ingress/);
  }
  const oversized = incoming({ rawSize: EMAIL_INGRESS_MAX_BYTES + 1 });
  await storeIncomingEmail(oversized, env);
  assert.match(incoming.rejected, /size limit/);
  assert.equal(entries.size, 0);
});

test('successful delivery requires a durable JSON acknowledgement and replays avoid another backend call', async () => {
  const { env, entries, capture } = fixture();
  const key = await capture();
  let count = 0;
  const fetcher = async (url, options) => {
    count++;
    assert.equal(url, env.EMAIL_INGRESS_URL);
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'POST');
    const parsed = readEmailIngressHeaders(options.headers, clock);
    assert.equal(verifyEmailIngressSignature(parsed, Buffer.from(options.body), env.EMAIL_INGRESS_SECRET), true);
    return ack();
  };
  await relayStoredEmail(key, env, { fetcher, now: clock });
  await relayStoredEmail(key, env, { fetcher, now: clock + 60000 });
  assert.equal(count, 1);
  assert.ok(entries.has(key), 'original MIME stays private for deliberate retention/recovery');
  assert.deepEqual(JSON.parse(entries.get(`accepted/${eventId}.json`).bytes), { receiptId: 7, state: 'matched', acceptedAt: new Date(clock).toISOString() });
});

test('VM outages, HTML login pages and missing receipt acknowledgements never mark original mail accepted', async () => {
  for (const response of [new Response('Unavailable', { status: 503 }), new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } }), new Response(JSON.stringify({ accepted: true }), { headers: { 'content-type': 'application/json' } })]) {
    const { env, entries, capture } = fixture();
    const key = await capture();
    await assert.rejects(relayStoredEmail(key, env, { fetcher: async () => response, now: clock }), /acknowledge|acknowledgement/);
    assert.ok(entries.has(key));
    assert.equal(entries.has(`accepted/${eventId}.json`), false);
  }
});

test('bounded reconciliation requeues unacknowledged old originals and throttles repeated recovery attempts', async () => {
  const { env, entries, queued, capture } = fixture();
  const key = await capture();
  const put = env.MAIL_SPOOL.put;
  let cursorWrites = 0;
  env.MAIL_SPOOL.put = async (name, ...args) => { if (name === 'relay-state/reconcile.json') cursorWrites++; return put(name, ...args); };
  await reconcileStoredMail(env, { now: clock });
  assert.deepEqual(queued, [{ action: 'Reconcile', object: { key } }]);
  await reconcileStoredMail(env, { now: clock + 600000 });
  assert.equal(queued.length, 1);
  assert.equal(cursorWrites, 1, 'an unchanged recovery cursor does not consume another Free KV write');
  assert.deepEqual(JSON.parse(entries.get('relay-state/reconcile.json').bytes), { cursor: null });
  await reconcileStoredMail(env, { now: clock + 25 * 3_600_000 });
  assert.equal(queued.length, 2);
  await relayStoredEmail(key, env, { fetcher: async () => ack(), now: clock });
  await reconcileStoredMail(env, { now: clock + 50 * 3_600_000 });
  assert.equal(queued.length, 2, 'accepted originals are not requeued');
});

test('failed Queue delivery explicitly retries and does not expose raw mail over HTTP', async () => {
  const { env } = fixture();
  let acknowledged = false, retry;
  await worker.queue({ messages: [{ body: { action: 'PutObject', object: { key: `incoming/${eventId}.eml` } }, attempts: 2,
    ack: () => { acknowledged = true; }, retry: options => { retry = options; } }] }, env);
  assert.equal(acknowledged, false);
  assert.deepEqual(retry, { delaySeconds: 120 });
  assert.equal((await worker.fetch()).status, 404);
});
