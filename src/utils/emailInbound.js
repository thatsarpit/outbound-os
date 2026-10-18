function headerText(headers, name) {
  const raw = headers?.get?.(name);
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && typeof value === 'object') return String(value.value || '');
  return String(value || '');
}

export function classifyInboundEmail({ headers, subject = '' } = {}) {
  const contentType = headers?.get?.('content-type');
  const type = headerText(headers, 'content-type').toLowerCase();
  const reportType = String(contentType?.params?.['report-type'] || '').toLowerCase();
  if (type === 'message/delivery-status'
    || (type.startsWith('multipart/report') && (reportType === 'delivery-status' || /report-type\s*=\s*"?delivery-status/i.test(type)))) {
    return 'delivery_report';
  }
  if (type.startsWith('multipart/report')) return 'automatic_reply';
  const submitted = headerText(headers, 'auto-submitted').trim().toLowerCase().split(/[;\s]/)[0];
  if (submitted && submitted !== 'no') return 'automatic_reply';
  for (const name of ['x-autoreply', 'x-autorespond', 'x-auto-reply']) {
    const value = headerText(headers, name).trim().toLowerCase();
    if (value && !['no', 'false', '0'].includes(value)) return 'automatic_reply';
  }
  // Explicit responder subject prefixes cover older vacation responders. A
  // phrase in the body (or quoted mail) is not enough to hide a human reply.
  if (/^(?:auto(?:matic)?[ -]?reply|out of (?:the )?office|vacation (?:reply|response))\s*(?::|$)/i.test(subject.trim())) {
    return 'automatic_reply';
  }
  return 'human';
}

// Null is retained for legacy data, which has not been retroactively audited.
// A partial download cannot establish a human reply, even on an old row.
export const HUMAN_REPLY_WHERE = {
  direction: 'inbound',
  AND: [{ OR: [
    { channel: { not: 'email' } },
    { emailInboundKind: 'human' },
    { emailInboundKind: null, status: { not: 'partial' } },
  ] }],
};

export function isHumanReply(message) {
  return message?.direction === 'inbound' && (message.channel !== 'email'
    || message.emailInboundKind === 'human'
    || (message.emailInboundKind == null && message.status !== 'partial'));
}

export const ACTIONABLE_CONVERSATION_WHERE = { OR: [
  { direction: 'outbound' }, HUMAN_REPLY_WHERE,
] };

export function isActionableConversationMessage(message) {
  return message?.direction === 'outbound' || isHumanReply(message);
}
