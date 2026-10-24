import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskQueueWhere } from '../src/utils/taskQueue.js';

test('task today filter uses the workspace day rather than the server day', () => {
  const where = taskQueueWhere({ now: new Date('2026-10-23T20:00:00Z'), timezone: 'Asia/Kolkata', due: 'today' });
  assert.equal(where.dueAt.gte.toISOString(), '2026-10-23T18:30:00.000Z');
  assert.equal(where.dueAt.lt.toISOString(), '2026-10-24T18:30:00.000Z');
});
test('daylight-saving day can contain 25 hours', () => {
  const where = taskQueueWhere({ now: new Date('2026-11-01T12:00:00Z'), timezone: 'America/New_York', due: 'today' });
  assert.equal(where.dueAt.lt - where.dueAt.gte, 25 * 3600_000);
});
test('overdue is pending only, all includes completed and unknown filters fail', () => {
  assert.equal(taskQueueWhere({ done: true, due: 'overdue' }).done, false);
  assert.deepEqual(taskQueueWhere({ done: true }), {});
  assert.deepEqual(taskQueueWhere({ due: 'unscheduled' }), { done: false, dueAt: null });
  assert.throws(() => taskQueueWhere({ due: 'unknown' }), /valid due-date filter/);
});
