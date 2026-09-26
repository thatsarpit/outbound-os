/**
 * Deterministic reply classifier.
 *
 * Replaces the LLM classification pass. The model is gone, but two behaviours
 * it drove are not optional: a lead who says "stop" or complains must be paused
 * so we stop messaging them, and an out-of-office auto-reply must not be
 * treated as a real reply. Keyword rules handle both without a model.
 *
 * Rules are ordered — opt-out is checked before everything else, because a
 * message like "stop, I'm on leave" must pause rather than reschedule.
 *
 * Returns the same shape the LLM did, so callers are unchanged:
 *   { intent, urgency, nextAction, summary, confidence }
 */

const OPT_OUT = [
  'stop', 'unsubscribe', 'opt out', 'opt-out', 'remove me', 'do not contact',
  "don't contact", 'take me off', 'no longer interested', 'leave me alone',
];

const COMPLAINT = [
  'spam', 'scam', 'fraud', 'harass', 'report you', 'illegal', 'complain',
  'stop bothering', 'stop messaging',
];

const OUT_OF_OFFICE = [
  'out of office', 'ooo', 'on leave', 'on vacation', 'annual leave',
  'currently away', 'maternity leave', 'paternity leave', 'auto-reply',
  'automatic reply', 'will be back on', 'away from my desk', 'public holiday',
];

const POSITIVE = [
  'interested', 'send me', 'share the', 'quote', 'pricing', 'price list',
  'how much', 'cost', 'moq', 'sample', 'catalog', 'catalogue', 'available',
  'proceed', 'order', 'buy', 'purchase', 'yes please', 'go ahead',
];

const QUESTION = ['?', 'what', 'when', 'where', 'which', 'can you', 'could you', 'do you'];

const NEGATIVE_SOFT = ['not interested', 'no thanks', 'no thank you', 'not now', 'already have'];

const has = (text, list) => list.some((k) => text.includes(k));

/**
 * @param {object} _lead - kept for signature parity with the previous LLM call
 * @param {string} replyText
 * @returns {{intent:string,urgency:string,nextAction:string,summary:string,confidence:string}|null}
 */
export function classifyReply(_lead, replyText) {
  const raw = String(replyText || '').trim();
  if (!raw) return null;
  const text = raw.toLowerCase();
  const summary = raw.replace(/\s+/g, ' ').slice(0, 140);

  // Order matters: opt-out and complaint win over everything.
  if (has(text, COMPLAINT)) {
    return { intent: 'complaint', urgency: 'high', nextAction: 'stop_contact', summary, confidence: 'high' };
  }
  // "stop" is matched as a whole word so "stockist" or "nonstop" don't trigger it.
  if (new RegExp(`\\b(${OPT_OUT.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`).test(text)) {
    return { intent: 'negative', urgency: 'high', nextAction: 'stop_contact', summary, confidence: 'high' };
  }
  if (has(text, OUT_OF_OFFICE)) {
    return { intent: 'out_of_office', urgency: 'low', nextAction: 'reschedule', summary, confidence: 'medium' };
  }
  if (has(text, NEGATIVE_SOFT)) {
    return { intent: 'negative', urgency: 'low', nextAction: 'stop_contact', summary, confidence: 'medium' };
  }
  if (has(text, POSITIVE)) {
    return { intent: 'positive', urgency: 'high', nextAction: 'reply_now', summary, confidence: 'medium' };
  }
  if (has(text, QUESTION)) {
    return { intent: 'question', urgency: 'medium', nextAction: 'reply_now', summary, confidence: 'low' };
  }
  return { intent: 'neutral', urgency: 'medium', nextAction: 'review', summary, confidence: 'low' };
}

export default { classifyReply };
