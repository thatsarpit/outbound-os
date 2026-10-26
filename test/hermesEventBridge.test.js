import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const bridgeMigration = '20261025180000_hermes_shadow_events';

function fixture({ includeBridge = true } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'hermes-event-test-'));
  const filename = path.join(directory, 'fixture.db');
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=MEMORY; PRAGMA synchronous=OFF');
  const root = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(root).sort()) {
    if (!includeBridge && name === bridgeMigration) continue;
    const file = new URL(`${name}/migration.sql`, root);
    if (existsSync(file)) db.exec(readFileSync(file, 'utf8'));
  }
  const leadId = Number(db.prepare('INSERT INTO Lead (name,mobile,updatedAt) VALUES (?,?,CURRENT_TIMESTAMP)').run('Fixture','no-phone:hermes-fixture').lastInsertRowid);
  return { db, filename, directory, leadId, close() { db.close(); rmSync(directory, { recursive: true, force: true }); } };
}

function message(db, leadId, { channel = 'whatsapp', direction = 'inbound', status = 'delivered', kind = null } = {}) {
  return Number(db.prepare('INSERT INTO Message (leadId,content,channel,direction,status,waAccount,emailInboundKind) VALUES (?,?,?,?,?,?,?)')
    .run(leadId, 'Synthetic content never copied into the event', channel, direction, status, 1, kind).lastInsertRowid);
}

test('WhatsApp message and canonical event commit or roll back together', () => {
  const f = fixture();
  try {
    f.db.exec('BEGIN');
    message(f.db, f.leadId);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 1);
    f.db.exec('ROLLBACK');
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM Message').get().n, 0);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 0);
    const id = message(f.db, f.leadId);
    const event = f.db.prepare('SELECT * FROM HermesInboundEvent').get();
    assert.equal(event.id, `message:${id}:received`);
    assert.equal(event.messageId, id);
    assert.equal(event.channel, 'whatsapp');
    assert.ok(!JSON.stringify(event).includes('Synthetic content'));
  } finally { f.close(); }
});

test('coalesced batches persist their immutable identity and serialize each conversation', async () => {
  const { HermesEventStore } = await import('../src/services/hermesEventBridge.js');
  const f = fixture();
  try {
    message(f.db, f.leadId);
    message(f.db, f.leadId);
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=?').run(1000);
    const store = new HermesEventStore(f.db, { quietMs: 100, maxWaitMs: 500 });
    assert.equal(store.claim(1050), null);
    const first = store.claim(1200);
    assert.equal(JSON.parse(first.body).events.length, 2);
    assert.equal(JSON.parse(first.body).mode, 'shadow');
    message(f.db, f.leadId);
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1300 WHERE batchId IS NULL').run();
    assert.equal(store.claim(1500), null);
    assert.equal(store.accept(first.id, 'wrong-token', 1500), false);
    assert.equal(store.accept(first.id, first.leaseToken, 1500), true);
    assert.equal(store.claim(2000), null, 'HTTP acceptance does not release downstream ownership');
    assert.equal(store.complete(first.id, 2100), true);
    assert.ok(store.claim(2200));
  } finally { f.close(); }
});

test('sender maxEvents rejects incompatible limits before assigning events and its 50-event maximum is receivable', async () => {
  const { HermesEventStore } = await import('../src/services/hermesEventBridge.js');
  const { HermesShadowInbox, initializeShadowInbox } = await import('../src/services/hermesShadowInbox.js');
  const { createHmac } = await import('node:crypto');
  const f = fixture();
  const receiver = new DatabaseSync(path.join(f.directory, 'receiver.db'));
  try {
    for (let i = 0; i < 51; i++) message(f.db, f.leadId);
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000').run();
    for (const maxEvents of [51, Number.MAX_SAFE_INTEGER, Infinity, 0, -1, 1.5, '50', NaN]) {
      assert.throws(() => new HermesEventStore(f.db, { quietMs: 100, maxEvents }).claim(1200), /Invalid maxEvents/);
    }
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesEventBatch').get().n, 0);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent WHERE batchId IS NOT NULL').get().n, 0);
    assert.equal(new HermesEventStore(f.db, { maxEvents: 1 }).maxEvents, 1);
    assert.equal(new HermesEventStore(f.db).maxEvents, 50);
    const batch = new HermesEventStore(f.db, { quietMs: 100, maxEvents: 50 }).claim(1200);
    assert.equal(JSON.parse(batch.body).events.length, 50);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent WHERE batchId IS NULL').get().n, 1);
    initializeShadowInbox(receiver);
    const secret = 'synthetic-batch-limit-secret-at-least-32', source = 'synthetic-crm', route = '/hooks/shadow';
    const inbox = new HermesShadowInbox(receiver, { secret, source, route });
    assert.equal(inbox.receive({ body: Buffer.from(batch.body), source, route, now: 1200, headers: {
      'X-Request-ID': batch.id, 'X-Webhook-Timestamp': '1',
      'X-Webhook-Signature-V2': createHmac('sha256', secret).update(`1.${batch.body}`).digest('hex'),
    } }).state, 'queued');
    assert.equal(receiver.prepare('SELECT count(*) AS n FROM HermesShadowEvent').get().n, 50);
  } finally { receiver.close(); f.close(); }
});

