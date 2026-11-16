/**
 * Cross-channel contact frequency budget.
 *
 * Each channel's automation decides on its own today: the follow-up engine,
 * the email queue and a campaign can all touch the same lead on the same day
 * without any of them knowing about the others. From the recipient's side
 * those are not three systems, they are one business messaging too often —
 * which reads as spam, invites opt-outs and drags the sender rating down.
 *
 * This helper is the shared answer to "may automation touch this lead right
 * now?". It is pure: callers load the lead's recent outbound messages and the
 * workspace's limits, and it returns a decision with the time the next
 * automated touch becomes eligible, so queue processors can defer rather than
 * cancel.
 *
 * Boundaries, chosen so default limits change nothing that is deliberate:
 *   - Only AUTOMATED sends are gated. An operator typing to a lead is
 *     judgment, not automation, and is never blocked.
 *   - The first-touch burst is sanctioned product behaviour (reach a brand-new
 *     enquiry on every channel at once), so a lead's first hours are exempt
 *     and fresh first-touch rows are identified by their automation key.
 *   - Touches are counted across every channel, because the recipient does
 *     not experience channels separately.
 */

/**
 * Statuses that plausibly reached (or will reach) the recipient. 'sending' is
 * deliberately absent: gates run while their own message is in that state,
 * and a gate must not count the very send it is deciding.
 */
export const TOUCH_STATUSES = ['sent', 'unconfirmed', 'delivered', 'read'];

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant a message row counts as a touch. */
export function touchTime(row) {
  const at = row?.sentAt || row?.createdAt;
  const time = at instanceof Date ? at.getTime() : new Date(at || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Decide whether one more automated touch fits the budget.
 *
 * @param {Array<{sentAt?: Date|string|null, createdAt?: Date|string|null}>} touches
 *   The lead's outbound messages (any channel) with a TOUCH_STATUSES status,
 *   from at most the last 7 days. Rows older than the window are ignored, so
 *   over-fetching is harmless.
 * @param {{ now?: Date|number, maxPerDay?: number, maxPerWeek?: number, minGapMinutes?: number }} options
 * @returns {{ allowed: true } | { allowed: false, reason: string, nextEligibleAt: Date }}
 *   `reason` is a stable token: contact_budget_daily | contact_budget_weekly |
 *   contact_budget_gap. `nextEligibleAt` is when the decision would flip,
 *   assuming no further touches — the natural deferral target.
 */
export function evaluateContactBudget(touches, { now = Date.now(), maxPerDay = 2, maxPerWeek = 12, minGapMinutes = 25 } = {}) {
  const at = now instanceof Date ? now.getTime() : Number(now);
  const times = (Array.isArray(touches) ? touches : [])
    .map(touchTime)
    .filter((time) => time > 0 && time <= at && time > at - WEEK_MS)
    .sort((a, b) => a - b);

  // Evaluate every rule and defer to the latest eligibility instant, so one
  // deferral clears all of them instead of hopping limit to limit.
  const violations = [];

  const gapMs = Math.max(0, Number(minGapMinutes) || 0) * 60 * 1000;
  const lastTouch = times[times.length - 1];
  if (gapMs > 0 && lastTouch !== undefined && at - lastTouch < gapMs) {
    violations.push({ reason: 'contact_budget_gap', nextEligibleAt: lastTouch + gapMs });
  }

  const day = times.filter((time) => time > at - DAY_MS);
  if (maxPerDay > 0 && day.length >= maxPerDay) {
    // Eligible when enough of the day's touches age out of the rolling window.
    violations.push({ reason: 'contact_budget_daily', nextEligibleAt: day[day.length - maxPerDay] + DAY_MS });
  }

  if (maxPerWeek > 0 && times.length >= maxPerWeek) {
    violations.push({ reason: 'contact_budget_weekly', nextEligibleAt: times[times.length - maxPerWeek] + WEEK_MS });
  }

  if (violations.length === 0) return { allowed: true };
  const worst = violations.reduce((a, b) => (b.nextEligibleAt > a.nextEligibleAt ? b : a));
  return { allowed: false, reason: worst.reason, nextEligibleAt: new Date(worst.nextEligibleAt) };
}

export default { TOUCH_STATUSES, evaluateContactBudget, touchTime, WEEK_MS, DAY_MS };
