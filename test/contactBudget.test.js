import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateContactBudget, TOUCH_STATUSES, DAY_MS, WEEK_MS } from '../src/utils/contactBudget.js';
import { contactBudgetGate } from '../src/services/contactBudget.js';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const minutesAgo = (minutes) => ({ sentAt: new Date(NOW - minutes * 60_000) });
const limits = { now: NOW, maxPerDay: 2, maxPerWeek: 12, minGapMinutes: 25 };

test('an untouched lead is allowed and an empty history never blocks', () => {
  assert.deepEqual(evaluateContactBudget([], limits), { allowed: true });
  assert.deepEqual(evaluateContactBudget(undefined, limits), { allowed: true });
});

test('the minimum gap defers until the last touch ages past it', () => {
  const decision = evaluateContactBudget([minutesAgo(10)], limits);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'contact_budget_gap');
  assert.equal(decision.nextEligibleAt.getTime(), NOW - 10 * 60_000 + 25 * 60_000);
  assert.deepEqual(evaluateContactBudget([minutesAgo(26)], limits), { allowed: true });
});

test('the daily cap counts a rolling day across channels and names the instant it clears', () => {
  const decision = evaluateContactBudget([minutesAgo(23 * 60), minutesAgo(60)], limits);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'contact_budget_daily');
  // Eligible when the older of the two counted touches leaves the window.
  assert.equal(decision.nextEligibleAt.getTime(), NOW - 23 * 60 * 60_000 + DAY_MS);
  // The same touches one day later have aged out.
  assert.deepEqual(evaluateContactBudget([minutesAgo(25 * 60), minutesAgo(25 * 60 + 5)], limits), { allowed: true });
});

test('the weekly cap binds even when each day is under its own limit', () => {
  const spread = Array.from({ length: 12 }, (_, i) => minutesAgo((i + 1) * 12 * 60 + 30));
  const decision = evaluateContactBudget(spread, { ...limits, maxPerDay: 99 });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'contact_budget_weekly');
});

test('simultaneous violations defer once, to the latest eligibility instant', () => {
  const decision = evaluateContactBudget([minutesAgo(5), minutesAgo(30)], limits);
  assert.equal(decision.allowed, false);
  // Daily clears later than the 25-minute gap, so daily must win the deferral.
  assert.equal(decision.reason, 'contact_budget_daily');
  assert.ok(decision.nextEligibleAt.getTime() > NOW + 23 * 60 * 60_000);
});

test('future-dated and ancient rows are ignored rather than counted', () => {
  const rows = [{ sentAt: new Date(NOW + 60_000) }, { sentAt: new Date(NOW - WEEK_MS - 1) }, { createdAt: 'not a date' }];
  assert.deepEqual(evaluateContactBudget(rows, limits), { allowed: true });
});

test("'sending' is not a touch: a gate must not count the send it is deciding", () => {
  assert.ok(!TOUCH_STATUSES.includes('sending'));
  assert.ok(!TOUCH_STATUSES.includes('queued'));
});

// ── Service gate: exemptions and ledger query, against a stub db ──

const stubDb = (rows, calls = []) => ({ message: { findMany: async (args) => { calls.push(args); return rows; } } });

test("a lead's first day is sanctioned burst territory and skips the ledger entirely", async () => {
  const calls = [];
  const lead = { id: 1, createdAt: new Date(NOW - 2 * 60 * 60_000) };
  const decision = await contactBudgetGate(lead, { now: new Date(NOW), db: stubDb([minutesAgo(1)], calls) });
  assert.deepEqual(decision, { allowed: true });
  assert.equal(calls.length, 0, 'the exempt period must not even query');
});

test('after the first day the gate reads the message ledger and defers', async () => {
  const lead = { id: 1, createdAt: new Date(NOW - 3 * DAY_MS) };
  const decision = await contactBudgetGate(lead, { now: new Date(NOW), db: stubDb([minutesAgo(10)]) });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'contact_budget_gap');
});

test("day-one touches do not consume day two's budget", async () => {
  // Lead created 26h ago; both touches happened inside the exempt first 24h.
  const lead = { id: 1, createdAt: new Date(NOW - 26 * 60 * 60_000) };
  const burst = [minutesAgo(25 * 60), minutesAgo(25 * 60 + 7)];
  const decision = await contactBudgetGate(lead, { now: new Date(NOW), db: stubDb(burst) });
  assert.deepEqual(decision, { allowed: true });
});

test('a multi-channel campaign excludes its own rows but still counts non-campaign touches', async () => {
  const calls = [];
  const lead = { id: 1, createdAt: new Date(NOW - 3 * DAY_MS) };
  await contactBudgetGate(lead, { now: new Date(NOW), excludeCampaignId: 7, db: stubDb([], calls) });
  // A bare { not: 7 } would also drop campaignId NULL rows in SQL, silently
  // uncounting every follow-up and email touch — the NULL arm is the point.
  assert.deepEqual(calls[0].where.AND[1], { OR: [{ campaignId: null }, { campaignId: { not: 7 } }] });
});