test('network outage and 429/5xx retry state survives reopening with the same delivery identity', async () => {
  const { HermesEventStore } = await import('../src/services/hermesEventBridge.js');
  const f = fixture();
  let other;
  try {
    message(f.db, f.leadId);
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000').run();
    let store = new HermesEventStore(f.db, { quietMs: 100, leaseMs: 100 });
    const first = store.claim(1200);
    assert.equal(store.retry(first.id, first.leaseToken, { status: 429, retryAfter: '2', now: 1250 }), true);
    other = new DatabaseSync(f.filename);
    store = new HermesEventStore(other, { quietMs: 100, leaseMs: 100 });
    assert.equal(store.claim(3249), null);
    const second = store.claim(3250);
    assert.equal(second.id, first.id);
    assert.equal(second.body, first.body);
    assert.equal(second.attempts, 2);
    assert.equal(store.retry(second.id, second.leaseToken, { status: 503, now: 3260 }), true);
    const failed = other.prepare('SELECT * FROM HermesEventBatch WHERE id=?').get(first.id);
    assert.ok(failed.nextAttemptAt > 3260);
    const third = store.claim(failed.nextAttemptAt);
    assert.equal(store.retry(third.id, third.leaseToken, { status: null, now: failed.nextAttemptAt + 1 }), true);
    assert.equal(other.prepare('SELECT state FROM HermesEventBatch').get().state, 'pending');
  } finally { other?.close(); f.close(); }
});

test('disabled transport never claims work; enabled shadow transport signs exact stable bytes', async () => {
  const { HermesEventStore, dispatchShadowBatch } = await import('../src/services/hermesEventBridge.js');
  const { createHmac } = await import('node:crypto');
  const f = fixture();
  try {
    message(f.db, f.leadId);
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000').run();
    const store = new HermesEventStore(f.db, { quietMs: 100 });
    const calls = [];
    const options = { store, endpoint: 'https://hermes.example.test/hooks/shadow', secret: 'synthetic-fixture-secret-at-least-32',
      clock: () => 1200, transport: async (url, request) => { calls.push({ url, ...request }); return { status: 202 }; } };
    assert.deepEqual(await dispatchShadowBatch(options), { state: 'disabled' });
    assert.equal(calls.length, 0);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesEventBatch').get().n, 0);
    const result = await dispatchShadowBatch({ ...options, enabled: true });
    assert.equal(result.state, 'accepted');
    const request = calls[0];
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers['X-Request-ID'], result.id);
    const timestamp = request.headers['X-Webhook-Timestamp'];
    assert.equal(request.headers['X-Webhook-Signature-V2'], createHmac('sha256', options.secret).update(`${timestamp}.${request.body}`).digest('hex'));
    assert.equal(JSON.parse(request.body).event_type, 'inbound.batch');
    assert.equal(JSON.parse(request.body).mode, 'shadow');
    assert.equal(await dispatchShadowBatch({ ...options, enabled: true }).then(r => r.state), 'idle');
  } finally { f.close(); }
});

function receipt(db, { state = 'pending', messageId = null, key = 'synthetic-receipt-1' } = {}) {
  return Number(db.prepare(`INSERT INTO InboundEmailReceipt
    (provider,dedupeKey,payloadHash,envelopeFrom,envelopeTo,state,messageId)
    VALUES ('imap',?,'synthetic','sender@example.test','[]',?,?)`).run(key, state, messageId).lastInsertRowid);
}

