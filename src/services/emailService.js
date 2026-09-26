import { createTransport } from 'nodemailer';
import { ImapFlow } from 'imapflow';
import fetch from 'node-fetch';
import crypto from 'crypto';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import activityLog, { EVENT_TYPES } from '../utils/activityLog.js';
import { chooseSystemSenderAccount, resolveSystemEmailPreference } from '../utils/systemEmailPreference.js';
import { normalizeEmailSubject } from '../utils/email-subject.js';
import whatsappManager from './whatsapp.js';
import leadStateService from '../domain/leadStateService.js';
import leadScorer from './leadScorer.js';
import { isSameZonedDay } from '../utils/workspaceTime.js';

/**
 * Unsubscribe requests go to the mailbox that sent the email, which is the one
 * that syncs replies — so an unsubscribe lands where it will be seen. Set
 * EMAIL_UNSUBSCRIBE_ADDRESS to send them all to one address instead.
 */
function listUnsubscribeHeader(senderEmail) {
  const address = process.env.EMAIL_UNSUBSCRIBE_ADDRESS || senderEmail;
  return `<mailto:${address}?subject=Unsubscribe>`;
}

// Lazily imported to avoid a circular dep with api.js (api.js imports this
// service via /api/email/* routes). Same pattern as src/services/followup.js.
try {
} catch(e) {}

/**
 * Email Service
 * Manages SMTP outbound email + IMAP inbound reply detection.
 * Supports multiple email accounts with AES-256-GCM credential encryption.
 *
 * Provider presets: Gmail, Outlook, Zoho, Custom
 */

// ── Provider Presets ──
const PROVIDER_PRESETS = {
  gmail: {
    smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecure: false,
    imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true,
  },
  outlook: {
    smtpHost: 'smtp-mail.outlook.com', smtpPort: 587, smtpSecure: false,
    imapHost: 'outlook.office365.com', imapPort: 993, imapSecure: true,
  },
  zoho: {
    smtpHost: 'smtp.zoho.com', smtpPort: 587, smtpSecure: false,
    imapHost: 'imap.zoho.com', imapPort: 993, imapSecure: true,
  },
  resend: {
    smtpHost: 'smtp.resend.com', smtpPort: 465, smtpSecure: true,
    imapHost: '', imapPort: 993, imapSecure: true,
  },
  brevo: {
    smtpHost: 'api.brevo.com', smtpPort: 443, smtpSecure: true,
    imapHost: '', imapPort: 993, imapSecure: true,
  },
};

const BREVO_API_BASE = 'https://api.brevo.com/v3';
const BREVO_FREE_DAILY_LIMIT = 300;
const MARKETING_TEMPLATE_PREFIXES = ['daily-whatsapp-cta-'];

function isMarketingQueueMessage(message) {
  const variant = String(message?.templateVariant || '');
  return MARKETING_TEMPLATE_PREFIXES.some((prefix) => variant.startsWith(prefix));
}

function stableBrevoIdempotencyKey(value) {
  const bytes = crypto.createHash('sha256').update(String(value)).digest().subarray(0, 16);
  // RFC 4122-shaped deterministic UUID. Brevo requires a UUID and deduplicates
  // repeated requests carrying the same value within its idempotency window.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function nextIstCapacityReset(now = new Date()) {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffsetMs);
  const next = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1, 0, 5, 0);
  return new Date(next - istOffsetMs);
}

async function emitDashboardEvent(type, data = {}) {
  try {
    const { broadcastEvent } = await import('../api.js');
    broadcastEvent(type, data);
  } catch {
    // The API server may not be loaded in isolated service contexts.
  }
}

// ── AES-256-GCM Encryption ──

