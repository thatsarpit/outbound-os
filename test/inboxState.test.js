import test from 'node:test';
import assert from 'node:assert/strict';
import { inboxViewerKey, inboxThreadState, inboxMessagePreview, localInboxAssigneeId } from '../src/utils/inboxState.js';

test('reading and resolving a conversation do not use sales status as inbox state', () => {
  const incoming = { direction: 'inbound', channel: 'whatsapp', createdAt: '2026-10-20T10:00:00Z' };
  for (const status of ['paused', 'engaged', 'closed']) {
    assert.equal(inboxThreadState({ lead: { status }, lastMessage: incoming }), 'needs_reply');
    assert.equal(inboxThreadState({ lead: { status, inboxResolvedAt: '2026-10-20T11:00:00Z' }, lastMessage: incoming }), 'resolved');
  }
  assert.equal(inboxThreadState({ lead: { inboxResolvedAt: '2026-10-20T09:00:00Z' }, lastMessage: incoming }), 'needs_reply', 'a later customer reply reopens a resolved conversation');
});

test('personal read keys isolate organizations and exclude the shared service identity', () => {
  assert.equal(inboxViewerKey({ id: 'mcp-service', orgId: 'service' }), null);
  assert.equal(inboxViewerKey(null), null);
  assert.notEqual(inboxViewerKey({ id: 1, orgId: 'a' }), inboxViewerKey({ id: 1, orgId: 'b' }));
  assert.notEqual(inboxViewerKey({ id: 1, orgId: 'a' }), inboxViewerKey({ id: 2, orgId: 'a' }));
});

test('campaign archive previews do not pass raw personalization markup off as sent text', () => {
  assert.match(inboxMessagePreview({ channel: 'email', direction: 'outbound', content: 'Hi {{ contact.FIRSTNAME }}' }), /archived template/);
  assert.equal(inboxMessagePreview({ channel: 'whatsapp', direction: 'outbound', content: ' Here are\n the details. ' }), 'You: Here are the details.');
  assert.equal(inboxMessagePreview({ channel: 'email', direction: 'inbound', content: 'What does {{name}} mean?' }), 'What does {{name}} mean?');
});

test('the inbox migration preserves sales stages and enforces read cursor ownership/cascade', async () => {
  const { default: Database } = await import('better-sqlite3');
  const { readFileSync } = await import('node:fs');
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    db.exec(`CREATE TABLE Lead (id INTEGER PRIMARY KEY, status TEXT NOT NULL, updatedAt DATETIME NOT NULL);
      INSERT INTO Lead VALUES (1, 'closed', 1792500000000), (2, 'paused', 1792500000000);`);
    db.exec(readFileSync(new URL('../prisma/migrations/20261022180000_inbox_read_and_resolution/migration.sql', import.meta.url), 'utf8'));
    assert.deepEqual(db.prepare('SELECT status, inboxResolvedAt FROM Lead WHERE id=1').get(), { status: 'closed', inboxResolvedAt: 1792500000000 });
    assert.deepEqual(db.prepare('SELECT status, inboxResolvedAt FROM Lead WHERE id=2').get(), { status: 'paused', inboxResolvedAt: null });
    const insert = db.prepare('INSERT INTO InboxReadState (leadId, viewerKey, lastReadMessageId) VALUES (?, ?, ?)');
    insert.run(1, 'local:1', 5);
    insert.run(1, 'local:2', 3);
    assert.throws(() => insert.run(1, 'local:1', 7), /UNIQUE/);
    db.prepare('DELETE FROM Lead WHERE id=1').run();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM InboxReadState').get().n, 0);
  } finally { db.close(); }
});

test('local assignments accept exact integer identities and never guess Clerk mappings', () => {
  assert.equal(localInboxAssigneeId({ sub: 42 }), 42);
  assert.equal(localInboxAssigneeId({ id: '42' }), 42);
  for (const user of [{ id: 'user_fixture', orgId: 'org_fixture' }, { sub: '42garbage' }, { id: 'mcp-service' }, { id: '42', orgId: 'org_fixture' }, null]) assert.equal(localInboxAssigneeId(user), null);
});