test('human email partial upgrade emits once; automatic replies and outbound drafts never emit', () => {
  const f = fixture();
  try {
    const id = message(f.db, f.leadId, { channel: 'email', kind: 'pending', status: 'partial' });
    for (const kind of ['automatic_reply', 'delivery_report', null]) message(f.db, f.leadId, { channel: 'email', kind });
    for (const channel of ['whatsapp', 'email']) message(f.db, f.leadId, { channel, direction: 'outbound', kind: 'human', status: 'draft' });
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 0);
    f.db.prepare("UPDATE Message SET status='delivered',emailInboundKind='human' WHERE id=?").run(id);
    f.db.prepare("UPDATE Message SET status='delivered',emailInboundKind='human' WHERE id=?").run(id);
    receipt(f.db, { state: 'matched', messageId: id });
    receipt(f.db, { state: 'matched', messageId: id, key: 'other-provider-overlap' });
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 1);
    assert.equal(f.db.prepare('SELECT messageId FROM HermesInboundEvent').get().messageId, id);
  } finally { f.close(); }
});

test('email upgrades do not backfill already-usable historical human messages', () => {
  const f = fixture({ includeBridge: false });
  try {
    const historical = message(f.db, f.leadId, { channel: 'email', kind: 'human' });
    const partial = message(f.db, f.leadId, { channel: 'email', kind: 'human', status: 'partial' });
    const pending = message(f.db, f.leadId, { channel: 'email', kind: 'pending', status: 'partial' });
    const unclassified = message(f.db, f.leadId, { channel: 'email', kind: null });
    f.db.exec(readFileSync(new URL(`../prisma/migrations/${bridgeMigration}/migration.sql`, import.meta.url), 'utf8'));
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 0);
    f.db.prepare("UPDATE Message SET status='read' WHERE id=?").run(historical);
    f.db.prepare("UPDATE Message SET emailInboundKind='human',status='acknowledged' WHERE id=?").run(historical);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 0,
      'read/acknowledgement changes are not a new usable-content transition');
    const inserted = message(f.db, f.leadId, { channel: 'email', kind: 'human' });
    f.db.prepare("UPDATE Message SET status='delivered' WHERE id=?").run(partial);
    f.db.prepare("UPDATE Message SET status='delivered',emailInboundKind='human' WHERE id=?").run(pending);
    f.db.prepare("UPDATE Message SET emailInboundKind='human' WHERE id=?").run(unclassified);
    for (const id of [inserted, partial, pending, unclassified]) {
      f.db.prepare("UPDATE Message SET status='read',emailInboundKind='human' WHERE id=?").run(id);
    }
    assert.deepEqual(f.db.prepare('SELECT messageId FROM HermesInboundEvent ORDER BY messageId').all().map(e => e.messageId),
      [partial, pending, unclassified, inserted]);
  } finally { f.close(); }
});

