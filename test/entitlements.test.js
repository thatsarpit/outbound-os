/**
 * Entitlement rules.
 *
 * These decide whether a paying customer can act. Both failure directions are
 * expensive: too strict blocks someone who has paid, too loose gives away the
 * product. The rules are tested without a database so they stay cheap to run.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateLimit,
  currentPeriodStart,
  EntitlementError,
  METRIC,
} from '../src/platform/entitlements.js';

describe('evaluateLimit', () => {
  test('allows when under the cap', () => {
    const v = evaluateLimit({ hasSubscription: true, limit: 5, current: 3 });
    assert.equal(v.allowed, true);
    assert.equal(v.remaining, 2);
  });

  test('allows the action that exactly reaches the cap', () => {
    // Off-by-one here would deny a customer the last seat they paid for.
    const v = evaluateLimit({ hasSubscription: true, limit: 5, current: 4 });
    assert.equal(v.allowed, true);
    assert.equal(v.remaining, 1);
  });

  test('denies the action that would exceed the cap', () => {
    const v = evaluateLimit({ hasSubscription: true, limit: 5, current: 5 });
    assert.equal(v.allowed, false);
    assert.equal(v.reason, 'limit_reached');
  });

  test('honours amount > 1', () => {
    const v = evaluateLimit({ hasSubscription: true, limit: 10, current: 8, amount: 3 });
    assert.equal(v.allowed, false);
  });

  test('null limit means unlimited, NOT zero', () => {
    // The worst possible misreading: a top-tier customer blocked from everything.
    const v = evaluateLimit({ hasSubscription: true, limit: null, current: 999999 });
    assert.equal(v.allowed, true);
    assert.equal(v.reason, 'unlimited');
  });

  test('undefined limit also means unlimited', () => {
    const v = evaluateLimit({ hasSubscription: true, limit: undefined, current: 10 });
    assert.equal(v.allowed, true);
  });

  test('a zero limit really is zero', () => {
    // Distinct from null — a plan may legitimately grant none of something.
    const v = evaluateLimit({ hasSubscription: true, limit: 0, current: 0 });
    assert.equal(v.allowed, false);
  });

  test('no subscription denies regardless of usage', () => {
    const v = evaluateLimit({ hasSubscription: false });
    assert.equal(v.allowed, false);
    assert.equal(v.reason, 'no_active_subscription');
  });

  test('remaining never goes negative', () => {
    // Usage can exceed a cap after a downgrade; the UI should show 0, not -3.
    const v = evaluateLimit({ hasSubscription: true, limit: 5, current: 8 });
    assert.equal(v.remaining, 0);
  });
});

describe('billing period', () => {
  test('truncates to the first of the month, UTC', () => {
    const p = currentPeriodStart(new Date('2026-09-17T22:45:00Z'));
    assert.equal(p.toISOString(), '2026-09-01T00:00:00.000Z');
  });

  test('a late-month UTC instant does not roll into the next month', () => {
    const p = currentPeriodStart(new Date('2026-09-30T23:59:59Z'));
    assert.equal(p.toISOString(), '2026-09-01T00:00:00.000Z');
  });
});

describe('EntitlementError', () => {
  test('carries 402 so the API can signal "upgrade to continue"', () => {
    const e = new EntitlementError(METRIC.SEATS, 5, 5);
    assert.equal(e.statusCode, 402);
    assert.equal(e.metric, 'seats');
    assert.match(e.message, /Plan limit reached/);
  });
});
