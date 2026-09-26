/**
 * Outreach window gating.
 * Run: node --test test/businessHours.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isBusinessHours, minutesUntilBusinessHours } from '../src/utils/delay.js';
import config from '../src/config.js';

/** Current hour-of-day in a zone, computed independently of the code under test. */
function hourIn(timeZone) {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false })
      .format(new Date()),
  ) % 24;
}

const wrap = (h) => ((h % 24) + 24) % 24;

describe('isBusinessHours', () => {
  test('is true inside the window and false outside it', () => {
    const h = hourIn('UTC');
    assert.equal(isBusinessHours(h, wrap(h + 1), 'UTC'), true, 'current hour should be inside');
    assert.equal(isBusinessHours(wrap(h + 2), wrap(h + 3), 'UTC'), false, 'should be outside');
  });

  test('handles a window that wraps past midnight', () => {
    const h = hourIn('UTC');
    // A window starting an hour ago and ending an hour from now, expressed so it
    // straddles midnight whenever the current hour is near 0.
    assert.equal(isBusinessHours(h, wrap(h + 1), 'UTC'), true);
    // 22:00-04:00 style window: true only in the late-night/early-morning band.
    const expected = h >= 22 || h < 4;
    assert.equal(isBusinessHours(22, 4, 'UTC'), expected);
  });

  test('the end hour is exclusive', () => {
    const h = hourIn('UTC');
    assert.equal(isBusinessHours(h, h, 'UTC'), false, 'a zero-width window is never open');
  });

  test('respects the timezone it is given', () => {
    // Kolkata is UTC+5:30, so the hour-of-day differs from UTC for most of the day.
    const utc = hourIn('UTC');
    const ist = hourIn('Asia/Kolkata');
    assert.equal(isBusinessHours(ist, wrap(ist + 1), 'Asia/Kolkata'), true);
    if (utc !== ist) {
      assert.equal(isBusinessHours(utc, wrap(utc + 1), 'Asia/Kolkata'), false,
        'a UTC-based window was applied to an IST clock');
    }
  });

  test('defaults come from config, not from literals', () => {
    // The bug: this defaulted to 9-21 while config said 9-23, so campaignEngine
    // — which calls it with no arguments — stopped two hours early.
    const { start, end, timezone } = config.businessHours;
    assert.equal(isBusinessHours(), isBusinessHours(start, end, timezone));
  });

  test('an unusable timezone does not halt outreach outright', () => {
    assert.equal(isBusinessHours(0, 24, 'Not/AZone'), true);
  });
});

describe('minutesUntilBusinessHours', () => {
  test('is zero while the window is already open', () => {
    const h = hourIn('UTC');
    assert.equal(minutesUntilBusinessHours(h, 'UTC'), 0);
  });

  test('counts forward to the next opening, wrapping over midnight', () => {
    const h = hourIn('UTC');
    assert.equal(minutesUntilBusinessHours(wrap(h + 3), 'UTC'), 180);
    assert.equal(minutesUntilBusinessHours(wrap(h - 1), 'UTC'), 23 * 60);
  });
});