test('email upgrade qualification treats NULL old kind/status as nonqualifying and NULL new status as unusable', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'hermes-email-null-test-'));
  const db = new DatabaseSync(path.join(directory, 'nullable-fixture.db'));
  try {
    // The real Message status is NOT NULL. A reduced schema exercises the trigger's SQL NULL semantics explicitly.
    db.exec(`CREATE TABLE Message (id INTEGER PRIMARY KEY,leadId INTEGER,content TEXT,channel TEXT,
      direction TEXT,status TEXT,waAccount INTEGER,emailAccountId INTEGER,emailInboundKind TEXT);
      CREATE TABLE InboundEmailReceipt (id INTEGER PRIMARY KEY,state TEXT,messageId INTEGER,emailAccountId INTEGER);`);
    db.exec(readFileSync(new URL(`../prisma/migrations/${bridgeMigration}/migration.sql`, import.meta.url), 'utf8'));
    const nullStatus = message(db, 1, { channel: 'email', kind: 'human', status: null });
    const nullKind = message(db, 1, { channel: 'email', kind: null });
    db.prepare("UPDATE Message SET emailInboundKind='human' WHERE id=?").run(nullStatus);
    assert.equal(db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 0);
    db.prepare("UPDATE Message SET status='delivered' WHERE id=?").run(nullStatus);
    db.prepare("UPDATE Message SET emailInboundKind='human' WHERE id=?").run(nullKind);
    assert.deepEqual(db.prepare('SELECT messageId FROM HermesInboundEvent ORDER BY messageId').all().map(e => e.messageId),
      [nullStatus, nullKind]);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('unmatched receipt updates do not backfill historical unmatched unlinked receipts', () => {
  const f = fixture({ includeBridge: false });
  try {
    const historical = receipt(f.db, { state: 'unmatched' });
    const pending = receipt(f.db, { key: 'pending-receipt' });
    const partial = receipt(f.db, { state: 'partial', key: 'partial-receipt' });
    const linkedMessage = message(f.db, f.leadId, { channel: 'email', kind: 'automatic_reply' });
    const matched = receipt(f.db, { state: 'matched', messageId: linkedMessage, key: 'matched-receipt' });
    const linked = receipt(f.db, { state: 'unmatched', messageId: linkedMessage, key: 'linked-receipt' });
    f.db.exec(readFileSync(new URL(`../prisma/migrations/${bridgeMigration}/migration.sql`, import.meta.url), 'utf8'));
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 0);
    f.db.prepare("UPDATE InboundEmailReceipt SET state='unmatched' WHERE id=?").run(historical);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 0,
      'retrying an already-unmatched historical receipt is not a new transition');
    f.db.prepare('UPDATE InboundEmailReceipt SET messageId=NULL WHERE id=?').run(historical);
    f.db.prepare("UPDATE InboundEmailReceipt SET state='matched',messageId=? WHERE id=?").run(linkedMessage, matched);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 0);
    const inserted = receipt(f.db, { state: 'unmatched', key: 'new-unmatched-receipt' });
    for (const id of [pending, partial]) {
      f.db.prepare("UPDATE InboundEmailReceipt SET state='unmatched' WHERE id=?").run(id);
    }
    f.db.prepare('UPDATE InboundEmailReceipt SET messageId=NULL WHERE id=?').run(linked);
    for (const id of [historical, pending, partial, linked, inserted]) {
      f.db.prepare("UPDATE InboundEmailReceipt SET state='unmatched',messageId=NULL WHERE id=?").run(id);
    }
    assert.deepEqual(f.db.prepare('SELECT receiptId FROM HermesInboundEvent ORDER BY receiptId').all().map(e => e.receiptId),
      [pending, partial, linked, inserted]);
  } finally { f.close(); }
});

test('unmatched receipt updates treat NULL old state as nonqualifying and NULL new state as unusable', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'hermes-receipt-null-test-'));
  const db = new DatabaseSync(path.join(directory, 'nullable-fixture.db'));
  try {
    // Receipt state is NOT NULL in the real schema; exercise three-valued SQL qualification explicitly.
    db.exec(`CREATE TABLE Message (id INTEGER PRIMARY KEY);
      CREATE TABLE InboundEmailReceipt (id INTEGER PRIMARY KEY,state TEXT,messageId INTEGER,emailAccountId INTEGER);`);
    db.exec(readFileSync(new URL(`../prisma/migrations/${bridgeMigration}/migration.sql`, import.meta.url), 'utf8'));
    db.exec('INSERT INTO InboundEmailReceipt (id,state,messageId) VALUES (1,NULL,NULL)');
    db.exec('UPDATE InboundEmailReceipt SET messageId=NULL WHERE id=1');
    assert.equal(db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 0);
    db.exec("UPDATE InboundEmailReceipt SET state='unmatched' WHERE id=1");
    db.exec("UPDATE InboundEmailReceipt SET state='unmatched',messageId=NULL WHERE id=1");
    assert.deepEqual(db.prepare('SELECT receiptId FROM HermesInboundEvent').all().map(e => e.receiptId), [1]);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('unmatched receipts are durable review events and repeat transitions cannot duplicate them', () => {
  const f = fixture();
  try {
    const id = receipt(f.db);
    f.db.exec('BEGIN');
    f.db.prepare("UPDATE InboundEmailReceipt SET state='unmatched' WHERE id=?").run(id);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 1);
    f.db.exec('ROLLBACK');
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 0);
    f.db.prepare("UPDATE InboundEmailReceipt SET state='unmatched' WHERE id=?").run(id);
    f.db.prepare("UPDATE InboundEmailReceipt SET state='unmatched' WHERE id=?").run(id);
    const event = f.db.prepare('SELECT * FROM HermesInboundEvent').get();
    assert.equal(event.id, `receipt:${id}:unmatched`);
    assert.equal(event.leadId, null);
    assert.equal(event.eventType, 'inbound.receipt_unmatched');
    assert.ok(!JSON.stringify(event).includes('sender@example.test'));
    assert.throws(() => receipt(f.db), /UNIQUE/);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 1);
  } finally { f.close(); }
});