function _getEncryptionKey() {
  const raw = process.env.LEAD_SYNC_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (raw.length < 16) throw new Error('Encryption key too short — set LEAD_SYNC_ENCRYPTION_KEY (32+ chars)');
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(plaintext) {
  if (!plaintext) return '';
  const key = _getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decrypt(ciphertext) {
  if (!ciphertext) return '';
  if (!ciphertext.startsWith('enc:v1:')) return ciphertext; // plaintext passthrough
  const parts = ciphertext.slice('enc:v1:'.length).split('.');
  if (parts.length !== 3) throw new Error('Malformed encrypted value');
  const [ivB64, tagB64, dataB64] = parts;
  const key = _getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}

class EmailService {
  constructor() {
    this._transportCache = new Map(); // accountId → nodemailer transport
    this._capacityTail = Promise.resolve();
  }

  async _withCapacityLock(operation) {
    const previous = this._capacityTail;
    let release;
    this._capacityTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async _reserveSendCapacity(accountId, { excludeMessageId = null } = {}) {
    return this._withCapacityLock(async () => {
      let account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
      if (!account?.enabled) return { ok: false, error: 'Email account is disabled' };
      account = await this._resetAccountCounterIfNeeded(account);
      if (account.sentToday >= account.dailyLimit) {
        return { ok: false, error: 'Daily email limit reached' };
      }
      if (!(await this._checkHourlyCapacity(account, { excludeMessageId }))) {
        return { ok: false, error: 'Hourly email limit reached' };
      }
      if (account.provider === 'brevo' && !(await this._checkBrevoSharedCapacity())) {
        return { ok: false, error: 'Brevo shared daily limit reached' };
      }
      const claimed = await prisma.emailAccount.updateMany({
        where: { id: account.id, enabled: true, sentToday: { lt: account.dailyLimit } },
        data: { sentToday: { increment: 1 } },
      });
      if (claimed.count !== 1) return { ok: false, error: 'Daily email limit reached' };
      return { ok: true, account: { ...account, sentToday: account.sentToday + 1 } };
    });
  }

  async _releaseSendCapacity(accountId) {
    await this._withCapacityLock(async () => {
      await prisma.emailAccount.updateMany({
        where: { id: accountId, sentToday: { gt: 0 } },
        data: { sentToday: { decrement: 1 } },
      });
    });
  }

  // ── Account Management ──

  /**
   * Create a new email account with encrypted credentials.
   */
  async createAccount({ name, email, provider, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass,
    imapHost, imapPort, imapSecure, imapUser, imapPass, senderName, signature, dailyLimit, hourlyLimit,
    whatsappAccountId }) {

    const preset = PROVIDER_PRESETS[provider] || {};
    const waId = whatsappAccountId != null && Number.isFinite(Number(whatsappAccountId)) && Number(whatsappAccountId) > 0
      ? Number(whatsappAccountId)
      : null;

    const account = await prisma.emailAccount.create({
      data: {
        name: name || email,
        email,
        provider: provider || 'custom',
        smtpHost: smtpHost || preset.smtpHost || '',
        smtpPort: smtpPort || preset.smtpPort || 587,
        smtpSecure: smtpSecure ?? preset.smtpSecure ?? false,
        smtpUser: smtpUser || email,
        smtpPass: encrypt(smtpPass),
        imapHost: imapHost || preset.imapHost || '',
        imapPort: imapPort || preset.imapPort || 993,
        imapSecure: imapSecure ?? preset.imapSecure ?? true,
        imapUser: imapUser || smtpUser || email,
        imapPass: encrypt(imapPass || smtpPass),
        senderName: senderName || '',
        signature: signature || '',
        dailyLimit: dailyLimit || 200,
        hourlyLimit: hourlyLimit || 30,
        whatsappAccountId: waId,
        status: 'pending',
      },
    });

    logger.info(`📧 Email account "${name || email}" created (ID: ${account.id})`);
    return this._sanitizeAccount(account);
  }

  /**
   * List all email accounts (passwords stripped).
   */
  async listAccounts() {
    const accounts = await prisma.emailAccount.findMany({ orderBy: { id: 'asc' } });
    return accounts.map(a => this._sanitizeAccount(a));
  }

  /**
   * Get a single account by ID (passwords stripped).
   */
  async getAccount(id) {
    const account = await prisma.emailAccount.findUnique({ where: { id } });
    return account ? this._sanitizeAccount(account) : null;
  }

  /**
   * Update an email account.
   */
  async updateAccount(id, updates) {
    const data = {};
    const allowed = ['name', 'email', 'provider', 'smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser',
      'imapHost', 'imapPort', 'imapSecure', 'imapUser', 'senderName', 'signature',
      'dailyLimit', 'hourlyLimit', 'enabled', 'whatsappAccountId'];

    for (const key of allowed) {
      if (updates[key] !== undefined) data[key] = updates[key];
    }
    // whatsappAccountId may be explicitly set to null to unlink
    if (data.whatsappAccountId !== undefined && data.whatsappAccountId !== null) {
      const n = Number(data.whatsappAccountId);
      data.whatsappAccountId = Number.isFinite(n) && n > 0 ? n : null;
    }
    // Encrypt passwords if provided
    if (updates.smtpPass) data.smtpPass = encrypt(updates.smtpPass);
    if (updates.imapPass) data.imapPass = encrypt(updates.imapPass);

    if (Object.keys(data).length === 0) return null;

    // Invalidate transport cache on config change
    this._transportCache.delete(id);

    const account = await prisma.emailAccount.update({ where: { id }, data });
    return this._sanitizeAccount(account);
  }

  /**
   * Delete an email account.
   */
  async deleteAccount(id) {
    this._transportCache.delete(id);
    await prisma.emailAccount.delete({ where: { id } });
    logger.info(`📧 Email account ${id} deleted`);
  }

  async setSystemSenderAccount({ accountId = null, email = '' } = {}) {
    const accounts = await prisma.emailAccount.findMany({
      orderBy: [
        { sentToday: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    let account = null;
    if (accountId) {
      account = accounts.find((item) => Number(item.id) === Number(accountId)) || null;
    }
    if (!account && email) {
      const normalizedEmail = String(email).trim().toLowerCase();
      account = accounts.find((item) => String(item.email || '').trim().toLowerCase() === normalizedEmail) || null;
    }

    if (!account) throw new Error('Email account not found');

    await prisma.$transaction([
      prisma.systemConfig.upsert({
        where: { key: 'email.system_account_id' },
        update: { value: String(account.id) },
        create: { key: 'email.system_account_id', value: String(account.id) },
      }),
      prisma.systemConfig.upsert({
        where: { key: 'email.system_sender_email' },
        update: { value: account.email },
        create: { key: 'email.system_sender_email', value: account.email },
      }),
      prisma.systemConfig.upsert({
        where: { key: 'reports.sender_account_id' },
        update: { value: String(account.id) },
        create: { key: 'reports.sender_account_id', value: String(account.id) },
      }),
      prisma.systemConfig.upsert({
        where: { key: 'reports.sender_email' },
        update: { value: account.email },
        create: { key: 'reports.sender_email', value: account.email },
      }),
    ]);

    logger.info(`📨 System sender account set to ${account.email} (ID: ${account.id})`);
    return this._sanitizeAccount(account);
  }

  async clearSystemSenderAccount() {
    await prisma.systemConfig.deleteMany({
      where: {
        key: {
          in: [
            'email.system_account_id',
            'email.system_sender_email',
            'reports.sender_account_id',
            'reports.sender_email',
          ],
        },
      },
    });
    logger.info('📨 Cleared preferred system sender account');
  }

  async getSystemSenderAccount() {
    return this._resolveSystemSenderAccount();
  }

  /**
   * Strip sensitive fields from account for API responses.
   */
  _sanitizeAccount(account) {
    if (!account) return null;
    const { smtpPass, imapPass, ...safe } = account;
    return { ...safe, hasSmtpPass: !!smtpPass, hasImapPass: !!imapPass };
  }

  // ── SMTP Transport ──

  /**
   * Get or create a nodemailer transport for an account.
   */
  _getTransport(account) {
    if (this._transportCache.has(account.id)) {
      return this._transportCache.get(account.id);
    }

    const transport = createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSecure,
      auth: {
        user: account.smtpUser,
        pass: decrypt(account.smtpPass),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    this._transportCache.set(account.id, transport);
    return transport;
  }

  async _brevoRequest(account, path, { method = 'GET', body } = {}) {
    const apiKey = decrypt(account.smtpPass);
    if (!apiKey) throw new Error('Brevo API key is missing');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${BREVO_API_BASE}${path}`, {
        method,
        headers: {
          'api-key': apiKey,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        const error = new Error(data?.message || `Brevo API HTTP ${response.status}`);
        error.status = response.status;
        error.retryAfter = retryAfter ? Number(retryAfter) : null;
        throw error;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Make a Brevo API request for one configured sender without exposing its
   * credential to higher-level automation code.  Marketing campaigns use this
   * adapter rather than the transactional SMTP endpoint.
   */
  async brevoRequestForAccount(accountId, path, options = {}) {
    const account = await prisma.emailAccount.findUnique({ where: { id: Number(accountId) } });
    if (!account) throw new Error('Brevo email account not found');
    if (account.provider !== 'brevo') throw new Error('Selected email account is not a Brevo sender');
    if (!account.enabled) throw new Error('Brevo email account is disabled');
    return this._brevoRequest(account, path, options);
  }

  async _resetAccountCounterIfNeeded(account) {
    if (isSameZonedDay(account.lastResetAt || new Date(0), new Date())) return account;
    return prisma.emailAccount.update({
      where: { id: account.id },
      data: { sentToday: 0, lastResetAt: new Date() },
    });
  }

  async _checkHourlyCapacity(account, { excludeMessageId = null } = {}) {
    const used = await prisma.message.count({
      where: {
        ...(excludeMessageId ? { id: { not: Number(excludeMessageId) } } : {}),
        channel: 'email', direction: 'outbound', emailAccountId: account.id,
        status: { in: ['sending', 'sent', 'delivered', 'read'] },
        sentAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    return used < account.hourlyLimit;
  }

  async _checkBrevoSharedCapacity() {
    const accounts = await prisma.emailAccount.findMany({ where: { provider: 'brevo' } });
    const reset = await Promise.all(accounts.map((account) => this._resetAccountCounterIfNeeded(account)));
    return reset.reduce((sum, account) => sum + (account.sentToday || 0), 0) < BREVO_FREE_DAILY_LIMIT;
  }

  /**
   * Test SMTP connection for an account.
   */
  async testConnection(accountId) {
    const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new Error('Email account not found');

    try {
      if (account.provider === 'brevo') {
        const data = await this._brevoRequest(account, '/senders');
        const sender = (data?.senders || []).find((item) =>
          String(item.email || '').toLowerCase() === String(account.email).toLowerCase());
        if (!sender) throw new Error(`Brevo sender ${account.email} is not configured`);
        if (sender.active === false) throw new Error(`Brevo sender ${account.email} is not active`);
      } else {
        const transport = this._getTransport(account);
        await transport.verify();
      }
      await prisma.emailAccount.update({
        where: { id: accountId },
        data: { status: 'verified', lastError: null },
      });
      return { success: true };
    } catch (error) {
      await prisma.emailAccount.update({
        where: { id: accountId },
        data: { status: 'error', lastError: error.message },
      });
      this._transportCache.delete(accountId);
      return { success: false, error: error.message };
    }
  }

  // ── Send Email ──

  /**
   * Send an email to a lead.
   * @param {object} options - { leadId, accountId, subject, body, htmlBody, inReplyTo, existingMessageId }
   * @returns {{ success: boolean, messageId?: string, error?: string }}
   */
  async sendEmail({ leadId, accountId, subject, body, htmlBody, inReplyTo, existingMessageId, attachments, cc, bcc }) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error('Lead not found');
    if (!lead.email) throw new Error('Lead has no email address');

    let account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new Error('Email account not found');
    if (!account.enabled) throw new Error('Email account is disabled');

    const capacity = await this._reserveSendCapacity(account.id, { excludeMessageId: existingMessageId });
    if (!capacity.ok) return { success: false, error: capacity.error };
    account = capacity.account;

    const fromName = account.senderName || account.name || account.email;

    // Build email body with signature
    let fullHtml = htmlBody || this._textToHtml(body);
    if (account.signature) {
      fullHtml += `<br><br>${account.signature}`;
    }

    // Normalize subject — clamps length, strips spam tokens, falls back gracefully.
    // For replies (inReplyTo present) we force the "Re: " thread prefix.
    const normalizedSubject = normalizeEmailSubject(subject, {
      lead,
      isFollowup: !!inReplyTo,
      previousSubject: inReplyTo ? subject : null,
    });

    const mailOptions = {
      from: `"${fromName}" <${account.email}>`,
      to: lead.email,
      subject: normalizedSubject,
      text: body,
      html: fullHtml,
      headers: {
        'List-Unsubscribe': listUnsubscribeHeader(account.email),
      },
    };

    if (cc) mailOptions.cc = cc;
    if (bcc) mailOptions.bcc = bcc;

    // Attachments (array of { filename, path, contentType })
    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map((a) => ({
        filename: a.filename,
        path: a.path,
        contentType: a.contentType,
      }));
    }

    // Threading headers
    if (inReplyTo) {
      mailOptions.headers['In-Reply-To'] = inReplyTo;
      mailOptions.headers['References'] = inReplyTo;
    }

    let messageId;
    try {
      if (account.provider === 'brevo') {
        if (attachments?.length) throw new Error('Brevo API attachments are not configured yet');
        const headers = {
          'X-Mailin-custom': `lead_id:${lead.id}|outboundos_message_id:${existingMessageId || ''}`,
          'Idempotency-Key': stableBrevoIdempotencyKey(`outboundos:email:${existingMessageId || `${lead.id}:${normalizedSubject}`}`),
          'List-Unsubscribe': listUnsubscribeHeader(account.email),
          ...(inReplyTo ? { 'In-Reply-To': inReplyTo, References: inReplyTo } : {}),
        };
        const result = await this._brevoRequest(account, '/smtp/email', {
          method: 'POST',
          body: {
            sender: { name: fromName, email: account.email },
            to: [{ name: lead.name || undefined, email: lead.email }],
            ...(cc ? { cc: String(cc).split(',').map((email) => ({ email: email.trim() })).filter((item) => item.email) } : {}),
            ...(bcc ? { bcc: String(bcc).split(',').map((email) => ({ email: email.trim() })).filter((item) => item.email) } : {}),
            replyTo: { name: fromName, email: account.email },
            subject: normalizedSubject,
            htmlContent: fullHtml,
            textContent: body || this._htmlToText(fullHtml),
            headers,
            tags: ['outboundos'],
          },
        });
        messageId = result.messageId;
      } else {
        const transport = this._getTransport(account);
        const info = await transport.sendMail(mailOptions);
        messageId = info.messageId;
      }
    } catch (error) {
      await this._releaseSendCapacity(account.id).catch(() => {});
      logger.error(`📧 Email send failed to ${lead.email}: ${error.message}`);

      if (!existingMessageId) {
        await prisma.message.create({
          data: {
            leadId: lead.id,
            direction: 'outbound',
            channel: 'email',
            content: body || '',
            waAccount: 0,
            emailAccountId: account.id,
            status: 'failed',
            emailSubject: normalizedSubject,
          },
        });
      }

      activityLog.add(EVENT_TYPES.MESSAGE_FAILED, `Email failed to ${lead.name}: ${error.message}`, {
        leadId: lead.id, channel: 'email',
      });

      return {
        success: false,
        error: error.message,
        providerStatus: error.status || null,
        retryAfter: error.retryAfter || null,
      };
    }

    // From this point onward the provider has accepted the message. Local
    // bookkeeping must never turn that accepted external side effect into a
    // retry, otherwise the recipient can receive a duplicate email.
    const acceptedAt = new Date();
    const messageData = {
      leadId: lead.id,
      direction: 'outbound',
      channel: 'email',
      content: body || this._htmlToText(fullHtml),
      waAccount: 0,
      emailAccountId: account.id,
      status: 'sent',
      sentAt: acceptedAt,
      emailSubject: normalizedSubject,
      emailHtmlBody: fullHtml,
      emailMessageId: messageId,
      emailInReplyTo: inReplyTo || null,
      emailCc: cc || null,
      emailBcc: bcc || null,
      providerStatusReason: 'provider_accepted',
    };

    let msg = null;
    try {
      msg = existingMessageId
        ? await prisma.message.update({ where: { id: existingMessageId }, data: messageData })
        : await prisma.message.create({ data: messageData });

      await Promise.all([
        prisma.emailAccount.update({
          where: { id: account.id },
          data: { lastError: null },
        }),
        prisma.lead.update({
          where: { id: lead.id },
          data: {
            lastEmailAt: acceptedAt,
            emailStatus: 'sent',
            assignedEmailAccountId: account.id,
            lastMessageAt: acceptedAt,
          },
        }),
      ]);
    } catch (persistenceError) {
      logger.error(`📧 Provider accepted email ${messageId}, but local bookkeeping needs repair: ${persistenceError.message}`);
      if (existingMessageId) {
        await prisma.message.updateMany({
          where: { id: existingMessageId, status: 'sending' },
          data: {
            status: 'sent',
            sentAt: acceptedAt,
            emailMessageId: messageId,
            providerStatusReason: 'provider_accepted_persistence_repair_needed',
          },
        }).catch(() => {});
      }
      return { success: true, messageId, message: msg, persistenceWarning: persistenceError.message };
    }

    activityLog.add(EVENT_TYPES.MESSAGE_SENT, `Email sent to ${lead.name} (${lead.email})`, {
      leadId: lead.id, emailAccountId: account.id, channel: 'email',
    });
    logger.info(`📧 Email sent to ${lead.email} via ${account.email} [${messageId}]`);
    return { success: true, messageId, message: msg };
  }

  /**
   * Send a non-lead system email, such as an executive report.
   * Uses the same sender accounts and daily limits as campaign email.
   */
  async sendSystemEmail({ to, subject, textBody, htmlBody, accountId = null, tag = 'system' }) {
    if (!to) throw new Error('Recipient email is required');
    if (!subject) throw new Error('Email subject is required');

    let account = await this._resolveSystemSenderAccount({ accountId });

    if (!account) throw new Error('No email account available for system delivery');
    if (!account.enabled) throw new Error('Selected email account is disabled');
    let capacity = await this._reserveSendCapacity(account.id);
    if (!capacity.ok && !accountId) {
      account = await this._resolveSystemSenderAccount({ excludeAccountIds: [account.id] });
      if (account) capacity = await this._reserveSendCapacity(account.id);
    }
    if (!account) throw new Error('No email account available for system delivery');
    if (!account.enabled) throw new Error('Selected email account is disabled');
    if (!capacity.ok) throw new Error(capacity.error || 'Selected email account has no send capacity');
    account = capacity.account;

    const fromName = account.senderName || account.name || account.email;
    let fullHtml = htmlBody || this._textToHtml(textBody || '');
    if (account.signature) {
      fullHtml += `<br><br>${account.signature}`;
    }

    const mailOptions = {
      from: `"${fromName}" <${account.email}>`,
      to,
      subject,
      text: textBody || this._htmlToText(fullHtml),
      html: fullHtml,
      headers: {
        'X-OutboundOS-Tag': tag,
      },
    };

    let messageId;
    try {
      if (account.provider === 'brevo') {
        const result = await this._brevoRequest(account, '/smtp/email', {
          method: 'POST',
          body: {
            sender: { name: fromName, email: account.email },
            to: [{ email: String(to).trim() }],
            replyTo: { name: fromName, email: account.email },
            subject,
            htmlContent: fullHtml,
            textContent: textBody || this._htmlToText(fullHtml),
            headers: {
              'X-OutboundOS-Tag': tag,
              'Idempotency-Key': stableBrevoIdempotencyKey(`outboundos:system:${tag}:${to}:${subject}`),
            },
            tags: [String(tag || 'system').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)],
          },
        });
        messageId = result.messageId;
      } else {
        const transport = this._getTransport(account);
        const info = await transport.sendMail(mailOptions);
        messageId = info.messageId;
      }
    } catch (error) {
      await this._releaseSendCapacity(account.id).catch(() => {});
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { lastError: error.message, status: 'error' },
      }).catch(() => {});
      this._transportCache.delete(account.id);
      logger.error(`📨 System email send failed to ${to}: ${error.message}`);
      throw error;
    }

    try {
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { lastError: null },
      });
    } catch (persistenceError) {
      // The provider already accepted this email. Surface a warning but do not
      // throw into a caller that may retry and deliver a duplicate.
      logger.error(`📨 Provider accepted system email ${messageId}, but its counter needs repair: ${persistenceError.message}`);
    }

    activityLog.add(EVENT_TYPES.EMAIL_SENT, `System email sent to ${to}`, {
      channel: 'email',
      emailAccountId: account.id,
      recipient: to,
      tag,
    });

    logger.info(`📨 System email sent to ${to} via ${account.email} [${messageId}]`);
    return { success: true, messageId, accountId: account.id };
  }

  // ── IMAP Reply Polling ──

  /**
   * Poll all enabled email accounts for new replies.
   * Called on a cron schedule (every 5 minutes).
   */
  async syncAllReplies() {
    const accounts = await prisma.emailAccount.findMany({
      where: { enabled: true, imapHost: { not: '' } },
    });

    let totalNew = 0;
    for (const account of accounts) {
      try {
        const count = await this._syncRepliesForAccount(account);
        totalNew += count;
      } catch (error) {
        // Detect the specific case where the stored credential can no longer be
        // decrypted — this happens when JWT_SECRET / LEAD_SYNC_ENCRYPTION_KEY
        // rotated after the password was saved. The raw Node crypto string
        // ("Unsupported state or unable to authenticate data") is meaningless to
        // an operator, so translate it into an actionable status and stop the
        // noisy every-5-minute error log + dashboard toast spam.
        const isDecryptFailure =
          /unable to authenticate data|Unsupported state|bad decrypt|Malformed encrypted value/i.test(error.message);

        if (isDecryptFailure) {
          const actionable = 'Saved password can no longer be decrypted (encryption key changed) — re-enter it in Settings → Email';
          await prisma.emailAccount.update({
            where: { id: account.id },
            data: { lastError: actionable, status: 'auth_error' },
          }).catch(() => {});
          // Log once at warn (not error) and skip the repeated dashboard event —
          // this state won't change until the operator re-enters the password.
          logger.warn(`📧 ${account.email}: ${actionable}`);
          continue;
        }

        logger.error(`📧 IMAP sync failed for ${account.email}: ${error.message}`);
        activityLog.add(EVENT_TYPES.EMAIL_SYNC_FAILED, `Mailbox sync failed for ${account.email}`, {
          accountId: account.id,
          channel: 'email',
          error: error.message,
        });
        await emitDashboardEvent('email_sync_failed', {
          accountId: account.id,
          channel: 'email',
          error: error.message,
        });
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: { lastError: `IMAP: ${error.message}` },
        }).catch(() => {});
      }
    }

    if (totalNew > 0) {
      logger.info(`📧 IMAP sync complete: ${totalNew} new reply(s) across ${accounts.length} account(s)`);
    }
  }

  /**
   * Sync replies for a single email account via IMAP.
   */
  async _syncRepliesForAccount(account) {
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapSecure,
      auth: {
        user: account.imapUser || account.smtpUser,
        pass: decrypt(account.imapPass || account.smtpPass),
      },
      logger: false,
      // Hard caps so a hung TLS handshake or a dead server can't lock us up.
      socketTimeout: 60_000,    // kill idle sockets after 60s
      greetingTimeout: 15_000,  // bail fast if the server never greets
    });

    // CRITICAL: ImapFlow extends EventEmitter and emits 'error' on socket
    // failures (ETIMEOUT, ECONNRESET, etc). An unhandled 'error' event crashes
    // the Node process. Attach a listener so the socket failure is logged and
    // swallowed — the surrounding try/catch handles the cleanup path.
    client.on('error', (err) => {
      logger.warn(`📧 IMAP socket error on ${account.email}: ${err?.message || err}`);
    });
    client.on('close', () => {
      // No-op listener prevents 'close' events from bubbling unexpectedly.
    });

    let newReplies = 0;

    try {
      await client.connect();

      const lock = await client.getMailboxLock('INBOX');
      try {
        // Fetch emails since last sync (or last 24 hours)
        const since = account.lastSyncAt
          ? new Date(account.lastSyncAt.getTime() - 5 * 60 * 1000) // 5min overlap for safety
          : new Date(Date.now() - 24 * 60 * 60 * 1000);

        const messages = client.fetch(
          { since },
          { envelope: true, source: false, bodyStructure: true,
            headers: ['in-reply-to', 'references', 'message-id', 'from', 'subject'] }
        );

        for await (const msg of messages) {
          try {
            const inReplyTo = msg.headers?.get('in-reply-to')?.toString().trim() || '';
            const from = msg.envelope?.from?.[0]?.address || '';
            const subject = msg.envelope?.subject || '';
            const messageId = msg.headers?.get('message-id')?.toString().trim() || '';

            if (!from || from === account.email) continue; // skip own emails

            // Match reply to a lead by In-Reply-To or sender email
            let lead = null;

            // Method 1: Match via In-Reply-To header → find our outbound message
            if (inReplyTo) {
              const ourMsg = await prisma.message.findFirst({
                where: { emailMessageId: inReplyTo, direction: 'outbound', channel: 'email' },
                select: { leadId: true },
              });
              if (ourMsg) {
                lead = await prisma.lead.findUnique({ where: { id: ourMsg.leadId } });
              }
            }

            // Method 2: Match by sender email → find lead with that email
            // Use LOWER() for case-insensitive matching (SQLite doesn't support Prisma mode:'insensitive')
            if (!lead && from) {
              const matched = await prisma.$queryRawUnsafe(
                `SELECT id FROM "Lead" WHERE LOWER(email) = LOWER(?) LIMIT 1`,
                from
              );
              if (matched?.length > 0) {
                lead = await prisma.lead.findUnique({ where: { id: matched[0].id } });
              }
            }

            if (!lead) continue; // No matching lead found

            // Dedup: check if we already saved this message. If we previously saved
            // it as 'partial' (download failed), allow this iteration to retry the
            // download and upgrade the row instead of skipping.
            let existingPartial = null;
            if (messageId) {
              const existing = await prisma.message.findFirst({
                where: { emailMessageId: messageId, direction: 'inbound' },
              });
              if (existing && existing.status !== 'partial') continue;
              if (existing && existing.status === 'partial') existingPartial = existing;
            }

            // Fetch body text for the reply content. If the IMAP download fails,
            // we still record the reply (so lead state updates and queued follow-ups
            // get cancelled) but mark it 'partial' so the next sync can retry.
            let bodyText = null;
            let downloadOk = false;
            try {
              const download = await client.download(msg.seq, undefined, { uid: false });
              if (download?.content) {
                const chunks = [];
                for await (const chunk of download.content) chunks.push(chunk);
                const raw = Buffer.concat(chunks).toString('utf8');
                const textMatch = raw.match(/Content-Type: text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
                if (textMatch?.[1]) {
                  bodyText = textMatch[1].trim().substring(0, 2000);
                  downloadOk = true;
                }
              }
            } catch (dlErr) {
              logger.warn(`Could not download email body for message ${messageId || msg.seq}: ${dlErr.message}`);
            }

            if (!downloadOk) {
              bodyText = `[Email reply from ${from}] Subject: ${subject} — body not yet downloaded`;
              logger.warn(`📭 Saving inbound email ${messageId || '(no id)'} as 'partial' — body retrieval failed; will retry next sync`);
            }

            let inboundMessage;
            if (existingPartial) {
              // Upgrade the previously-saved partial row.
              if (downloadOk) {
                inboundMessage = await prisma.message.update({
                  where: { id: existingPartial.id },
                  data: { content: bodyText, status: 'delivered' },
                });
                logger.info(`📨 Recovered body for previously-partial inbound email (msg ${existingPartial.id})`);
              } else {
                inboundMessage = existingPartial;
              }
            } else {
              inboundMessage = await prisma.message.create({
                data: {
                  leadId: lead.id,
                  direction: 'inbound',
                  channel: 'email',
                  content: bodyText,
                  waAccount: 0,
                  emailAccountId: account.id,
                  status: downloadOk ? 'delivered' : 'partial',
                  emailSubject: subject,
                  emailMessageId: messageId,
                  emailInReplyTo: inReplyTo,
                },
              });
            }

            // Side effects (status change, followup cancel, activity log) only run on
            // first observation. If we just recovered a partial body, they already ran.
            if (existingPartial) {
              continue;
            }

            // Update lead status (same logic as WhatsApp reply detection)
            const inboundCount = await prisma.message.count({
              where: { leadId: lead.id, direction: 'inbound' },
            });

            const newStatus = inboundCount >= 2 ? 'engaged' : 'replied';
            const validTransition = ['new', 'contacted', 'replied'].includes(lead.status)
              || (lead.status === 'replied' && newStatus === 'engaged');

            if (validTransition) {
              await prisma.lead.update({
                where: { id: lead.id },
                data: {
                  status: newStatus,
                  repliedAt: lead.repliedAt || new Date(),
                  emailStatus: 'replied',
                  lastMessageAt: new Date(),
                },
              });

              // Cancel pending follow-up messages (same as WhatsApp reply handling)
              const cancelled = await prisma.message.updateMany({
                where: {
                  leadId: lead.id,
                  status: 'queued',
                  direction: 'outbound',
                },
                data: { status: 'cancelled' },
              });
              if (cancelled.count > 0) {
                logger.info(`📧 Cancelled ${cancelled.count} queued follow-up(s) for Lead ${lead.id} after email reply`);
              }
            }

            activityLog.add(EVENT_TYPES.EMAIL_REPLY, `Email reply from ${lead.name} (${from})`, {
              leadId: lead.id,
              accountId: account.id,
              channel: 'email',
              subject,
              threadKey: `email:${lead.id}`,
              messageId: inboundMessage.emailMessageId || messageId || null,
            });
            await emitDashboardEvent('email_reply', {
              leadId: lead.id,
              accountId: account.id,
              channel: 'email',
              subject,
              threadKey: `email:${lead.id}`,
              messageId: inboundMessage.emailMessageId || messageId || null,
            });

            // Recalculate score immediately — don't wait for nightly batch
            leadScorer.calculateScore(lead.id).catch((err) =>
              logger.warn(`Score recalc failed for Lead ${lead.id}: ${err.message}`)
            );

            newReplies++;
            logger.info(`📧 New email reply from ${from} matched to Lead ${lead.id} (${lead.name})`);
          } catch (msgErr) {
            logger.warn(`IMAP message processing error: ${msgErr.message}`);
          }
        }
      } finally {
        lock.release();
      }

      // Update last sync timestamp
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { lastSyncAt: new Date(), lastError: null },
      });

    } finally {
      await client.logout().catch(() => {});
    }

    return newReplies;
  }

  // ── Automated Email Queueing ──

  /**
   * Queue an email message for a lead (used by followup engine).
   *
   * Subject is normalized here so we never persist a 200-char unparsed
   * "SUBJECT: ..." line into the DB. If `inReplyTo` is set we treat this as
   * a follow-up and force the "Re: " thread prefix.
   *
   * @returns {object} Created message record
   */
  async queueEmail({ leadId, accountId, subject, body, htmlBody, scheduledAt, inReplyTo, campaignId, templateVariant, automationKey }) {
    // Fetch lead minimally for the subject fallback path (product / country).
    const leadForSubject = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { product: true, country: true, name: true },
    });
    const normalizedSubject = normalizeEmailSubject(subject, {
      lead: leadForSubject || {},
      isFollowup: !!inReplyTo,
      previousSubject: inReplyTo ? subject : null,
    });

    const data = {
        leadId,
        direction: 'outbound',
        channel: 'email',
        content: body || '',
        waAccount: 0,
        emailAccountId: accountId,
        status: 'queued',
        scheduledAt: scheduledAt || new Date(),
        emailSubject: normalizedSubject,
        emailHtmlBody: htmlBody || null,
        emailInReplyTo: inReplyTo || null,
        campaignId: campaignId || null,
        templateVariant: templateVariant || null,
        automationKey: automationKey || null,
    };

    if (automationKey) {
      // The unique index is the compound (tenantId, automationKey), so an
      // upsert keyed on automationKey alone is rejected by Prisma rather than
      // matching nothing — which threw out of the fresh-lead queue and left
      // the lead with no outreach on any channel. findFirst then create keeps
      // the idempotency this was written for without needing the compound
      // key, which cannot be relied on while tenantId is still nullable.
      const existing = await prisma.message.findFirst({ where: { automationKey } });
      if (existing) return existing;
      try {
        return await prisma.message.create({ data });
      } catch (error) {
        // Lost a race with a concurrent queue for the same key.
        if (error?.code === 'P2002') {
          const row = await prisma.message.findFirst({ where: { automationKey } });
          if (row) return row;
        }
        throw error;
      }
    }
    return prisma.message.create({ data });
  }

  /**
   * Process queued email messages (called by cron).
   * Similar to WhatsApp queue processing but for email channel.
   */
  async processEmailQueue({ messageIds = null } = {}) {
    const pending = await prisma.message.findMany({
      where: {
        ...(Array.isArray(messageIds) ? { id: { in: messageIds } } : {}),
        status: 'queued',
        channel: 'email',
        direction: 'outbound',
        scheduledAt: { lte: new Date() },
      },
      include: { lead: true },
      orderBy: { scheduledAt: 'asc' },
      take: Array.isArray(messageIds) ? Math.max(1, messageIds.length) : 20,
    });

    if (pending.length === 0) return;
    logger.info(`📧 Processing ${pending.length} queued email(s)...`);

    for (const msg of pending) {
      try {
        // Atomic claim
        const claimed = await prisma.message.updateMany({
          where: { id: msg.id, status: 'queued' },
          data: { status: 'sending' },
        });
        if (claimed.count === 0) continue;

        // Re-fetch lead state after claim. If the lead has replied / been paused /
        // closed since this email was queued, cancel the send rather than dispatch
        // a stale outbound message into a live conversation.
        const liveLead = await prisma.lead.findUnique({ where: { id: msg.leadId } });
        if (!liveLead || leadStateService.shouldBlockAutomation(liveLead.status, { channel: 'email' })) {
          logger.info(`⏭️ Email ${msg.id} cancelled — lead ${msg.leadId} is ${liveLead?.status || 'missing'}`);
          await prisma.message.updateMany({
            where: { id: msg.id, status: 'sending' },
            data: { status: 'cancelled' },
          });
          continue;
        }

        if (!liveLead.email) {
          await prisma.message.update({
            where: { id: msg.id },
            data: { status: 'permanently_failed', providerStatusReason: 'recipient_email_missing' },
          });
          continue;
        }

        // Suppression belongs to the normalized recipient, not just one Lead
        // row. Imports often create duplicate lead records sharing an address;
        // an opt-out or bounce on any one of them must stop every later send.
        const normalizedRecipient = String(liveLead.email).trim().toLowerCase();
        const suppressedRows = await prisma.$queryRaw`
          SELECT id FROM Lead
          WHERE lower(trim(email)) = ${normalizedRecipient}
            AND (
              emailOptOut = 1 OR
              lower(COALESCE(emailStatus, '')) IN ('bounced', 'complained', 'suppressed', 'unsubscribed')
            )
          LIMIT 1
        `;
        if (suppressedRows.length > 0) {
          await prisma.message.update({
            where: { id: msg.id },
            data: { status: 'cancelled', providerStatusReason: 'recipient_suppressed' },
          });
          continue;
        }

        // Daily prospecting is a marketing purpose. Consent is rechecked at
        // the last possible moment so a same-day revocation cannot be ignored
        // just because the row was selected during the morning batch.
        if (isMarketingQueueMessage(msg) && !liveLead.emailMarketingConsent) {
          await prisma.message.update({
            where: { id: msg.id },
            data: { status: 'cancelled', providerStatusReason: 'marketing_consent_missing' },
          });
          continue;
        }

        const accountId = msg.emailAccountId || await this._getNextEmailAccount({ poolId: liveLead.poolId });
        if (!accountId) {
          await prisma.message.update({
            where: { id: msg.id },
            data: { status: 'queued' }, // re-queue, no accounts available
          });
          continue;
        }

        const selectedAccount = await prisma.emailAccount.findUnique({ where: { id: accountId } });
        if (!selectedAccount?.enabled || selectedAccount.status !== 'verified') {
          await prisma.message.update({
            where: { id: msg.id },
            data: {
              status: 'queued',
              scheduledAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
              providerStatusReason: 'waiting_for_verified_email_sender',
            },
          });
          continue;
        }

        const result = await this.sendEmail({
          leadId: msg.leadId,
          accountId,
          subject: msg.emailSubject || `Re: ${liveLead.product || 'Your inquiry'}`,
          body: msg.content,
          htmlBody: msg.emailHtmlBody || undefined,
          inReplyTo: msg.emailInReplyTo,
          existingMessageId: msg.id,
          cc: msg.emailCc || undefined,
          bcc: msg.emailBcc || undefined,
        });

        if (result.success) {
          continue;
        } else {
          if (/daily email limit reached|brevo shared daily limit reached/i.test(result.error || '')) {
            await prisma.message.update({
              where: { id: msg.id },
              data: {
                status: 'queued',
                scheduledAt: nextIstCapacityReset(),
                providerStatusReason: 'waiting_for_daily_email_capacity',
              },
            });
            logger.info(`📧 Email ${msg.id} held until the next IST daily-limit reset`);
            continue;
          }
          if (/hourly email limit reached/i.test(result.error || '')) {
            await prisma.message.update({
              where: { id: msg.id },
              data: {
                status: 'queued',
                scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
                providerStatusReason: 'waiting_for_hourly_email_capacity',
              },
            });
            logger.info(`📧 Email ${msg.id} held for the next hourly sender window`);
            continue;
          }
          if ([401, 403, 429].includes(Number(result.providerStatus))) {
            const retryDelayMs = Number(result.retryAfter) > 0
              ? Number(result.retryAfter) * 1000
              : (Number(result.providerStatus) === 429 ? 60 : 360) * 60 * 1000;
            await prisma.message.update({
              where: { id: msg.id },
              data: {
                status: 'queued',
                scheduledAt: new Date(Date.now() + retryDelayMs),
                providerStatusReason: `email_provider_${result.providerStatus}_hold`,
              },
            });
            if ([401, 403].includes(Number(result.providerStatus))) {
              await prisma.emailAccount.update({
                where: { id: accountId },
                data: { status: 'error', lastError: result.error || 'Provider authorization failed' },
              }).catch(() => {});
            }
            continue;
          }
          const retryCount = (msg.retryCount || 0) + 1;
          await prisma.message.update({
            where: { id: msg.id },
            data: {
              status: retryCount >= msg.maxRetries ? 'permanently_failed' : 'queued',
              retryCount,
              providerStatusReason: String(result.error || 'email_send_failed').slice(0, 500),
            },
          });
        }
      } catch (error) {
        logger.error(`Email queue processing error for msg ${msg.id}: ${error.message}`);
        await prisma.message.update({
          where: { id: msg.id },
          data: { status: 'queued', retryCount: (msg.retryCount || 0) + 1 },
        }).catch(() => {});
      }
    }
  }

  /**
   * Resolve the brand persona profile that should drive the LLM body for this email.
   *
   * Priority order:
   *   1. If the lead is already assigned to a WhatsApp brand (lead.assignedAccount),
   *      use THAT brand's persona — this keeps email and WA on the same brand for
   *      a given lead, regardless of which email account ends up sending.
   *   2. Otherwise, fall back to the brand the email account is mapped to via
   *      EmailAccount.whatsappAccountId.
   *   3. If neither resolves, return null. The caller MUST refuse to send rather
   *      than fall through to the global "Outbound OS / Anaya" persona, which is
   *      what caused the original wrong-brand bug.
   *
   * @param {number} emailAccountId
   * @param {object|null} lead - the Lead row, may be null
   * @returns {Promise<object|null>} a profile shaped for messageComposer.resolveProfile, or null
   */
  async getPersonaProfileForEmail(emailAccountId, lead) {
    // Priority 1 — lead already on a WA brand: use that persona
    if (lead?.assignedAccount && lead.assignedAccount > 0) {
      try {
        const p = await whatsappManager.getAccountProfile(lead.assignedAccount);
        if (p?.personaName && p?.companyName) return p;
      } catch (err) {
        logger.warn(`getPersonaProfileForEmail: lead.assignedAccount=${lead.assignedAccount} lookup failed: ${err.message}`);
      }
    }

    // Priority 2 — fall back to the brand that owns this email account
    if (emailAccountId) {
      try {
        const ea = await prisma.emailAccount.findUnique({ where: { id: emailAccountId } });
        if (ea?.whatsappAccountId) {
          const p = await whatsappManager.getAccountProfile(ea.whatsappAccountId);
          if (p?.personaName && p?.companyName) return p;
        }
      } catch (err) {
        logger.warn(`getPersonaProfileForEmail: emailAccountId=${emailAccountId} lookup failed: ${err.message}`);
      }
    }

    // Priority 3 — refuse to send wrong branding
    logger.error(`❌ No brand persona resolvable for emailAccountId=${emailAccountId}, leadId=${lead?.id ?? '?'}. Refusing to send.`);
    return null;
  }

  /**
   * Get next available email account (round-robin, respects limits).
   */
  async _getNextEmailAccount({ poolId } = {}) {
    let accountFilter = { enabled: true, status: 'verified' };
    if (poolId) {
      const poolLinks = await prisma.leadPoolEmail.findMany({
        where: { poolId },
        select: { emailAccountId: true },
      });
      if (poolLinks.length > 0) {
        accountFilter.id = { in: poolLinks.map(l => l.emailAccountId) };
      }
    }
    const accounts = await prisma.emailAccount.findMany({
      where: accountFilter,
      orderBy: { sentToday: 'asc' }, // least-used first
    });

    for (const acct of accounts) {
      if (acct.sentToday < acct.dailyLimit) return acct.id;
    }
    return null;
  }

  /**
   * Reset daily email counters (called at midnight).
   */
  async resetDailyCounters() {
    await prisma.emailAccount.updateMany({
      data: { sentToday: 0, lastResetAt: new Date() },
    });
    logger.info('📧 Email daily counters reset');
  }

  // ── Helpers ──

  _textToHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  _htmlToText(html) {
    if (!html) return '';
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  /**
   * Get provider presets for the dashboard.
   */
  getProviderPresets() {
    return PROVIDER_PRESETS;
  }

  async _getSystemSenderPreference() {
    const rows = await prisma.systemConfig.findMany({
      where: {
        key: {
          in: [
            'email.system_account_id',
            'email.system_sender_email',
            'reports.sender_account_id',
            'reports.sender_email',
          ],
        },
      },
    });

    return resolveSystemEmailPreference({
      env: process.env,
      configMap: Object.fromEntries(rows.map((row) => [row.key, row.value])),
    });
  }

  async _resolveSystemSenderAccount({ accountId = null, excludeAccountIds = [] } = {}) {
    if (accountId) {
      return prisma.emailAccount.findUnique({ where: { id: accountId } });
    }

    const preference = await this._getSystemSenderPreference();
    const excluded = new Set(excludeAccountIds.map((id) => Number(id)));
    const enabledAccounts = (await prisma.emailAccount.findMany({
      where: { enabled: true },
      orderBy: [
        { sentToday: 'asc' },
        { createdAt: 'asc' },
      ],
    })).filter((account) => !excluded.has(Number(account.id)));

    const verifiedAccounts = enabledAccounts.filter((account) => account.status === 'verified');

    return chooseSystemSenderAccount(verifiedAccounts, preference)
      || chooseSystemSenderAccount(enabledAccounts, preference)
      || null;
  }

  /**
   * Send a transactional email (invitation, password reset, etc.) directly to an
   * arbitrary address without needing a Lead record.  Uses the first enabled email
   * account found.  Returns { ok: true } or throws.
   */
  async sendTransactionalEmail({ to, subject, html, text }) {
    const result = await this.sendSystemEmail({
      to,
      subject,
      textBody: text || subject,
      htmlBody: html,
      tag: 'transactional',
    });
    return { ok: true, messageId: result.messageId, accountId: result.accountId };
  }
}

const emailService = new EmailService();
export default emailService;
