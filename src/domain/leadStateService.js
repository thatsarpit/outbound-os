import logger from '../utils/logger.js';

export const LEAD_STATUS = {
  NEW: 'new',
  CONTACTED: 'contacted',
  REPLIED: 'replied',
  ENGAGED: 'engaged',
  PAUSED: 'paused',
  CLOSED: 'closed',
  WA_UNAVAILABLE: 'wa_unavailable',
  WA_UNDELIVERED: 'wa_undelivered',
};

const STOP_AUTOMATION = new Set([
  LEAD_STATUS.REPLIED,
  LEAD_STATUS.ENGAGED,
  LEAD_STATUS.PAUSED,
  LEAD_STATUS.CLOSED,
  LEAD_STATUS.WA_UNAVAILABLE,
  LEAD_STATUS.WA_UNDELIVERED,
]);

/**
 * These two say WhatsApp cannot reach the number. That is a fact about one
 * channel, not about the lead, so it must not stop email or iMessage — for
 * these people those are the only channels that reach them at all.
 */
const WHATSAPP_ONLY_STOPS = new Set([
  LEAD_STATUS.WA_UNAVAILABLE,
  LEAD_STATUS.WA_UNDELIVERED,
]);

const TRANSITIONS = {
  // A reply is a reply whatever came before it. Someone who writes first
  // (their lead is created by that message, as 'new') or who answers on email
  // or iMessage after WhatsApp could not reach them has replied, and must stop
  // receiving automated follow-ups.
  [LEAD_STATUS.NEW]: new Set([
    LEAD_STATUS.REPLIED,
    LEAD_STATUS.ENGAGED,
    LEAD_STATUS.CONTACTED,
    LEAD_STATUS.PAUSED,
    LEAD_STATUS.WA_UNAVAILABLE,
    LEAD_STATUS.WA_UNDELIVERED,
    LEAD_STATUS.CLOSED,
  ]),
  [LEAD_STATUS.CONTACTED]: new Set([
    LEAD_STATUS.REPLIED,
    LEAD_STATUS.ENGAGED,
    LEAD_STATUS.PAUSED,
    LEAD_STATUS.WA_UNAVAILABLE,
    LEAD_STATUS.WA_UNDELIVERED,
    LEAD_STATUS.CLOSED,
  ]),
  [LEAD_STATUS.REPLIED]: new Set([
    LEAD_STATUS.ENGAGED,
    LEAD_STATUS.PAUSED,
    LEAD_STATUS.CLOSED,
  ]),
  [LEAD_STATUS.ENGAGED]: new Set([
    LEAD_STATUS.PAUSED,
    LEAD_STATUS.CLOSED,
  ]),
  [LEAD_STATUS.PAUSED]: new Set([
    LEAD_STATUS.ENGAGED,
    LEAD_STATUS.CLOSED,
    LEAD_STATUS.WA_UNAVAILABLE,
  ]),
  [LEAD_STATUS.CLOSED]: new Set([
    LEAD_STATUS.PAUSED,
    LEAD_STATUS.ENGAGED,
  ]),
  [LEAD_STATUS.WA_UNAVAILABLE]: new Set([
    LEAD_STATUS.REPLIED,
    LEAD_STATUS.ENGAGED,
    LEAD_STATUS.PAUSED,
    LEAD_STATUS.CLOSED,
  ]),
  [LEAD_STATUS.WA_UNDELIVERED]: new Set([
    LEAD_STATUS.PAUSED,
    LEAD_STATUS.CLOSED,
    LEAD_STATUS.REPLIED,
    LEAD_STATUS.ENGAGED,
  ]),
};

function normalize(status) {
  return String(status || '').toLowerCase();
}

class LeadStateService {
  /**
   * @param {string} status
   * @param {{channel?: string}} [options]  the channel about to be used:
   *   whatsapp (the default), email or imessage.
   */
  shouldBlockAutomation(status, { channel = 'whatsapp' } = {}) {
    const normalized = normalize(status);
    if (!STOP_AUTOMATION.has(normalized)) return false;
    if (channel !== 'whatsapp' && WHATSAPP_ONLY_STOPS.has(normalized)) return false;
    return true;
  }

  canTransition(fromStatus, toStatus) {
    const from = normalize(fromStatus);
    const to = normalize(toStatus);
    if (!from || !to) return false;
    if (from === to) return true;
    return !!TRANSITIONS[from]?.has(to);
  }

  ensureTransition(fromStatus, toStatus, context = '') {
    if (this.canTransition(fromStatus, toStatus)) return true;
    logger.warn(`Invalid lead status transition ${fromStatus} -> ${toStatus}${context ? ` (${context})` : ''}`);
    return false;
  }

  computeInboundStatus(currentStatus, inboundCount) {
    const current = normalize(currentStatus);
    if (current === LEAD_STATUS.PAUSED) return LEAD_STATUS.PAUSED;
    return inboundCount >= 1 ? LEAD_STATUS.ENGAGED : LEAD_STATUS.REPLIED;
  }

  computeManualTakeoverStatus(currentStatus) {
    const current = normalize(currentStatus);
    if ([LEAD_STATUS.NEW, LEAD_STATUS.CONTACTED, LEAD_STATUS.REPLIED, LEAD_STATUS.ENGAGED].includes(current)) {
      return LEAD_STATUS.PAUSED;
    }
    return current || LEAD_STATUS.PAUSED;
  }
}

export default new LeadStateService();