test('expired leases recover one immutable batch and reject late acknowledgements from the old worker', async () => {
  const { HermesEventStore } = await import('../src/services/hermesEventBridge.js');
  const f = fixture();
  let other;
  try {
    message(f.db, f.leadId);
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000').run();
    const firstStore = new HermesEventStore(f.db, { quietMs: 100, leaseMs: 100 });
    const first = firstStore.claim(1200);
    other = new DatabaseSync(f.filename);
    const recoveredStore = new HermesEventStore(other, { quietMs: 100, leaseMs: 100 });
    assert.equal(recoveredStore.claim(1299), null);
    const recovered = recoveredStore.claim(1300);
    assert.equal(recovered.id, first.id);
    assert.equal(recovered.body, first.body);
    assert.notEqual(recovered.leaseToken, first.leaseToken);
    assert.equal(firstStore.accept(first.id, first.leaseToken, 1301), false);
    assert.equal(firstStore.retry(first.id, first.leaseToken, { now: 1301 }), false);
    assert.equal(recoveredStore.accept(recovered.id, recovered.leaseToken, 1302), true);
    assert.equal(recoveredStore.complete(recovered.id, 1303), true);
    assert.equal(recoveredStore.complete(recovered.id, 1304), false);
    assert.equal(recoveredStore.claim(2000), null);
  } finally { other?.close(); f.close(); }
});

test('burst ordering remains numeric beyond ten messages and bounded batches do not lose the tail', async () => {
  const { HermesEventStore } = await import('../src/services/hermesEventBridge.js');
  const f = fixture();
  try {
    const ids = Array.from({ length: 12 }, () => message(f.db, f.leadId));
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000').run();
    const store = new HermesEventStore(f.db, { quietMs: 100, maxEvents: 10 });
    const first = store.claim(1200);
    assert.deepEqual(JSON.parse(first.body).events.map(e => e.messageId), ids.slice(0, 10));
    store.accept(first.id, first.leaseToken, 1201);
    store.complete(first.id, 1202);
    const second = store.claim(1300);
    assert.deepEqual(JSON.parse(second.body).events.map(e => e.messageId), ids.slice(10));
  } finally { f.close(); }
});

test('a database rejection of the event aborts the inbound message rather than silently dropping its notification', () => {
  const f = fixture();
  try {
    f.db.exec(`CREATE TRIGGER fixture_event_failure BEFORE INSERT ON HermesInboundEvent
      BEGIN SELECT RAISE(ABORT, 'synthetic event storage failure'); END;`);
    assert.throws(() => message(f.db, f.leadId), /event storage failure/);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM Message').get().n, 0);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent').get().n, 0);
  } finally { f.close(); }
});

test('continuous bursts flush at max wait and do not merge different receiving accounts', async () => {
  const { HermesEventStore } = await import('../src/services/hermesEventBridge.js');
  const f = fixture();
  try {
    const first = message(f.db, f.leadId);
    const second = message(f.db, f.leadId);
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000 WHERE messageId=?').run(first);
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1499 WHERE messageId=?').run(second);
    const store = new HermesEventStore(f.db, { quietMs: 100, maxWaitMs: 500, maxInFlight: 2 });
    const batch = store.claim(1500);
    assert.equal(JSON.parse(batch.body).events.length, 2);
    // Distinct email accounts must not share conversation ownership even for one lead.
    f.db.prepare(`INSERT INTO HermesInboundEvent (id,eventType,conversationKey,channel,accountId,leadId,createdAt)
      VALUES ('synthetic-other-account','message.received','email:2:lead:1','email',2,?,1000)`).run(f.leadId);
    const other = store.claim(1500);
    assert.notEqual(other.conversationKey, batch.conversationKey);
    assert.equal(store.claim(1500), null);
  } finally { f.close(); }
});

