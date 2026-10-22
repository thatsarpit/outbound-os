import test from 'node:test';
import assert from 'node:assert/strict';
import { inboxViewerKey, inboxThreadState, inboxMessagePreview } from '../src/utils/inboxState.js';

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
