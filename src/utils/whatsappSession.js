const WINDOW_MS = 24 * 60 * 60 * 1000;
/** Import time never opens a reply window: use the customer's provider timestamp. */
export function whatsappSession(messages, accountId, now = Date.now()) {
  let latest = 0;
  for (const message of messages) {
    if (
      message.direction !== 'inbound' ||
      message.channel !== 'whatsapp' ||
      message.waAccount !== accountId
    )
      continue;
    const timestamp = new Date(message.sentAt || message.createdAt).getTime();
    if (Number.isFinite(timestamp) && timestamp <= now + 60_000)
      latest = Math.max(latest, timestamp);
  }
  const expires = latest ? latest + WINDOW_MS : null;
  return {
    accountId,
    lastInboundAt: latest ? new Date(latest).toISOString() : null,
    expiresAt: expires ? new Date(expires).toISOString() : null,
    isOpen: Boolean(expires && expires > now),
    reason: expires
      ? expires > now
        ? 'open'
        : 'expired'
      : 'no_customer_message',
  };
}
export function whatsappFailureReason(code, detail) {
  const reasons = {
    131047: 're_engagement_required',
    131026: 'message_undeliverable',
    131049: 'marketing_limit',
    131048: 'spam_limit',
    131042: 'payment_issue',
    190: 'authentication_failed',
  };
  return (
    reasons[Number(code)] || String(detail || 'delivery_failed').slice(0, 300)
  );
}