test('permanent HTTP rejection blocks delivery for review and honors Retry-After dates', async () => {
  const { HermesEventStore, dispatchShadowBatch } = await import('../src/services/hermesEventBridge.js');
  const f = fixture();
  try {
    message(f.db, f.leadId);
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000').run();
    const store = new HermesEventStore(f.db, { quietMs: 100 });
    const batch = store.claim(1200);
    const retryDate = new Date(12000).toUTCString();
    store.retry(batch.id, batch.leaseToken, { status: 429, retryAfter: retryDate, now: 1201 });
    assert.equal(store.claim(11999), null);
    let time = 12000;
    const result = await dispatchShadowBatch({ enabled: true, store, clock: () => time,
      endpoint: 'https://hermes.example.test/shadow', secret: 'synthetic-signing-secret-at-least-32', transport: async () => ({ status: 401 }) });
    assert.equal(result.state, 'blocked');
    assert.equal(store.claim(1000000), null);
    assert.equal(f.db.prepare('SELECT state FROM HermesEventBatch').get().state, 'blocked');
  } finally { f.close(); }
});

test('retry blocks unrepresentable Retry-After delays with a finite durable review timestamp', async () => {
  const { HermesEventStore } = await import('../src/services/hermesEventBridge.js');
  const cases = [
    { retryAfter: '9'.repeat(400), time: 2001 },
    { retryAfter: String(Number.MAX_SAFE_INTEGER + 1), time: 2001 },
    { retryAfter: String(Math.floor(Number.MAX_SAFE_INTEGER / 1000) + 1), time: 2001 },
    { retryAfter: String(Math.floor(Number.MAX_SAFE_INTEGER / 1000)), time: 2001 },
    { retryAfter: null, time: Number.MAX_SAFE_INTEGER - 500 },
  ];
  for (const { retryAfter, time } of cases) {
    const f = fixture();
    let reopened;
    try {
      message(f.db, f.leadId);
      f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000').run();
      const store = new HermesEventStore(f.db, { quietMs: 100, leaseMs: 100 });
      const batch = store.claim(time - 1);
      assert.equal(store.retry(batch.id, batch.leaseToken, { status: 429, retryAfter, now: time }), true);
      reopened = new DatabaseSync(f.filename);
      const row = reopened.prepare('SELECT *,typeof(nextAttemptAt) AS storageType FROM HermesEventBatch WHERE id=?').get(batch.id);
      assert.equal(row.state, 'blocked', 'an unsupported delay needs operator review, never an early retry');
      assert.equal(row.nextAttemptAt, time);
      assert.equal(Number.isSafeInteger(row.nextAttemptAt), true);
      assert.equal(row.storageType, 'integer');
      assert.equal(row.lastStatus, 429);
      assert.equal(row.leaseToken, null);
      assert.equal(row.leaseUntil, null);
      message(f.db, f.leadId);
      f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000 WHERE batchId IS NULL').run();
      assert.equal(new HermesEventStore(reopened, { leaseMs: 100 }).claim(Number.MAX_SAFE_INTEGER - 100), null,
        'the blocked batch retains conversation ownership across database connections');
    } finally { reopened?.close(); f.close(); }
  }
});

test('retry preserves a representable near-safe-boundary Retry-After without shortening its delay', async () => {
  const { HermesEventStore } = await import('../src/services/hermesEventBridge.js');
  const f = fixture();
  try {
    const time = 2001;
    const seconds = Math.floor((Number.MAX_SAFE_INTEGER - time - 100) / 1000);
    const nextAttemptAt = time + seconds * 1000;
    message(f.db, f.leadId);
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000').run();
    const store = new HermesEventStore(f.db, { quietMs: 100, leaseMs: 100 });
    const batch = store.claim(time - 1);
    assert.equal(store.retry(batch.id, batch.leaseToken, { status: 429, retryAfter: String(seconds), now: time }), true);
    const row = f.db.prepare('SELECT * FROM HermesEventBatch WHERE id=?').get(batch.id);
    assert.equal(row.state, 'pending');
    assert.equal(row.nextAttemptAt, nextAttemptAt);
    assert.equal(Number.isSafeInteger(row.nextAttemptAt), true);
    assert.equal(store.claim(nextAttemptAt - 1), null);
    assert.equal(store.claim(nextAttemptAt).id, batch.id);
  } finally { f.close(); }
});

