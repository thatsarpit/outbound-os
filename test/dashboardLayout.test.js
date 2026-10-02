import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDashboardLayout, validateDashboardLayout, moveDashboardWidget } from '../shared/dashboardLayout.js';
import { analyticsWindow } from '../src/utils/analyticsWindow.js';

test('layout validation rejects corrupt, duplicate and unknown widgets', () => {
  const layout = defaultDashboardLayout('analytics');
  assert.deepEqual(validateDashboardLayout('analytics', layout), layout);
  for (const change of [
    { ...layout, version: 2 },
    { ...layout, widgets: layout.widgets.slice(1) },
    { ...layout, widgets: layout.widgets.map((w, i) => i === 1 ? layout.widgets[0] : w) },
    { ...layout, widgets: layout.widgets.map((w, i) => i === 0 ? { ...w, id: 'evil' } : w) },
    { ...layout, widgets: layout.widgets.map((w, i) => i === 0 ? { ...w, width: 99 } : w) },
    { ...layout, widgets: layout.widgets.map((w, i) => i === 0 ? { ...w, visible: 'false' } : w) },
  ]) assert.throws(() => validateDashboardLayout('analytics', change));
  assert.throws(() => defaultDashboardLayout('__proto__'));
});
test('moving widgets preserves visibility and size without mutating the source', () => {
  const layout = defaultDashboardLayout('analytics');
  layout.widgets[0].visible = false;
  layout.widgets[0].width = 1;
  const moved = moveDashboardWidget(layout, 'outreach', 'team');
  assert.equal(moved.widgets.at(-1).id, 'outreach');
  assert.equal(moved.widgets.at(-1).width, 1);
  assert.equal(moved.widgets.at(-1).visible, false);
  assert.equal(layout.widgets[0].id, 'outreach');
  assert.equal(moveDashboardWidget(layout, 'missing', 'team'), layout);
  assert.equal(moveDashboardWidget(layout, 'team', 'team'), layout);
});
test('analytics periods include today and distinguish 14 days from 30', () => {
  const now = new Date('2026-10-03T00:30:00Z');
  const window = analyticsWindow({ range: '14d', tzOffset: '-330' }, 30, now);
  assert.equal(window.start.toISOString(), '2026-09-19T18:30:00.000Z');
  assert.equal(window.end.toISOString(), '2026-10-03T18:30:00.000Z');
  assert.equal(analyticsWindow({ range: 'all' }, 30, now).start, null);
  assert.equal(analyticsWindow({}, null, now).start, null);
  assert.equal(analyticsWindow({ days: 'garbage' }, 30, now).days, 30);
});
