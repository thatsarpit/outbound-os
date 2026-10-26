import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { emailHarness } from '../helpers/hermesIngress.js';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';

assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.cwd(), process.env.TMPDIR);
assert.equal(new URL(process.env.DATABASE_URL).protocol, 'file:');
assert.equal(path.dirname(new URL(process.env.DATABASE_URL).pathname), process.cwd());
// Neither synthetic ingestion nor its injected callbacks may deliver network traffic.
globalThis.fetch = () => { throw new Error('Network delivery forbidden in synthetic ingress harness'); };

test('real WhatsApp reply ingress deduplicates sequential provider replay without suppressing distinct identical messages', { timeout: 15000 }, async () => {
  const { default: db } = await import('../../src/utils/prismaClient.js');
  const { default: detector } = await import('../../src/services/replyDetector.js');
  const { default: activity } = await import('../../src/utils/activityLog.js');
  const sql = new DatabaseSync(new URL(process.env.DATABASE_URL).pathname);
  try {
    await db.lead.update({ where: { id: 1 }, data: { status: 'contacted' } });
    const queued = await db.message.create({ data: { leadId: 1, channel: 'whatsapp', direction: 'outbound', status: 'queued', content: 'Synthetic queue only' } });
    activity.clear();
    const deliver = id => detector.handleReply('15555550123', 'Synthetic greeting', 1,
      { leadId: 1, channel: 'whatsapp', messageId: id });
    await deliver('wamid.synthetic-one');
    await deliver('wamid.synthetic-one');
    assert.equal(await db.message.count({ where: { direction: 'inbound' } }), 1);
    assert.equal(sql.prepare('SELECT count(*) n FROM HermesInboundEvent').get().n, 1);
    assert.equal(activity.getByType('reply_received').length, 1);
    assert.equal((await db.message.findUnique({ where: { id: queued.id } })).status, 'cancelled');
    await deliver('wamid.synthetic-two');
    assert.equal(await db.message.count({ where: { direction: 'inbound' } }), 2);
    assert.equal(sql.prepare('SELECT count(*) n FROM HermesInboundEvent').get().n, 2);
    assert.equal(activity.getByType('reply_received').length, 2);
    // Wait for the real fire-and-forget classifier writes before disconnecting.
    const deadline = Date.now() + 3000;
    while (!(await db.lead.findUnique({ where: { id: 1 } })).lastReplyIntent) {
      if (Date.now() >= deadline) throw new Error('Synthetic classifier did not settle');
      await delay(10);
    }
  } finally {
    clearTimeout(detector._persistTimer);
    await db.$disconnect(); sql.close();
  }
});

test('real MIME partial upgrade and IMAP/Cloudflare overlap emit one canonical event and one reply effect', { timeout: 15000 }, async () => {
  const f = await emailHarness();
  try {
    const header = f.mime('');
    const raw = f.mime('Synthetic quote request');
    const partial = await f.deliver(header, { provider: 'imap', complete: false });
    assert.equal(partial.receipt.state, 'partial');
    assert.equal(f.eventCount(), 0);
    const full = await f.deliver(raw, { provider: 'imap' });
    assert.equal(full.inbound.id, partial.inbound.id);
    assert.equal(f.eventCount(), 1);
    const overlap = await f.deliver(raw, { provider: 'cloudflare' });
    assert.equal(overlap.duplicate, true);
    await f.deliver(raw, { provider: 'imap' });
    assert.equal(await f.db.message.count({ where: { direction: 'inbound' } }), 1);
    assert.equal(await f.db.activityLog.count({ where: { type: 'email_reply' } }), 1);
    assert.equal(f.events.length, 1);
    assert.equal(f.eventCount(), 1);
    const event = f.sql.prepare('SELECT * FROM HermesInboundEvent').get();
    assert.equal(event.id, `message:${full.inbound.id}:received`);
    assert.equal(event.accountId, f.account.id);
    assert.doesNotMatch(JSON.stringify(event), /Synthetic quote request|customer@example\.test/);
  } finally { await f.close(); }
});

test('unknown MIME sender emits one receipt reference across retry; association emits a separate message reference', { timeout: 15000 }, async () => {
  const f = await emailHarness();
  try {
    const raw = f.mime('Synthetic unmatched enquiry', { from: 'unknown@example.test' });
    const options = { envelopeFrom: 'unknown@example.test' };
    const held = await f.deliver(raw, options);
    assert.equal(held.receipt.state, 'unmatched');
    assert.equal(f.eventCount(), 1);
    await f.deliver(raw, { ...options, retry: true });
    assert.equal(f.eventCount(), 1);
    assert.equal(await f.db.message.count(), 0);
    await f.db.lead.update({ where: { id: 1 }, data: { email: 'unknown@example.test' } });
    const linked = await f.deliver(raw, { ...options, retry: true });
    assert.equal(linked.receipt.id, held.receipt.id);
    assert.equal(linked.receipt.state, 'matched');
    assert.deepEqual(f.sql.prepare('SELECT id FROM HermesInboundEvent ORDER BY id').all().map(r => r.id).sort(),
      [`receipt:${held.receipt.id}:unmatched`, `message:${linked.inbound.id}:received`].sort());
    await f.deliver(raw, options);
    assert.equal(f.events.length, 1);
    assert.equal(f.eventCount(), 2);
  } finally { await f.close(); }
});

test('automatic MIME and conflicting provider overlap do not emit extra human events or reply effects', { timeout: 15000 }, async () => {
  const f = await emailHarness();
  try {
    await f.deliver(f.mime('Synthetic vacation', { extra: 'Auto-Submitted: auto-replied\r\n' }));
    assert.equal(f.eventCount(), 0);
    assert.equal(f.events.length, 0);
    const raw = f.mime('Synthetic human', { id: '<human@example.test>' });
    await f.deliver(raw, { dedupeKey: 'imap-human-unique' });
    const conflict = await f.deliver(f.mime('Changed body', { id: '<human@example.test>' }),
      { provider: 'cloudflare', dedupeKey: 'cloudflare-conflict-unique' });
    assert.equal(conflict.receipt.state, 'conflict');
    assert.equal(f.eventCount(), 1);
    assert.equal(f.events.length, 1);
    await assert.rejects(f.deliver(f.mime('Identity changed'), { dedupeKey: 'imap-human-unique' }), /different content/);
    assert.equal(f.eventCount(), 1);
    assert.equal(await f.db.activityLog.count({ where: { type: 'email_reply' } }), 1);
  } finally { await f.close(); }
});

test('real MIME event-storage failure rolls back message and reply effects; pending receipt can recover once', { timeout: 15000 }, async () => {
  const f = await emailHarness();
  try {
    const raw = f.mime('Synthetic rollback');
    f.sql.exec(`CREATE TRIGGER harness_reject_event BEFORE INSERT ON HermesInboundEvent
      BEGIN SELECT RAISE(ABORT, 'synthetic event storage failure'); END`);
    await assert.rejects(f.deliver(raw));
    assert.equal(await f.db.message.count(), 0);
    assert.equal(f.eventCount(), 0);
    assert.equal(await f.db.activityLog.count(), 0);
    assert.equal(f.events.length, 0);
    assert.equal((await f.db.lead.findUnique({ where: { id: 1 } })).status, 'contacted');
    f.sql.exec('DROP TRIGGER harness_reject_event');
    await f.deliver(raw);
    await f.deliver(raw);
    assert.equal(await f.db.message.count(), 1);
    assert.equal(f.eventCount(), 1);
    assert.equal(f.events.length, 1);
  } finally { await f.close(); }
});
