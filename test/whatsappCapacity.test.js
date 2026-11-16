import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capacityShortfall, tierDailyLimit, CAPACITY_REASONS } from '../src/utils/whatsappCapacity.js';

test('tier names map to Meta limits and unknown tiers are never guessed', () => {
  assert.equal(tierDailyLimit('TIER_250'), 250);
  assert.equal(tierDailyLimit('tier_1k'), 1000);
  assert.equal(tierDailyLimit('TIER_UNLIMITED'), Infinity);
  assert.equal(tierDailyLimit('TIER_FUTURE_UNKNOWN'), null);
  assert.equal(tierDailyLimit(null), null);
});

test('an account under every ceiling may send', () => {
  const account = { id: 1, dailyLimit: 15, hourlyLimit: 2, messagesSentToday: 3 };
  assert.equal(capacityShortfall(account, { hourlySentCount: 1 }), null);
});

test('the configured daily limit binds for an explicit sender', () => {
  const account = { id: 1, dailyLimit: 15, hourlyLimit: 2, messagesSentToday: 15 };
  const shortfall = capacityShortfall(account, { hourlySentCount: 0 });
  assert.equal(shortfall.reason, 'daily_limit_reached');
  assert.equal(shortfall.used, 15);
  assert.equal(shortfall.limit, 15);
});

test('the hourly limit binds even with daily headroom left', () => {
  const account = { id: 1, dailyLimit: 15, hourlyLimit: 2, messagesSentToday: 3 };
  const shortfall = capacityShortfall(account, { hourlySentCount: 2 });
  assert.equal(shortfall.reason, 'hourly_limit_reached');
});

test("Meta's synced tier clamps a configured limit above it", () => {
  const account = { id: 1, dailyLimit: 500, hourlyLimit: 99, messagesSentToday: 250, metaMessagingTier: 'TIER_250' };
  const shortfall = capacityShortfall(account, { hourlySentCount: 0 });
  assert.equal(shortfall.reason, 'daily_limit_reached');
  assert.equal(shortfall.limit, 250, 'the provider ceiling must win over the operator setting');
  // A tier above the configured limit changes nothing: the operator's 500
  // still binds, not Meta's 10,000.
  const generous = { ...account, messagesSentToday: 500, metaMessagingTier: 'TIER_10K' };
  assert.equal(capacityShortfall(generous, { hourlySentCount: 0 }).limit, 500);
  // An unlimited tier leaves the configured limit in charge.
  const unlimited = { ...account, messagesSentToday: 499, metaMessagingTier: 'TIER_UNLIMITED' };
  assert.equal(capacityShortfall(unlimited, { hourlySentCount: 0 }), null);
});

test('warm-up mode is a real ceiling, not a log line', () => {
  const account = { id: 1, dailyLimit: 50, hourlyLimit: 99, messagesSentToday: 10 };
  const shortfall = capacityShortfall(account, { hourlySentCount: 0, warmup: { enabled: true, limit: 10 } });
  assert.equal(shortfall.reason, 'daily_limit_reached');
  assert.equal(shortfall.limit, 10);
  assert.equal(capacityShortfall(account, { hourlySentCount: 0, warmup: { enabled: false, limit: 10 } }), null);
});

test('unset limits fall back to instance defaults and zero counters never block', () => {
  const account = { id: 1, messagesSentToday: 0 };
  assert.equal(capacityShortfall(account, { hourlySentCount: 0, defaults: { maxMessagesPerDay: 15, hourlyLimit: 2 } }), null);
  const atDefault = { id: 1, messagesSentToday: 15 };
  assert.equal(capacityShortfall(atDefault, { defaults: { maxMessagesPerDay: 15 } }).reason, 'daily_limit_reached');
  assert.equal(capacityShortfall(null), null);
});

test('capacity reasons are the stable tokens queue processors defer on', () => {
  assert.deepEqual([...CAPACITY_REASONS], ['daily_limit_reached', 'hourly_limit_reached']);
});