test('sender claim and retry reject invalid clocks before changing durable state', async () => {
  const { HermesEventStore } = await import('../src/services/hermesEventBridge.js');
  const f = fixture();
  try {
    message(f.db, f.leadId);
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000').run();
    const store = new HermesEventStore(f.db, { quietMs: 100, leaseMs: 100 });
    for (const time of [-1, NaN, Infinity, 1.5, '1200', null, Number.MAX_SAFE_INTEGER]) {
      assert.throws(() => store.claim(time), /Invalid clock/);
    }
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesEventBatch').get().n, 0);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM HermesInboundEvent WHERE batchId IS NOT NULL').get().n, 0);
    const batch = store.claim(1200);
    for (const time of [-1, NaN, Infinity, 1.5, '1201', null, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => store.retry(batch.id, batch.leaseToken, { now: time }), /Invalid clock/);
    }
    assert.deepEqual(f.db.prepare('SELECT * FROM HermesEventBatch WHERE id=?').get(batch.id), batch);
  } finally { f.close(); }
});

test('dispatch reports the persisted block when injected transport requests an unrepresentable Retry-After', async () => {
  const { HermesEventStore, dispatchShadowBatch } = await import('../src/services/hermesEventBridge.js');
  const f = fixture();
  try {
    message(f.db, f.leadId);
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000').run();
    const store = new HermesEventStore(f.db, { quietMs: 100 });
    const result = await dispatchShadowBatch({ enabled: true, store, clock: () => 2001,
      endpoint: 'https://hermes.example.test/shadow', secret: 'synthetic-signing-secret-at-least-32',
      transport: async () => ({ status: 429, headers: { get: () => '9'.repeat(400) } }) });
    assert.equal(f.db.prepare('SELECT state FROM HermesEventBatch WHERE id=?').get(result.id).state, 'blocked');
    assert.equal(result.state, 'blocked');
    assert.equal(store.claim(1000000), null);
  } finally { f.close(); }
});

test('transport timeout aborts the request and stores a retry without unlocking accepted work', async () => {
  const { HermesEventStore, dispatchShadowBatch } = await import('../src/services/hermesEventBridge.js');
  const f = fixture();
  try {
    message(f.db, f.leadId);
    f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000').run();
    const store = new HermesEventStore(f.db, { quietMs: 100 });
    let signal;
    const result = await dispatchShadowBatch({ enabled: true, store, clock: () => 1200, timeoutMs: 5,
      endpoint: 'https://hermes.example.test/shadow', secret: 'synthetic-signing-secret-at-least-32',
      transport: async (_url, request) => { signal = request.signal; return new Promise(() => {}); } });
    assert.equal(result.state, 'retry');
    assert.equal(signal.aborted, true);
    assert.equal(f.db.prepare('SELECT state FROM HermesEventBatch').get().state, 'pending');
  } finally { f.close(); }
});

test('installed Hermes accepts sender V2 bytes and rejects tampering and expired or missing timestamps',
  { skip: !process.env.HERMES_WEBHOOK_SOURCE }, async () => {
    const { HermesEventStore, dispatchShadowBatch } = await import('../src/services/hermesEventBridge.js');
    const { execFileSync } = await import('node:child_process');
    const f = fixture();
    try {
      const now = 1800000000;
      message(f.db, f.leadId);
      f.db.prepare('UPDATE HermesInboundEvent SET createdAt=1000').run();
      const store = new HermesEventStore(f.db);
      const secret = 'synthetic-offline-contract-secret-32';
      let captured;
      await dispatchShadowBatch({ enabled: true, store, clock: () => now * 1000, secret,
        endpoint: 'https://hermes.example.test/shadow', transport: async (_url, request) => { captured = request; return { status: 202 }; } });
      const result = JSON.parse(execFileSync('python3', [new URL('../scripts/verify-hermes-signature-contract.py', import.meta.url).pathname,
        process.env.HERMES_WEBHOOK_SOURCE], { encoding: 'utf8', timeout: 10000,
        input: JSON.stringify({ now, secret, body: captured.body, headers: captured.headers }) }));
      assert.deepEqual(result, { valid: true, tampered_signature: false, tampered_body: false,
        missing_timestamp: false, stale_timestamp: false, future_timestamp: false, invalid_timestamp: false });
    } finally { f.close(); }
  });
