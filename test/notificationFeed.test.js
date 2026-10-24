import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeNotificationFeed, readNotificationFeedThrough } from '../web/src/lib/notification-feed.ts';

const item = (id, time = Number(id), read = false) => ({ id: String(id), timestamp: new Date(time * 1000).toISOString(), read });
test('a full notification panel retains the newest event after reconnect hydration', () => {
  const before = Array.from({ length: 12 }, (_, i) => item(i + 1));
  const merged = mergeNotificationFeed(before, [item(13)]);
  assert.equal(merged.length, 12);
  assert.equal(merged[0].id, '13');
  assert.equal(merged.some(row => row.id === '1'), false);
});
test('replay deduplicates IDs, updates content and preserves local or cross-device reads', () => {
  const merged = mergeNotificationFeed([item(7, 7, true)], [{ ...item(7), title: 'Persisted event' }, item(8, 8, true)]);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].read, true);
  assert.equal(merged[1].title, 'Persisted event');
  assert.equal(merged[0].read, true);
});
test('identical timestamps use deterministic numeric identity order', () => {
  assert.deepEqual(mergeNotificationFeed([], [item(9, 1), item(10, 1)]).map(row => row.id), ['10', '9']);
});
test('mark-all response never consumes a notification arriving during the request', () => {
  const result = readNotificationFeedThrough([item(12), item(11), item(10)], 11);
  assert.equal(result[0].read, false);
  assert.equal(result[1].read, true);
  assert.equal(result[2].read, true);
});
