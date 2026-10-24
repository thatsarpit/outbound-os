import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/email-ingress/kv-worker.js';
import { kvMailSpool } from '../cloudflare/email-ingress/kv-spool.js';
import { relayStoredEmail, storeIncomingEmail, reconcileStoredMail } from '../cloudflare/email-ingress/worker.js';

const eventId = 'fixture-kv-email-delivery-123';
const clock = Date.parse('2026-10-24T00:00:00Z');
function fixture() {
  const entries = new Map(), queued = [];
  const namespace = {
    async put(key, value, options = {}) {
      entries.set(key, { value: await new Response(value).arrayBuffer(), metadata: options.metadata || null });
    },
    async getWithMetadata(key) { return entries.get(key) || { value: null, metadata: null }; },
    async list({ prefix, limit }) {
      return { keys: [...entries].filter(([key]) => key.startsWith(prefix)).slice(0, limit)
        .map(([name, row]) => ({ name, metadata: row.metadata })), list_complete: true };
    },
  };
  const env = { RELAY_ENABLED: 'true', EMAIL_INGRESS_SECRET: 'fixture-secret-longer-than-thirty-two-characters',
    EMAIL_INGRESS_URL: 'https://api.example.test/api/webhooks/email-ingress', MAIL_SPOOL_KV: namespace,
    MAIL_DELIVERIES: { async send(body, options) { queued.push({ body, options }); } } };
  const message = { from: 'sender@example.test', to: 'sales@example.test', rawSize: 10,
    raw: new TextEncoder().encode('Test email'), setReject() { throw new Error('Unexpected rejection'); } };
  return { env, message, entries, queued, namespace };
}

test('KV receiver awaits private original storage and enqueues only its object reference', async () => {
  const { env, message, entries, queued } = fixture();
  await worker.email(message, env);
  assert.equal(entries.size, 1);
  const [key, row] = [...entries][0];
  assert.equal(new TextDecoder().decode(row.value), 'Test email');
  assert.equal(row.metadata.to, message.to);
  assert.deepEqual(queued, [{ body: { action: 'PutObject', object: { key } }, options: { delaySeconds: 60 } }]);
  assert.equal((await worker.fetch()).status, 404);
});

test('KV quota/storage failure never acknowledges storage or enqueues a missing original', async () => {
  const { env, message, queued } = fixture();
  let rejection;
  message.setReject = reason => { rejection = reason; };
  env.MAIL_SPOOL_KV.put = async () => { throw new Error('Free write quota exhausted'); };
  await worker.email(message, env);
  assert.match(rejection, /temporarily unavailable/);
  assert.equal(queued.length, 0);
});

test('KV stores an Email Routing stream as a bounded value with known length', async () => {
  const { env, message, namespace, entries } = fixture();
  const put = namespace.put;
  namespace.put = async (key, value, options) => {
    assert.ok(value instanceof ArrayBuffer);
    return put(key, value, options);
  };
  message.raw = new Response(message.raw).body;
  await worker.email(message, env);
  assert.equal(entries.size, 1);
});

test('KV delayed visibility retries instead of acknowledging or discarding the email', async () => {
  const { env, message, entries, namespace } = fixture();
  const bound = { ...env, MAIL_SPOOL: kvMailSpool(namespace) };
  const key = await storeIncomingEmail(message, bound, { eventId, now: clock });
  const get = namespace.getWithMetadata;
  namespace.getWithMetadata = async name => name === key ? { value: null, metadata: null } : get(name);
  await assert.rejects(relayStoredEmail(key, bound), /missing/);
  assert.ok(entries.has(key));
  namespace.getWithMetadata = get;
  await relayStoredEmail(key, bound, { now: clock, fetcher: async () => new Response(JSON.stringify({ accepted: true, receiptId: 1, state: 'matched' }), { headers: { 'content-type': 'application/json' } }) });
  assert.ok(entries.has(`accepted/${eventId}.json`));
});

test('failed initial enqueue leaves an original that bounded recovery can find', async () => {
  const { env, message, namespace, entries, queued } = fixture();
  env.MAIL_DELIVERIES.send = async () => { throw new Error('Queue unavailable'); };
  await worker.email(message, env);
  assert.equal(entries.size, 1);
  const key = [...entries.keys()][0];
  env.MAIL_DELIVERIES.send = async body => { queued.push(body); };
  await reconcileStoredMail({ ...env, MAIL_SPOOL: kvMailSpool(namespace) }, { now: Date.now() + 2 * 3_600_000 });
  assert.deepEqual(queued, [{ action: 'Reconcile', object: { key } }]);
});
