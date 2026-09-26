/**
 * Delivery-failure classification.
 *
 * The single place that decides whether a failed outbound message is worth
 * sending again. Everything about retry depends on this being right, in both
 * directions:
 *
 *   - Treating a transient failure as permanent writes off a real lead. This
 *     is not hypothetical: Meta's quality throttle ("healthy ecosystem
 *     engagement") was being recorded as permanently_failed, which excluded
 *     those leads from outreach selection for good.
 *
 *   - Treating a permanent failure as retryable is worse than useless. Sending
 *     again to a number that is not on WhatsApp cannot succeed, and repeated
 *     failed sends actively degrade the sender quality rating — which causes
 *     more throttling, which causes more failures.
 *
 * A third class matters more than either: COMPLIANCE. When someone opts out or
 * blocks the business, not retrying is a policy obligation, not an
 * optimisation. Those never retry regardless of counters or backoff.
 */

export const FAILURE_CLASS = Object.freeze({
  /** Transient. Safe to send again after a delay. */
  RETRYABLE: 'retryable',
  /** Will never succeed for this recipient on this channel. */
  PERMANENT: 'permanent',
  /** Recipient opted out or blocked us. Never retry. */
  COMPLIANCE: 'compliance',
  /** Unrecognised — treated as permanent so an unknown failure cannot loop. */
  UNKNOWN: 'unknown',
});

/**
 * Meta error codes, as delivered through AiSensy or the Cloud API directly.
 * Codes are more reliable than prose, which is localised and reworded.
 */
const CODE_CLASS = Object.freeze({
  131049: FAILURE_CLASS.RETRYABLE,   // per-user marketing limit / quality throttle
  131047: FAILURE_CLASS.RETRYABLE,   // re-engagement required (24h window closed)
  131048: FAILURE_CLASS.RETRYABLE,   // spam rate limit hit
  130429: FAILURE_CLASS.RETRYABLE,   // throughput rate limit
  131000: FAILURE_CLASS.RETRYABLE,   // generic internal error on Meta's side
  133016: FAILURE_CLASS.RETRYABLE,   // temporary account restriction

  131026: FAILURE_CLASS.PERMANENT,   // undeliverable — recipient cannot receive
  131030: FAILURE_CLASS.PERMANENT,   // recipient not in allowed list / invalid
  132000: FAILURE_CLASS.PERMANENT,   // template param mismatch — send is malformed
  132001: FAILURE_CLASS.PERMANENT,   // template does not exist
  132005: FAILURE_CLASS.PERMANENT,   // template format mismatch

  131056: FAILURE_CLASS.COMPLIANCE,  // recipient blocked the business
});

/**
 * Prose fallbacks. AiSensy surfaces several conditions as text with no code,
 * so these patterns carry real weight rather than being a nicety.
 *
 * Order matters: compliance patterns are tested first so an opt-out is never
 * caught by a broader retryable pattern.
 */
const PROSE_RULES = [
  // ── Compliance: never retry, whatever else the message says ──
  { re: /stop receiving marketing messages|opted out|unsubscrib/i, cls: FAILURE_CLASS.COMPLIANCE },
  { re: /blocked (the |your )?business|recipient has blocked/i, cls: FAILURE_CLASS.COMPLIANCE },

  // ── Retryable: Meta is deferring, not refusing ──
  // "not delivered to maintain healthy ecosystem engagement" is Meta's quality
  // throttle. It reads like a rejection and is not one — the same recipient
  // often accepts a later message, particularly a utility template.
  { re: /healthy ecosystem engagement/i, cls: FAILURE_CLASS.RETRYABLE },
  { re: /rate ?limit|too many requests|throughput/i, cls: FAILURE_CLASS.RETRYABLE },
  { re: /24 ?hour|session (has )?expired|re-?engagement/i, cls: FAILURE_CLASS.RETRYABLE },
  { re: /part of an experiment/i, cls: FAILURE_CLASS.RETRYABLE },
  { re: /temporar|try again|internal error|timeout|timed out/i, cls: FAILURE_CLASS.RETRYABLE },

  // ── Permanent: the recipient cannot receive this, ever ──
  { re: /not.*(a )?valid whatsapp|not on whatsapp|not registered|invalid_number|invalid number/i, cls: FAILURE_CLASS.PERMANENT },
  { re: /message undeliverable|undeliverable/i, cls: FAILURE_CLASS.PERMANENT },
  { re: /template/i, cls: FAILURE_CLASS.PERMANENT },
];

/**
 * @param {{ reason?: string|null, errorCode?: number|string|null }} input
 * @returns {{ cls: string, retryable: boolean, matched: string }}
 */
export function classifyDeliveryFailure({ reason = '', errorCode = null } = {}) {
  const code = Number(errorCode);
  if (Number.isFinite(code) && CODE_CLASS[code]) {
    const cls = CODE_CLASS[code];
    return { cls, retryable: cls === FAILURE_CLASS.RETRYABLE, matched: `code:${code}` };
  }

  const text = String(reason || '');
  for (const rule of PROSE_RULES) {
    if (rule.re.test(text)) {
      return { cls: rule.cls, retryable: rule.cls === FAILURE_CLASS.RETRYABLE, matched: `prose:${rule.re.source.slice(0, 32)}` };
    }
  }

  // Unknown failures are not retried. An unrecognised reason repeated on a
  // schedule is how a sender rating gets destroyed by a bug.
  return { cls: FAILURE_CLASS.UNKNOWN, retryable: false, matched: 'none' };
}

/** Message.status to record for a given classification. */
export function statusForClass(cls) {
  switch (cls) {
    case FAILURE_CLASS.RETRYABLE: return 'failed';
    case FAILURE_CLASS.COMPLIANCE: return 'cancelled';
    default: return 'permanently_failed';
  }
}

/**
 * Backoff before the next attempt. Deliberately long and widely spaced:
 * the dominant retryable failure is a quality throttle, and retrying a
 * throttled recipient quickly is what caused the throttle in the first place.
 *
 * @param {number} attempt 1-based attempt number that just failed
 * @returns {number} milliseconds to wait before the next attempt
 */
export function retryDelayMs(attempt) {
  const hours = [6, 24, 72][Math.max(0, Math.min(attempt - 1, 2))];
  const base = hours * 60 * 60 * 1000;
  // Jitter so a batch that failed together does not retry in lockstep.
  return Math.round(base * (0.85 + Math.random() * 0.3));
}

export const MAX_RETRY_ATTEMPTS = 3;

export default {
  FAILURE_CLASS,
  classifyDeliveryFailure,
  statusForClass,
  retryDelayMs,
  MAX_RETRY_ATTEMPTS,
};
