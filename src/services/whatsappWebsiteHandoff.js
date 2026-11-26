import { createHash, createHmac, randomBytes } from 'node:crypto';
import { secretsMatch } from '../utils/secretsMatch.js';

const TTL_SECONDS = 24 * 60 * 60;
const referencePattern = /(?:^|\n)Ref: (OS1-([1-9][0-9]{0,9})\.([0-9]{10})\.([a-zA-Z0-9_-]{16})\.([a-zA-Z0-9_-]{22}))\s*$/;

function signature(value, accountId, secret) {
  return createHmac('sha256', secret)
    .update(`outboundos-whatsapp-handoff:${accountId}:${value}`)
    .digest().subarray(0, 16).toString('base64url');
}

export function handoffDestination(account) {
  if (!account?.enabled) return null;
  const value = account.provider === 'ycloud' ? account.ycloudPhoneNumber
    : account.provider === 'meta' && account.cloudApiPhoneId ? account.phone : '';
  if (typeof value !== 'string' || !/^\+?[0-9 ()-]+$/.test(value)) return null;
  const phone = value.replace(/\D/g, '');
  return /^[1-9][0-9]{7,14}$/.test(phone) ? phone : null;
}

export function createWebsiteWhatsAppLink(source, account, now = new Date()) {
  const phone = handoffDestination(account);
  if (!phone || !source.enabled || !source.websiteLeadLabel || source.whatsappHandoffAccountId !== account.id) return null;
  const expiry = Math.floor(+now / 1000) + TTL_SECONDS;
  const reference = `OS1-${source.id}.${expiry}.${randomBytes(12).toString('base64url')}`;
  const token = `${reference}.${signature(reference, account.id, source.apiKey)}`;
  const store = source.name.replace(/\s+/g, ' ').trim().slice(0, 120);
  const text = `Hello ${store}, I have a product enquiry.\n\nRef: ${token}`;
  const url = new URL(`https://wa.me/${phone}`);
  url.searchParams.set('text', text);
  return url.href;
}

/** Accept an intact reference only from a provider-authenticated inbound account. */
export async function matchWebsiteWhatsAppReference(db, body, accountId, now = new Date()) {
  const match = referencePattern.exec(body);
  if (!match || !Number.isSafeInteger(accountId) || accountId < 1) return null;
  const [, token, sourceId, expiry, nonce, mac] = match;
  const second = Math.floor(+now / 1000);
  if (+expiry <= second || +expiry > second + TTL_SECONDS) return null;
  const source = await db.webhookSource.findUnique({ where: { id: Number(sourceId) } });
  if (!source?.enabled || !source.websiteLeadLabel || source.whatsappHandoffAccountId !== accountId ||
    !secretsMatch(mac, signature(`OS1-${sourceId}.${expiry}.${nonce}`, accountId, source.apiKey))) return null;
  return {
    key: createHash('sha256').update(token).digest('hex'),
    label: source.websiteLeadLabel,
    site: source.name.trim().slice(0, 120),
    content: body.slice(0, match.index).trimEnd() || body,
  };
}

export async function storeWebsiteWhatsAppMessage(db, message, match) {
  if (!match) return db.message.create({ data: message });
  const saveRegular = () => db.message.create({ data: message });
  try {
    return await db.$transaction(async tx => {
      const prior = await tx.message.findUnique({
        where: { websiteHandoffKey: match.key }, select: { id: true, waMessageId: true },
      });
      if (prior) {
        if (prior.waMessageId === message.waMessageId) return null;
        return tx.message.create({ data: message });
      }
      const attribution = { websiteLeadLabel: match.label, websiteSourceName: match.site };
      // A later website enquiry is visible on its own message. The first
      // confirmed entry can label a new WhatsApp lead without rewriting history.
      await tx.lead.updateMany({
        where: { id: message.leadId, source: 'whatsapp_inbound', websiteLeadLabel: null,
          originSupplierId: null, messages: { none: {} } },
        data: attribution,
      });
      return tx.message.create({
        data: { ...message, content: match.content, websiteHandoffKey: match.key, ...attribution },
      });
    });
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    const prior = await db.message.findUnique({
      where: { websiteHandoffKey: match.key }, select: { waMessageId: true },
    });
    if (!prior) throw error;
    return prior.waMessageId === message.waMessageId ? null : saveRegular();
  }
}
