import { createHash } from 'node:crypto';
import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import activityLog, { EVENT_TYPES } from '../utils/activityLog.js';
import leadScorer from './leadScorer.js';
import { classifyInboundEmail, HUMAN_REPLY_WHERE } from '../utils/emailInbound.js';
import { InboundEmailSpool } from '../utils/inboundEmailSpool.js';
import { EMAIL_INGRESS_MAX_BYTES } from '../utils/emailIngressSignature.js';
import { emailAttachmentMetadata } from '../utils/emailAttachments.js';
import { receivedEmailText } from '../utils/receivedEmailText.js';

const normalizeAddress = (value) => String(value || '').trim().toLowerCase();
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const refsOf = (parsed) => [...new Set([parsed.inReplyTo, ...[].concat(parsed.references || []).reverse()]
  .flat().filter((value) => typeof value === 'string' && value.length < 1000))].slice(0, 50);

async function publishInboundEmailActivity(row) {
  const event = activityLog.publishPersisted(row);
  try {
    const { broadcastEvent } = await import('../api.js');
    broadcastEvent('email_reply', event.data);
  } catch { /* The persisted activity remains available when no API process is loaded. */ }
}

export function sanitizeReceivedEmailHtml(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return sanitizeHtml(value, {
    allowedTags: ['p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'h1', 'h2', 'h3', 'h4'],
    allowedAttributes: { a: ['href', 'title', 'rel'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
    allowedSchemes: ['https', 'http', 'mailto'], allowProtocolRelative: false,
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
    disallowedTagsMode: 'discard',
  });
}

function contentOf(parsed, subject, complete, from) {
  if (!complete) return `[Email reply from ${from}] Subject: ${subject} — body not yet downloaded`;
  const text = receivedEmailText(parsed);
  if (text) return text;
  if (parsed.attachments?.length) return `[${parsed.attachments.length} attachment${parsed.attachments.length === 1 ? '' : 's'}] ${subject}`.trim();
  return `[Empty email] ${subject}`.trim();
}

/** Shared, provider-independent persistence. No inbound message creates a lead or sends a reply. */
export class InboundEmailIngestion {
  constructor({ db = prisma, spool = new InboundEmailSpool(), publish = publishInboundEmailActivity,
    score = (id) => leadScorer.calculateScore(id) } = {}) {
    Object.assign(this, { db, spool, publish, score });
    this.inflight = new Map();
  }

  async ingest(input) {
    const key = input.dedupeKey;
    if (typeof key !== 'string' || key.length < 8 || key.length > 300) throw new Error('Invalid inbound receipt identity');
    // Serializing only identical deliveries avoids a partial/full download race in this API process.
    const previous = this.inflight.get(key) || Promise.resolve();
    const operation = previous.catch(() => {}).then(() => this._ingest(input));
    this.inflight.set(key, operation);
    try { return await operation; }
    finally { if (this.inflight.get(key) === operation) this.inflight.delete(key); }
  }

  async _ingest({ provider, dedupeKey, rawMime, envelopeFrom = '', envelopeTo = [], accountId = null,
    receivedAt = new Date(), complete = true, parsed: suppliedParsed, strictRecipient = false, subject: fallbackSubject = '', retry = false, manualMatch = null }) {
    if (!['imap', 'cloudflare'].includes(provider)) throw new Error('Unsupported inbound email provider');
    const bytes = Buffer.isBuffer(rawMime) ? rawMime : Buffer.from(rawMime || '');
    if (!bytes.length || bytes.length > EMAIL_INGRESS_MAX_BYTES) throw Object.assign(new Error('Email MIME size is invalid'), { statusCode: 413 });
    const payloadHash = sha256(bytes);
    const recipients = [...new Set([].concat(envelopeTo).map(normalizeAddress).filter(Boolean))];
    const when = new Date(receivedAt);
    if (!Number.isFinite(when.getTime())) throw new Error('Invalid inbound receipt time');
    let receipt = await this.db.inboundEmailReceipt.findUnique({ where: { dedupeKey } });
    if (receipt && (receipt.provider !== provider || receipt.envelopeFrom !== normalizeAddress(envelopeFrom)
      || receipt.envelopeTo !== JSON.stringify(recipients))) {
      throw Object.assign(new Error('Receipt identity was reused with a different envelope'), { statusCode: 409 });
    }
    if (receipt && receipt.payloadHash !== payloadHash && !(receipt.state === 'partial' && complete && provider === 'imap')) {
      throw Object.assign(new Error('Receipt identity was reused with different content'), { statusCode: 409 });
    }
    const upgrade = receipt?.state === 'partial' && complete;
    if (manualMatch && (!receipt || receipt.messageId || receipt.state !== 'unmatched')) {
      throw Object.assign(new Error('Only an unmatched, unlinked receipt can be assigned manually.'), { statusCode: 409 });
    }
    if (receipt && !upgrade && !['pending', 'partial'].includes(receipt.state) && !(retry && !receipt.messageId)) {
      // Legacy partial message recovery remains possible even if an earlier ledger says matched.
      const linked = receipt.messageId ? await this.db.message.findUnique({ where: { id: receipt.messageId } }) : null;
      if (linked?.status !== 'partial') return { receipt, humanReply: false, duplicate: true };
    }
    if (!receipt) {
      try {
        receipt = await this.db.inboundEmailReceipt.create({ data: {
          provider, dedupeKey, payloadHash, envelopeFrom: normalizeAddress(envelopeFrom),
          envelopeTo: JSON.stringify(recipients), receivedAt: when,
        } });
      } catch (error) {
        if (error.code !== 'P2002') throw error;
        return this._ingest({ provider, dedupeKey, rawMime: bytes, envelopeFrom, envelopeTo, accountId, receivedAt, complete, parsed: suppliedParsed, strictRecipient, subject: fallbackSubject });
      }
    }
    const rawPath = await this.spool.store(dedupeKey, bytes);
    receipt = await this.db.inboundEmailReceipt.update({ where: { id: receipt.id }, data: { rawPath, payloadHash } });
    let parsed;
    try { parsed = suppliedParsed || await simpleParser(bytes, { skipTextToHtml: true }); }
    catch {
      receipt = await this.db.inboundEmailReceipt.update({ where: { id: receipt.id }, data: { state: 'invalid', reason: 'mime_parse_failed', processedAt: new Date() } });
      return { receipt, humanReply: false };
    }
    if (!(parsed.headers instanceof Map) || !parsed.headers.size) {
      receipt = await this.db.inboundEmailReceipt.update({ where: { id: receipt.id }, data: { state: 'invalid', reason: 'missing_mime_headers', processedAt: new Date() } });
      return { receipt, humanReply: false };
    }
    if (!parsed.subject) parsed.subject = fallbackSubject;
    const from = normalizeAddress(parsed.from?.value?.[0]?.address || envelopeFrom);
    const subject = String(parsed.subject || '').slice(0, 2000);
    const rfcMessageId = typeof parsed.messageId === 'string' && parsed.messageId.length <= 1000 ? parsed.messageId : null;
    const metadata = emailAttachmentMetadata(parsed);
    const html = complete ? sanitizeReceivedEmailHtml(parsed.html) : null;
    const content = contentOf(parsed, subject, complete, from);
    const kind = complete ? classifyInboundEmail(parsed) : classifyInboundEmail(parsed) === 'human' ? 'pending' : classifyInboundEmail(parsed);

    const saved = await this.db.$transaction(async (tx) => {
      // A provider retry and an operator action can race. Recheck the receipt
      // under the write transaction before accepting any manual association.
      if (manualMatch) {
        const current = await tx.inboundEmailReceipt.findUnique({ where: { id: receipt.id } });
        if (current.messageId || current.state !== 'unmatched') throw Object.assign(new Error('This receipt changed. Reload before assigning it.'), { statusCode: 409 });
      }
      const accounts = await tx.emailAccount.findMany({ select: { id: true, email: true, enabled: true } });
      const matchingAccounts = accounts.filter((account) => recipients.includes(normalizeAddress(account.email)) && (!strictRecipient || account.enabled));
      const accountIds = strictRecipient ? matchingAccounts.map((account) => account.id) : accounts.map((account) => account.id);
      let selectedAccountId = matchingAccounts.length === 1 ? matchingAccounts[0].id : strictRecipient ? null : accountId;
      let lead = null, reason = null;
      if (strictRecipient && matchingAccounts.length !== 1) reason = matchingAccounts.length ? 'ambiguous_receiving_account' : 'unknown_receiving_address';
      else if (!from) reason = 'missing_sender_address';
      else if (accounts.some((account) => normalizeAddress(account.email) === from)) reason = 'own_sender_address';
      if (manualMatch) {
        const account = accounts.find(item => item.id === manualMatch.accountId && item.enabled);
        const selectedLead = await tx.lead.findUnique({ where: { id: manualMatch.leadId } });
        if (!account || !selectedLead) throw Object.assign(new Error('Choose an existing lead and enabled receiving account.'), { statusCode: 400 });
        if (!from || accounts.some(item => normalizeAddress(item.email) === from)) throw Object.assign(new Error('This sender cannot be associated with a customer.'), { statusCode: 409 });
        lead = selectedLead;
        selectedAccountId = account.id;
        reason = null;
      }
      if (!lead && !reason) {
        for (const reference of refsOf(parsed)) {
          const originals = await tx.message.findMany({
            where: { emailMessageId: reference, direction: 'outbound', channel: 'email',
              ...(strictRecipient ? { emailAccountId: { in: accountIds } } : {}) },
            select: { leadId: true, emailAccountId: true }, take: 3,
          });
          const identities = new Map(originals.map((message) => [`${message.leadId}:${message.emailAccountId}`, message]));
          if (identities.size > 1) { reason = 'ambiguous_thread'; break; }
          if (identities.size === 1) {
            const original = [...identities.values()][0];
            lead = await tx.lead.findUnique({ where: { id: original.leadId } });
            selectedAccountId = original.emailAccountId || selectedAccountId;
            break;
          }
        }
      }
      if (!lead && !reason) {
        const candidates = await tx.$queryRawUnsafe('SELECT id FROM "Lead" WHERE LOWER(TRIM(email)) = LOWER(?)', from);
        if (candidates.length > 1) {
          reason = 'ambiguous_sender_address';
          // A real or incomplete reply must stop every plausible recipient's
          // queued outreach without inventing which contact owns this email.
          if (kind === 'human' || kind === 'pending') {
            for (let offset = 0; offset < candidates.length; offset += 400) {
              await tx.message.updateMany({ where: { leadId: { in: candidates.slice(offset, offset + 400).map(item => item.id) }, direction: 'outbound', status: 'queued' },
                data: { status: 'cancelled', providerStatusReason: 'inbound_email_pending_review' } });
            }
          }
        }
        else if (candidates.length === 1) lead = await tx.lead.findUnique({ where: { id: candidates[0].id } });
        else reason = 'unknown_sender_address';
      }
      const receiptData = { emailAccountId: selectedAccountId, rfcMessageId, attachmentMetadata: JSON.stringify(metadata), processedAt: new Date() };
      if (!lead || reason) {
        const held = await tx.inboundEmailReceipt.update({ where: { id: receipt.id }, data: {
          ...receiptData, state: complete ? 'unmatched' : 'partial', reason: reason || 'no_matching_lead',
        } });
        return { receipt: held, humanReply: false };
      }
      const identity = { direction: 'inbound', channel: 'email', OR: [
        { idempotencyKey: dedupeKey },
        ...(rfcMessageId ? [{ emailMessageId: rfcMessageId, emailAccountId: selectedAccountId }] : []),
      ] };
      const candidates = await tx.message.findMany({ where: identity, take: 3 });
      if (candidates.length > 1 || (candidates[0] && candidates[0].leadId !== lead.id)) {
        const held = await tx.inboundEmailReceipt.update({ where: { id: receipt.id }, data: { ...receiptData, state: 'conflict', reason: 'ambiguous_message_identity' } });
        return { receipt: held, humanReply: false };
      }
      const previous = candidates[0];
      if (previous && previous.status !== 'partial') {
        const previousLedger = await tx.inboundEmailReceipt.findFirst({ where: { messageId: previous.id, id: { not: receipt.id }, state: 'matched' } });
        // Message-IDs are customer supplied. Conflicting content is quarantined instead of overwriting history.
        if (previousLedger && (previous.content !== content || (previous.emailHtmlBody || null) !== html
          || previousLedger.attachmentMetadata !== JSON.stringify(metadata))) {
          const held = await tx.inboundEmailReceipt.update({ where: { id: receipt.id }, data: { ...receiptData, state: 'conflict', reason: 'message_id_content_conflict' } });
          return { receipt: held, humanReply: false };
        }
        const duplicate = await tx.inboundEmailReceipt.update({ where: { id: receipt.id }, data: { ...receiptData, messageId: previous.id, state: 'matched', reason: 'duplicate_message' } });
        return { receipt: duplicate, humanReply: false, duplicate: true, inbound: previous };
      }
      const legacyPartial = previous && previous.emailInboundKind == null;
      const data = { content, status: complete ? 'delivered' : 'partial', emailHtmlBody: html,
        emailInboundKind: kind, ...(legacyPartial ? { emailReplyProcessedAt: new Date() } : {}) };
      const inbound = previous
        ? await tx.message.update({ where: { id: previous.id }, data })
        : await tx.message.create({ data: { ...data, leadId: lead.id, channel: 'email', direction: 'inbound',
          waAccount: 0, emailAccountId: selectedAccountId, emailSubject: subject, emailMessageId: rfcMessageId,
          emailInReplyTo: parsed.inReplyTo || null, idempotencyKey: dedupeKey, providerCreatedAt: when, sentAt: when } });
      if (kind === 'pending' || kind === 'human') {
        await tx.message.updateMany({ where: { leadId: lead.id, direction: 'outbound', status: 'queued' },
          data: { status: 'cancelled', providerStatusReason: kind === 'pending' ? 'inbound_email_pending_review' : 'human_reply_received' } });
      }
      const ledger = await tx.inboundEmailReceipt.update({ where: { id: receipt.id }, data: {
        ...receiptData, messageId: inbound.id, state: complete ? 'matched' : 'partial', reason: complete ? null : 'body_not_downloaded',
      } });
      if (kind !== 'human' || inbound.emailReplyProcessedAt) return { receipt: ledger, inbound, humanReply: false };
      await tx.message.update({ where: { id: inbound.id }, data: { emailReplyProcessedAt: new Date() } });
      const inboundCount = await tx.message.count({ where: { leadId: lead.id, ...HUMAN_REPLY_WHERE } });
      const currentLead = await tx.lead.findUnique({ where: { id: lead.id } });
      if (['new', 'contacted', 'replied'].includes(currentLead.status)) {
        await tx.lead.update({ where: { id: lead.id }, data: {
          status: inboundCount >= 2 ? 'engaged' : 'replied', repliedAt: currentLead.repliedAt || when,
          emailStatus: currentLead.emailOptOut || ['bounced', 'complained', 'unsubscribed', 'suppressed'].includes(currentLead.emailStatus) ? currentLead.emailStatus : 'replied',
          lastMessageAt: currentLead.lastMessageAt && currentLead.lastMessageAt > when ? currentLead.lastMessageAt : when,
        } });
      }
      const event = await tx.activityLog.create({ data: {
        type: EVENT_TYPES.EMAIL_REPLY, message: `Email reply from ${lead.name} (${from})`, leadId: lead.id, accountId: selectedAccountId,
        meta: JSON.stringify({ leadId: lead.id, accountId: selectedAccountId, channel: 'email', subject,
          threadKey: `lead:${lead.id}:email`, messageId: inbound.id, providerMessageId: rfcMessageId, inboundReceiptId: ledger.id }),
      } });
      return { receipt: ledger, inbound, humanReply: true, event, leadId: lead.id };
    });
    if (saved.event) {
      try { await this.publish(saved.event); } catch (error) { logger.warn('Inbound email activity is durable; its live update was delayed.'); }
      Promise.resolve().then(() => this.score(saved.leadId)).catch((error) => logger.warn(`Email lead score refresh delayed: ${error.message}`));
    }
    return saved;
  }
}
export default new InboundEmailIngestion();
