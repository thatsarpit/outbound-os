import test from 'node:test';
import assert from 'node:assert/strict';
import { messageEventTime, sortConversationMessages } from '../src/utils/messageTimeline.js';

test('late media and imported messages appear at their provider event time without mutating the records', () => {
  const first = { id: 1, direction: 'inbound', providerCreatedAt: '2026-10-24T10:00:10Z', createdAt: '2026-10-24T10:00:11Z' };
  const late = { id: 2, direction: 'inbound', providerCreatedAt: '2026-10-24T10:00:05Z', createdAt: '2026-10-24T10:00:12Z' };
  const reply = { id: 3, direction: 'outbound', sentAt: '2026-10-24T10:00:20Z', createdAt: '2026-10-24T10:00:19Z' };
  const history = [first, late, reply];
  assert.deepEqual(sortConversationMessages(history).map(row => row.id), [2, 1, 3]);
  assert.deepEqual(history.map(row => row.id), [1, 2, 3]);
});

test('missing or invalid provider dates fall back to sent/created time, with stable ties', () => {
  const first = { id: 2, direction: 'inbound', providerCreatedAt: 'bad', sentAt: '2026-10-24T10:00:00Z' };
  const second = { id: 1, direction: 'outbound', createdAt: '2026-10-24T10:00:00Z' };
  assert.deepEqual(sortConversationMessages([first, second]).map(row => row.id), [1, 2]);
  assert.equal(messageEventTime({ direction: 'inbound' }), 0);
});
