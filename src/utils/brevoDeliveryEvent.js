import crypto from 'node:crypto';

const ALIASES = {
  request: 'sent', delivered: 'delivered', sent: 'sent',
  opened: 'opened', unique_opened: 'opened', unique_open: 'opened',
  click: 'click', clicked: 'click', unique_click: 'click',
  hard_bounce: 'hard_bounce', hardbounce: 'hard_bounce',
  soft_bounce: 'soft_bounce', softbounce: 'soft_bounce', deferred: 'deferred',
  blocked: 'blocked', invalid: 'invalid', invalid_email: 'invalid', error: 'error',
  unsubscribe: 'unsubscribe', unsubscribed: 'unsubscribe',
  spam: 'complaint', complaint: 'complaint', complained: 'complaint',
  proxy_open: 'proxy_open', unique_proxy_open: 'proxy_open',
};
const SUCCESS_RANK = { sent: 1, delivered: 2, opened: 3, click: 4 };
const TEMPORARY = new Set(['soft_bounce', 'deferred']);
const TERMINAL = new Set(['hard_bounce', 'invalid', 'blocked', 'error']);

function scalar(value, max = 998) {
  if (!['string', 'number'].includes(typeof value)) return '';
  const text = String(value).trim();
  return text.length <= max ? text : '';
}

export function brevoMessageId(value) {
  const id = scalar(value).replace(/^<([^<>]+)>$/, '$1');
  return id && !/[\s<>]/.test(id) ? id : null;
}

function occurrenceTime(value) {
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(scalar(value))) return null;
  const time = Number(value);
  const millis = time < 1e12 ? time * 1000 : time;
  return millis > 0 && millis <= 8.64e15 ? new Date(millis) : null;
}

export function normalizeBrevoEvent(payload, accountScope = null) {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') return null;
  const recipient = scalar(payload.email || payload.recipient || payload.to, 320).toLowerCase();
  const rawEvent = scalar(payload.event || payload.type, 80)
    .replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[ -]/g, '_');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipient) || !rawEvent) return null;
  const event = Object.hasOwn(ALIASES, rawEvent) ? ALIASES[rawEvent] : rawEvent;
  const campaign = scalar(payload.camp_id || payload.campaign_id || payload.campaignId, 32);
  const providerCampaignId = /^[1-9]\d*$/.test(campaign) ? campaign : null;
  const providerMessageId = brevoMessageId(payload['message-id'] || payload.messageId || payload.message_id);
  // ts_epoch is documented as send time for transactional events. Local date
  // strings have no reliable time zone, so neither is used as occurrence time.
  const occurredAt = occurrenceTime(payload.ts_event) || occurrenceTime(payload.ts);
  const eventKey = crypto.createHash('sha256').update(JSON.stringify([
    'brevo', accountScope, recipient, providerCampaignId, providerMessageId,
    event, occurredAt?.toISOString() || null, scalar(payload.URL || payload.link, 4096),
  ])).digest('hex');
  // payload.id identifies the webhook registration, not this delivery event.
  return { eventKey, event, recipient, providerCampaignId, providerMessageId, occurredAt };
}

export function brevoEventKind(event) {
  if (event === 'unsubscribe' || event === 'complaint') return 'suppression';
  if (event === 'proxy_open') return 'tracking';
  return Object.hasOwn(SUCCESS_RANK, event) || TEMPORARY.has(event) || TERMINAL.has(event) ? 'delivery' : 'unknown';
}

export function brevoDeliveryTransition(message, receipt) {
  const event = receipt.event;
  if (brevoEventKind(event) !== 'delivery') return null;
  const previousAt = message.providerDeliveryAt && new Date(message.providerDeliveryAt);
  if (previousAt && receipt.occurredAt && receipt.occurredAt < previousAt) return null;

  const previous = message.providerDeliveryStatus;
  const floor = message.status === 'read' ? 3 : message.status === 'delivered' ? 2 : 0;
  const previousRank = Math.max(floor, SUCCESS_RANK[previous] || 0);
  const nextRank = SUCCESS_RANK[event] || 0;
  if (nextRank) {
    if (nextRank <= previousRank) return null;
    // Acceptance cannot undo an already reported delivery failure. Stronger
    // delivery evidence can, provided it is not older or missing its time.
    if ((TERMINAL.has(previous) || TEMPORARY.has(previous) || message.status === 'permanently_failed')
      && (event === 'sent' || (previousAt && !receipt.occurredAt))) return null;
  } else {
    if (previousRank >= 2) return null;
    if (TEMPORARY.has(event) && (TERMINAL.has(previous) || message.status === 'permanently_failed')) return null;
    if (previous === event && (!receipt.occurredAt || (previousAt && +receipt.occurredAt === +previousAt))) return null;
  }

  return {
    status: TERMINAL.has(event) ? 'permanently_failed'
      : event === 'opened' || event === 'click' ? 'read'
        : event === 'delivered' ? 'delivered' : 'sent',
    providerDeliveryStatus: event,
    providerDeliveryAt: receipt.occurredAt || previousAt || null,
    providerStatusReason: `brevo_webhook:${event}`,
  };
}
