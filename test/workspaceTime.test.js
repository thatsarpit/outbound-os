import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isSameZonedDay,
  workspaceTzOffsetMinutes,
  zonedDateKey,
  zonedParts,
  zonedTimeToUtc,
} from '../src/utils/workspaceTime.js';

describe('workspace time zone helpers', () => {
  test('reads calendar fields in the given zone', () => {
    const instant = new Date('2026-09-20T18:45:00.000Z');
    assert.deepEqual(
      { ...zonedParts(instant, 'Asia/Kolkata'), seconds: undefined },
      { year: 2026, month: 8, day: 21, hours: 0, minutes: 15, seconds: undefined, weekday: 1 },
    );
    assert.equal(zonedDateKey(instant, 'UTC'), '2026-09-20');
    assert.equal(zonedDateKey(instant, 'Asia/Kolkata'), '2026-09-21');
  });

  test('finds the instant a wall-clock time happens, including fractional offsets', () => {
    assert.equal(
      zonedTimeToUtc(2026, 8, 21, 0, 0, 'Asia/Kolkata').toISOString(),
      '2026-09-20T18:30:00.000Z',
    );
    assert.equal(
      zonedTimeToUtc(2026, 0, 1, 0, 0, 'America/New_York').toISOString(),
      '2026-01-01T05:00:00.000Z',
    );
  });

  test('stays exact across a daylight-saving change', () => {
    // New York moves from EST (-5) to EDT (-4) on 8 March 2026.
    assert.equal(
      zonedTimeToUtc(2026, 2, 7, 0, 0, 'America/New_York').toISOString(),
      '2026-03-07T05:00:00.000Z',
    );
    assert.equal(
      zonedTimeToUtc(2026, 2, 9, 0, 0, 'America/New_York').toISOString(),
      '2026-03-09T04:00:00.000Z',
    );
  });

  test('rolls over out-of-range fields like Date.UTC', () => {
    // Month -1 of 2026 is December 2025.
    assert.equal(
      zonedTimeToUtc(2026, -1, 1, 0, 0, 'UTC').toISOString(),
      '2025-12-01T00:00:00.000Z',
    );
  });

  test('compares days in the zone, not in UTC', () => {
    const a = new Date('2026-09-20T18:29:59.000Z');
    const b = new Date('2026-09-20T18:30:01.000Z');
    assert.equal(isSameZonedDay(a, b, 'Asia/Kolkata'), false);
    assert.equal(isSameZonedDay(a, b, 'UTC'), true);
  });

  test('reports offsets in the browser convention', () => {
    assert.equal(workspaceTzOffsetMinutes(new Date('2026-09-20T00:00:00Z'), 'Asia/Kolkata'), -330);
    assert.equal(workspaceTzOffsetMinutes(new Date('2026-09-20T00:00:00Z'), 'UTC'), 0);
  });
});
