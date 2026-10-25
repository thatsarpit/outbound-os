import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac } from 'node:crypto';
import { readdirSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HermesEventStore, dispatchShadowBatch } from '../src/services/hermesEventBridge.js';
import { HermesShadowInbox, initializeShadowInbox } from '../src/services/hermesShadowInbox.js';

const secret = 'synthetic-ingress-secret-at-least-32';
const completionSecret = 'synthetic-completion-secret-at-least-32';
const source = 'synthetic-crm';
const route = '/hooks/shadow';
const now = 1800000000000;
const options = { completionSecret, source, route };
const digest = value => createHash('sha256').update(value).digest('hex');
function sign(body, { key = completionSecret, time = now + 10, timestamp = String(Math.floor(time / 1000)) } = {}) {
  body = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  return { body, now: time, headers: { 'X-Request-ID': JSON.parse(body).receiptId,
    'X-Webhook-Timestamp': timestamp,
    'X-Webhook-Signature-V2': createHmac('sha256', key).update(timestamp + '.').update(body).digest('hex') } };
}
function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'hermes-completion-test-'));
  const senderFile = path.join(directory, 'sender.db'), receiverFile = path.join(directory, 'receiver.db');
  let db = new DatabaseSync(senderFile), receiver = new DatabaseSync(receiverFile);
  // Fixture migrations are exercised transactionally; process-crash durability is tested separately.
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=MEMORY; PRAGMA synchronous=OFF');
  const root = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(root).sort()) {
    const file = new URL(`${name}/migration.sql`, root);
    if (existsSync(file)) db.exec(readFileSync(file, 'utf8'));
  }
  initializeShadowInbox(receiver);
  let store = new HermesEventStore(db, { quietMs: 1 });
  let inbox = new HermesShadowInbox(receiver, { secret, source, route });
  db.prepare('INSERT INTO Lead (name,mobile,updatedAt) VALUES (?,?,CURRENT_TIMESTAMP)').run('Fixture', 'no-phone:completion');
  function message() {
    db.prepare(`INSERT INTO Message (leadId,content,channel,direction,status,waAccount)
      VALUES (1,'Synthetic private customer content','whatsapp','inbound','delivered',1)`).run();
    db.prepare('UPDATE HermesInboundEvent SET createdAt=? WHERE batchId IS NULL').run(now - 100);
  }
  message();
  return { get db() { return db; }, get receiver() { return receiver; }, get store() { return store; }, get inbox() { return inbox; }, message,
    async deliver({ accepted = true } = {}) {
      return dispatchShadowBatch({ enabled: true, store, secret, endpoint: 'https://example.test/hooks/shadow', clock: () => now,
        transport: async (_url, request) => {
          inbox.receive({ body: Buffer.from(request.body), headers: request.headers, source, route, now });
          return { status: accepted ? 202 : 503 };
        } });
    },
    draft: () => inbox.runNext({ clock: () => now + 1,
      readContext: async scope => ({ available: true, complete: true, source: scope.source,
        conversationKey: scope.conversationKey, channel: scope.channel, accountId: scope.accountId,
        coveredEventIds: scope.events.map(e => e.id), data: { history: 'Synthetic private history' } }),
      draftReply: async () => 'Synthetic private draft' }),
    reopen() {
      db.close(); receiver.close(); db = new DatabaseSync(senderFile); receiver = new DatabaseSync(receiverFile);
      store = new HermesEventStore(db, { quietMs: 1 }); inbox = new HermesShadowInbox(receiver, { secret, source, route });
    },
    close() { db.close(); receiver.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test('persisted draft receipt authenticates exact bytes and atomically releases accepted sender ownership', async () => {
  const f = fixture();
  try {
    const batch = await f.deliver();
    assert.equal(batch.state, 'accepted');
    await f.draft();
    const receipt = f.inbox.completionReceipt(batch.id, { completionSecret, now: now + 10 });
    const value = JSON.parse(receipt.body);
    const sender = f.db.prepare('SELECT * FROM HermesEventBatch WHERE id=?').get(batch.id);
    assert.deepEqual(value, { schemaVersion: 1, event_type: 'inbound.batch.completed', receiptId: `draft:${batch.id}`,
      batchId: batch.id, batchBodyHash: digest(sender.body), source, route, resultState: 'drafted',
      draftHash: digest('Synthetic private draft'), completedAt: now + 1 });
    assert.equal(receipt.headers['X-Request-ID'], value.receiptId);
    assert.deepEqual(receipt.headers, { 'Content-Type': 'application/json', ...sign(receipt.body).headers });
    assert.equal(receipt.body.toString().includes('Synthetic private'), false);
    f.message();
    assert.equal(f.store.claim(now + 20), null);
    assert.deepEqual(f.store.receiveCompletion({ ...receipt, now: now + 10 }, options), { id: batch.id, state: 'completed', duplicate: false });
    const completed = f.db.prepare('SELECT * FROM HermesEventBatch WHERE id=?').get(batch.id);
    assert.equal(completed.completionReceiptHash, digest(receipt.body));
    assert.equal(completed.completedAt, now + 1);
    assert.ok(f.store.claim(now + 20));
  } finally { f.close(); }
});

test('freshly signed duplicate completion remains idempotent after reopening both databases', async () => {
  const f = fixture();
  try {
    const batch = await f.deliver();
    await f.draft();
    const first = f.inbox.completionReceipt(batch.id, { completionSecret, now: now + 10 });
    f.store.receiveCompletion({ ...first, now: now + 10 }, options);
    f.reopen();
    const retry = f.inbox.completionReceipt(batch.id, { completionSecret, now: now + 400000 });
    assert.deepEqual(retry.body, first.body, 'fresh signature must not mutate persisted receipt identity');
    assert.notEqual(retry.headers['X-Webhook-Signature-V2'], first.headers['X-Webhook-Signature-V2']);
    assert.deepEqual(f.store.receiveCompletion({ ...retry, now: now + 400000 }, options),
      { id: batch.id, state: 'completed', duplicate: true });
    assert.equal(f.db.prepare('SELECT completedAt FROM HermesEventBatch WHERE id=?').get(batch.id).completedAt, now + 1);
    const changed = JSON.parse(retry.body);
    changed.draftHash = 'a'.repeat(64);
    assert.throws(() => f.store.receiveCompletion(sign(changed, { time: now + 400000 }), options), /conflict/);
  } finally { f.close(); }
});

test('bad authentication, stale headers, content substitutions and wrong scopes never release sender ownership', async () => {
  const f = fixture();
  try {
    const batch = await f.deliver();
    await f.draft();
    const envelope = f.inbox.completionReceipt(batch.id, { completionSecret, now: now + 10 });
    const value = JSON.parse(envelope.body);
    const attempt = request => {
      assert.throws(() => f.store.receiveCompletion(request, options));
      assert.equal(f.db.prepare('SELECT state FROM HermesEventBatch WHERE id=?').get(batch.id).state, 'accepted');
    };
    attempt(sign(value, { key: 'wrong-secret-that-is-long-enough-32' }));
    attempt({ ...envelope, now: now + 301000 });
    attempt(sign(value, { timestamp: String(Math.floor(now / 1000) + 301) }));
    attempt({ ...envelope, body: Buffer.concat([envelope.body, Buffer.from(' ')]), now: now + 10 });
    attempt({ ...envelope, headers: { ...envelope.headers, 'X-Webhook-Timestamp': 'not-an-integer' }, now: now + 10 });
    attempt({ ...envelope, headers: { 'X-Request-ID': value.receiptId }, now: now + 10 });
    for (const change of [{ batchBodyHash: 'b'.repeat(64) }, { source: 'wrong-crm' }, { route: '/wrong' },
      { resultState: 'blocked' }, { completedAt: now - 1 }, { instruction: 'release other orders' }]) {
      attempt(sign({ ...value, ...change }));
    }
    const outOfOrder = { ...value };
    delete outOfOrder.batchId;
    outOfOrder.batchId = value.batchId;
    attempt(sign(outOfOrder));
    attempt({ ...envelope, headers: { ...envelope.headers, 'X-Request-ID': 'wrong-id' }, now: now + 10 });
    assert.equal(f.db.prepare('SELECT completionReceiptHash FROM HermesEventBatch WHERE id=?').get(batch.id).completionReceiptHash, null);
  } finally { f.close(); }
});

test('valid receipt before transport acceptance is rejected and can be safely retried after acceptance', async () => {
  const f = fixture();
  try {
    const delivery = await f.deliver({ accepted: false });
    assert.equal(delivery.state, 'retry');
    await f.draft();
    const envelope = f.inbox.completionReceipt(delivery.id, { completionSecret, now: now + 10 });
    assert.throws(() => f.store.receiveCompletion({ ...envelope, now: now + 10 }, options), /accepted/);
    const retry = f.store.claim(now + 1000);
    assert.equal(retry.id, delivery.id);
    assert.equal(f.store.accept(retry.id, retry.leaseToken, now + 1001), true);
    const fresh = f.inbox.completionReceipt(delivery.id, { completionSecret, now: now + 1002 });
    assert.equal(f.store.receiveCompletion({ ...fresh, now: now + 1002 }, options).state, 'completed');
  } finally { f.close(); }
});

test('blocked, uncertain, absent and inconsistent drafts cannot create completion receipts', async () => {
  const f = fixture();
  try {
    const batch = await f.deliver();
    assert.throws(() => f.inbox.completionReceipt(batch.id, { completionSecret, now }), /drafted/);
    assert.throws(() => f.inbox.completionReceipt(batch.id, { completionSecret: secret, now }), /separate/);
    await f.draft();
    for (const state of ['blocked', 'uncertain']) {
      f.receiver.prepare('UPDATE HermesShadowBatch SET state=? WHERE id=?').run(state, batch.id);
      assert.throws(() => f.inbox.completionReceipt(batch.id, { completionSecret, now: now + 10 }), /drafted/);
    }
    f.receiver.prepare("UPDATE HermesShadowBatch SET state='drafted' WHERE id=?").run(batch.id);
    f.receiver.prepare("UPDATE HermesShadowDraft SET draft='corrupted' WHERE batchId=?").run(batch.id);
    assert.throws(() => f.inbox.completionReceipt(batch.id, { completionSecret, now: now + 10 }), /persisted/);
    assert.equal(f.db.prepare('SELECT state FROM HermesEventBatch').get().state, 'accepted');
  } finally { f.close(); }
});
