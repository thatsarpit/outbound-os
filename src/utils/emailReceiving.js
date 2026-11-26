/** Routing is configured outside the app; only explicitly cut-over addresses skip IMAP. */
export function usesCloudflareReceiving(account, env = process.env) {
  const email = String(account?.email || '').trim().toLowerCase();
  return Boolean(email) && String(env.EMAIL_CLOUDFLARE_ACCOUNTS || '').split(',')
    .some(value => value.trim().toLowerCase() === email);
}

export function emailReceivingStatus(account, env = process.env) {
  if (usesCloudflareReceiving(account, env)) {
    return { receivingProvider: 'cloudflare', receivingReady: env.EMAIL_INGRESS_ENABLED === 'true'
      && typeof env.EMAIL_INGRESS_SECRET === 'string' && env.EMAIL_INGRESS_SECRET.length >= 32 };
  }
  return { receivingProvider: account?.imapHost ? 'imap' : 'none' };
}

const IMAP_SYNC_WINDOW_MS = 15 * 60_000;

export async function loadEmailReceiptEvidence(db, accountIds) {
  if (!accountIds.length) return new Map();
  const where = { emailAccountId: { in: accountIds } };
  const [receipts, replies, deliveries] = await Promise.all([
    db.inboundEmailReceipt.groupBy({
      by: ['emailAccountId', 'provider'], where: { ...where, processedAt: { not: null } },
      _max: { receivedAt: true },
    }),
    db.message.groupBy({
      by: ['emailAccountId'], where: { ...where, channel: 'email', direction: 'inbound', emailInboundKind: 'human' },
      _max: { sentAt: true },
    }),
    db.emailDeliveryEvent.groupBy({
      by: ['emailAccountId'], where: { ...where, event: 'delivered', messageId: { not: null } },
      _max: { receivedAt: true },
    }),
  ]);
  const evidence = new Map(accountIds.map(id => [id, {
    lastCloudflareReceiptAt: null, lastImapReceiptAt: null, lastMatchedReplyAt: null, lastConfirmedDeliveryAt: null,
  }]));
  for (const row of receipts) {
    const item = evidence.get(row.emailAccountId);
    if (row.provider === 'cloudflare') item.lastCloudflareReceiptAt = row._max.receivedAt;
    if (row.provider === 'imap') item.lastImapReceiptAt = row._max.receivedAt;
  }
  for (const row of replies) evidence.get(row.emailAccountId).lastMatchedReplyAt = row._max.sentAt;
  for (const row of deliveries) evidence.get(row.emailAccountId).lastConfirmedDeliveryAt = row._max.receivedAt;
  return evidence;
}

export function inboxEmailHealth(accounts, evidence, { now = Date.now(), env = process.env } = {}) {
  let verified = 0;
  let imapCurrent = 0;
  let cloudflareConfigured = 0;
  let cloudflareWithReceipts = 0;
  let cloudflareUnavailable = 0;
  const enabled = accounts.filter(account => account.enabled);
  for (const account of enabled) {
    if (account.status === 'verified') verified++;
    const receiving = emailReceivingStatus(account, env);
    if (receiving.receivingProvider === 'cloudflare') {
      if (receiving.receivingReady) {
        cloudflareConfigured++;
        if (evidence.get(account.id)?.lastCloudflareReceiptAt) cloudflareWithReceipts++;
      } else {
        cloudflareUnavailable++;
      }
    } else if (receiving.receivingProvider === 'imap' && !account.lastReceivingError && account.lastSyncAt) {
      const age = now - new Date(account.lastSyncAt).getTime();
      if (age >= -300_000 && age < IMAP_SYNC_WINDOW_MS) imapCurrent++;
    }
  }
  const receivingDetail = [
    imapCurrent ? `${imapCurrent} IMAP recently synced` : null,
    cloudflareConfigured ? `${cloudflareWithReceipts} of ${cloudflareConfigured} Cloudflare inboxes have received mail` : null,
    cloudflareUnavailable ? `${cloudflareUnavailable} Cloudflare inboxes need configuration` : null,
  ].filter(Boolean).join(' · ') || 'Receiving unconfirmed';
  return {
    status: !verified ? 'offline' : imapCurrent === enabled.length ? 'ready' : 'limited',
    total: enabled.length,
    verified,
    inbound: imapCurrent + cloudflareWithReceipts,
    detail: `${verified} verified sender${verified === 1 ? '' : 's'} · ${receivingDetail}`,
  };
}
