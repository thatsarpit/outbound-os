/**
 * WhatsApp send-capacity decision.
 *
 * The per-account daily and hourly limits were tracked, displayed in Settings
 * and printed in logs, but no send path ever consulted them — a campaign with
 * an explicit sender, an agent through MCP, or the follow-up queue could sail
 * past every number the settings promised. This helper is the one answer to
 * "does this account have room for another outreach send right now", used by
 * account rotation and by every outreach dispatch.
 *
 * Three ceilings apply, and the lowest wins:
 *   - the account's configured dailyLimit (or the instance default),
 *   - Meta's own messaging tier for the number, when a sync has stored it —
 *     the tier counts unique business-initiated conversations per rolling
 *     24 hours, so capping total messages at it is deliberately conservative,
 *   - the warm-up ramp, when the instance runs in warm-up mode.
 *
 * Operator-initiated replies and transactional order updates are exempt by
 * their callers: the limits exist to pace outreach, not to stop a human
 * answering a customer or a buyer hearing about their own shipment.
 */

/**
 * Meta's published messaging_limit_tier values, as business-initiated
 * conversations per rolling 24 hours. An unknown or unset tier returns null:
 * never guess a ceiling Meta has not stated.
 */
export const TIER_LIMITS = Object.freeze({
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: Infinity,
});

export function tierDailyLimit(tier) {
  const limit = TIER_LIMITS[String(tier || '').toUpperCase()];
  return limit === undefined ? null : limit;
}

/**
 * @param {{ dailyLimit?: number, hourlyLimit?: number, messagesSentToday?: number, metaMessagingTier?: string|null }} account
 * @param {{ hourlySentCount?: number,
 *           defaults?: { maxMessagesPerDay?: number, hourlyLimit?: number },
 *           warmup?: { enabled?: boolean, limit?: number } }} context
 * @returns {null | { reason: 'daily_limit_reached'|'hourly_limit_reached', used: number, limit: number }}
 *   null means the account has room for one more outreach send.
 */
export function capacityShortfall(account, { hourlySentCount = 0, defaults = {}, warmup = {} } = {}) {
  if (!account) return null;

  const ceilings = [Number(account.dailyLimit) || Number(defaults.maxMessagesPerDay) || 15];
  const tier = tierDailyLimit(account.metaMessagingTier);
  if (tier !== null) ceilings.push(tier);
  if (warmup.enabled && Number(warmup.limit) > 0) ceilings.push(Number(warmup.limit));
  const daily = Math.min(...ceilings);
  const sentToday = Number(account.messagesSentToday) || 0;
  if (Number.isFinite(daily) && daily > 0 && sentToday >= daily) {
    return { reason: 'daily_limit_reached', used: sentToday, limit: daily };
  }

  const hourly = Number(account.hourlyLimit) || Number(defaults.hourlyLimit) || 2;
  const sentThisHour = Number(hourlySentCount) || 0;
  if (hourly > 0 && sentThisHour >= hourly) {
    return { reason: 'hourly_limit_reached', used: sentThisHour, limit: hourly };
  }

  return null;
}

/** Reasons that mean "wait for capacity", as opposed to a failed send. */
export const CAPACITY_REASONS = Object.freeze(['daily_limit_reached', 'hourly_limit_reached']);

export default { TIER_LIMITS, tierDailyLimit, capacityShortfall, CAPACITY_REASONS };
