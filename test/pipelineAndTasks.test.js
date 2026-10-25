import test from 'node:test';
import assert from 'node:assert/strict';
import { pipelinePage, loadedPipelineLeads, nextPipelinePage } from '../web/src/lib/pipeline-data.ts';
import { taskDateInput, taskDueLabel } from '../web/src/lib/task-date.ts';
import { workspaceWallTimeToUtc } from '../web/src/lib/mobile-workspace-time.ts';
import { resolveCapabilityForPath, ROLE_PAGE_CAPABILITIES } from '../web/src/lib/role-shell.ts';

test('pipeline retains server totals and reaches every page beyond the loaded sample', () => {
  const first = pipelinePage({ leads: [{ id: 1 }], total: 125, page: 1, pages: 3 });
  assert.equal(first.total, 125);
  assert.equal(nextPipelinePage(first), 2);
  assert.equal(nextPipelinePage({ ...first, page: 2 }), 3);
  assert.equal(nextPipelinePage({ ...first, page: 3 }), undefined);
  assert.deepEqual(pipelinePage({ leads: [], total: 0, page: 1, pages: 0 }), { leads: [], total: 0, page: 1, pages: 0 });
  for (const value of [undefined, {}, { ...first, total: '125' }, { ...first, leads: null }, { ...first, page: -1 }, { ...first, pages: -1 }, { ...first, total: NaN }]) assert.throws(() => pipelinePage(value), /unavailable|verified/);
});

test('overlapping pipeline pages do not render a customer twice after a concurrent stage update', () => {
  const first = pipelinePage({ leads: [{ id: 1, name: 'One' }, { id: 2, name: 'Old name' }], total: 3, page: 1, pages: 2 });
  const second = pipelinePage({ leads: [{ id: 2, name: 'Updated name' }, { id: 3, name: 'Three' }], total: 3, page: 2, pages: 2 });
  assert.deepEqual(loadedPipelineLeads([first, second]), [{ id: 1, name: 'One' }, { id: 2, name: 'Updated name' }, { id: 3, name: 'Three' }]);
  assert.equal(first.leads[1].name, 'Old name', 'merging does not mutate the query response');
});

test('task date editing round-trips workspace time across date boundaries and DST offsets', () => {
  for (const [time, zone, expected] of [
    ['2026-10-23T20:30:00.000Z', 'Asia/Kolkata', '2026-10-24T02:00'],
    ['2026-07-14T10:30:00.000Z', 'Europe/London', '2026-07-14T11:30'],
    ['2026-12-14T10:30:00.000Z', 'Europe/London', '2026-12-14T10:30'],
    ['2026-10-23T10:00:00.000Z', 'Australia/Adelaide', '2026-10-23T20:30'],
  ]) {
    assert.equal(taskDateInput(time, zone), expected);
    assert.equal(workspaceWallTimeToUtc(taskDateInput(time, zone), zone), time);
  }
  assert.equal(taskDateInput(null, 'UTC'), '');
  assert.equal(taskDueLabel(null, 'UTC'), 'No due date');
  assert.throws(() => taskDateInput('not-a-date', 'UTC'), /invalid due date/);
});

test('desktop and mobile tasks share readable lead access without opening settings permissions', () => {
  assert.equal(resolveCapabilityForPath('/tasks'), 'page.leads');
  assert.equal(resolveCapabilityForPath('/m/tasks'), 'page.leads');
  for (const role of ['viewer', 'agent', 'manager', 'admin']) assert.ok(ROLE_PAGE_CAPABILITIES[role].includes(resolveCapabilityForPath('/tasks')));
  assert.ok(!ROLE_PAGE_CAPABILITIES.viewer.includes('page.settings'));
  assert.ok(!ROLE_PAGE_CAPABILITIES.agent.includes('page.team'));
});
