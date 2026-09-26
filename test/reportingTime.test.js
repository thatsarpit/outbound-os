import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_WORKSPACE_TZ_OFFSET_MIN,
  buildMessageEventDateWhere,
  buildNewLeadDateWhere,
  getLocalDayRangeUTC,
  localDateKey,
  parseTimezoneOffset,
} from '../src/utils/reportingTime.js';

describe('reporting day boundaries', () => {
  test('uses the workspace offset when the client value is missing or invalid', () => {
    assert.equal(parseTimezoneOffset(undefined), DEFAULT_WORKSPACE_TZ_OFFSET_MIN);
    assert.equal(parseTimezoneOffset('not-a-number'), DEFAULT_WORKSPACE_TZ_OFFSET_MIN);
    assert.equal(parseTimezoneOffset('30garbage'), DEFAULT_WORKSPACE_TZ_OFFSET_MIN);
    assert.equal(parseTimezoneOffset('1.5'), DEFAULT_WORKSPACE_TZ_OFFSET_MIN);
    assert.equal(parseTimezoneOffset(''), DEFAULT_WORKSPACE_TZ_OFFSET_MIN);
    assert.equal(parseTimezoneOffset('99999'), DEFAULT_WORKSPACE_TZ_OFFSET_MIN);
    assert.equal(parseTimezoneOffset('0'), 0);
    assert.equal(parseTimezoneOffset(-330), -330);
  });

  test('maps an India local day to a half-open UTC range', () => {
    const now = new Date('2026-09-20T12:00:00.000Z');
    const { start, end } = getLocalDayRangeUTC(-330, now);

    assert.equal(start.toISOString(), '2026-09-19T18:30:00.000Z');
    assert.equal(end.toISOString(), '2026-09-20T18:30:00.000Z');
  });

  test('selects the next local day when UTC is still on the previous date', () => {
    const now = new Date('2026-09-19T20:00:00.000Z');
    const { start, end } = getLocalDayRangeUTC(-330, now);

    assert.equal(start.toISOString(), '2026-09-19T18:30:00.000Z');
    assert.equal(end.toISOString(), '2026-09-20T18:30:00.000Z');
  });

  test('buckets timestamps using the same local boundary as the API filters', () => {
    assert.equal(localDateKey('2026-09-19T18:29:59.999Z', -330), '2026-09-19');
    assert.equal(localDateKey('2026-09-19T18:30:00.000Z', -330), '2026-09-20');
  });
});

describe('message event reporting semantics', () => {
  test('uses provider time and falls back to ingestion time only when absent', () => {
    const start = new Date('2026-09-19T18:30:00.000Z');
    const end = new Date('2026-09-20T18:30:00.000Z');

    assert.deepEqual(buildMessageEventDateWhere(start, end), {
      OR: [
        { providerCreatedAt: { gte: start, lt: end } },
        {
          providerCreatedAt: null,
          createdAt: { gte: start, lt: end },
        },
      ],
    });
  });
});

describe('new-lead reporting semantics', () => {
  test('uses provider time and only falls back to insertion time for manual leads', () => {
    const start = new Date('2026-09-19T18:30:00.000Z');
    const end = new Date('2026-09-20T18:30:00.000Z');

    assert.deepEqual(buildNewLeadDateWhere(start, end), {
      OR: [
        { consumedAt: { gte: start, lt: end } },
        {
          consumedAt: null,
          source: 'manual',
          createdAt: { gte: start, lt: end },
        },
      ],
    });
  });
});
