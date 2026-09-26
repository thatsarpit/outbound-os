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
 * channel, not about the lead, so it must not stop us emailing them — email is
 * the only channel that reaches these people at all.
 */
const WHATSAPP_ONLY_STOPS = new Set([
  LEAD_STATUS.WA_UNAVAILABLE,
  LEAD_STATUS.WA_UNDELIVERED,
]);

const TRANSITIONS = {
  [LEAD_STATUS.NEW]: new Set([
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
   * @param {{channel?: string}} [options]  channel defaults to WhatsApp, so
   *   every existing caller keeps its current behaviour.
   */
  shouldBlockAutomation(status, { channel = 'whatsapp' } = {}) {
    const normalized = normalize(status);
    if (!STOP_AUTOMATION.has(normalized)) return false;
    if (channel === 'email' && WHATSAPP_ONLY_STOPS.has(normalized)) return false;
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
