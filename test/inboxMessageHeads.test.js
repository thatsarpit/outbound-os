import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPrismaClient } from '../src/utils/createPrismaClient.js';
import { inboxMessageHeads } from '../src/utils/inboxMessageHeads.js';

test('large histories hydrate only the visible/actionable heads and retain delayed-event, channel and failure semantics', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'outbound-heads-'));
  const filename = path.join(directory, 'fixture.db');
  const sql = new DatabaseSync(filename);
  sql.exec(`CREATE TABLE Message (id INTEGER PRIMARY KEY, leadId INTEGER, direction TEXT, channel TEXT, status TEXT,
    emailInboundKind TEXT, createdAt DATETIME, sentAt DATETIME, providerCreatedAt DATETIME,
    waMessageId TEXT, idempotencyKey TEXT, providerDeliveryStatus TEXT);
    CREATE INDEX Message_leadId_idx ON Message(leadId);`);
  const insert = sql.prepare('INSERT INTO Message (id,leadId,direction,channel,status,emailInboundKind,createdAt,providerCreatedAt) VALUES (?,?,?,?,?,?,?,?)');
  const at = Date.parse('2026-10-24T00:00:00Z');
  sql.exec('BEGIN');
  for (let id = 1; id <= 10000; id++) insert.run(id, 1, 'inbound', 'email', 'delivered', 'human', at + id, at + id);
  insert.run(10001, 1, 'inbound', 'email', 'delivered', 'automatic_reply', at + 10001, at + 10001);
  insert.run(10002, 1, 'inbound', 'email', 'delivered', 'human', at + 20000, at - 1000);
  insert.run(10003, 2, 'inbound', 'whatsapp', 'delivered', null, at, at);
  insert.run(10004, 2, 'outbound', 'whatsapp', 'sent', null, at + 1000, null);
  insert.run(10005, 2, 'outbound', 'whatsapp', 'failed', null, at + 2000, null);
  sql.prepare("UPDATE Message SET idempotencyKey='manual-wa:fixture-attempt' WHERE id=10005").run();
  sql.exec('COMMIT');
  const db = createPrismaClient(`file:${filename}`);
  let hydrated;
  const bounded = { $queryRawUnsafe: (...args) => db.$queryRawUnsafe(...args), message: { findMany: args => {
    hydrated = args.where.id.in;
    return db.message.findMany(args);
  } } };
  try {
    const heads = await inboxMessageHeads(bounded, [1], 'email');
    assert.deepEqual(hydrated.sort((a, b) => a - b), [10000, 10001]);
    assert.equal(heads.visible.get(1).id, 10001);
    assert.equal(heads.actionable.get(1).id, 10000);
    const other = await inboxMessageHeads(bounded, [2], 'whatsapp');
    assert.equal(other.visible.get(2).id, 10005, 'a manual send failure stays in the timeline');
    assert.equal(other.actionable.get(2).id, 10004, 'a failed attempt does not consume a customer reply');
    assert.equal((await inboxMessageHeads(bounded, [1], 'whatsapp')).visible.size, 0);
    await assert.rejects(inboxMessageHeads(bounded, [1, '2']), /Invalid inbox head/);
  } finally { await db.$disconnect(); sql.close(); rmSync(directory, { recursive: true, force: true }); }
});
