/**
 * iMessage Service via BlueBubbles Server
 *
 * Sends and receives iMessages by calling the BlueBubbles REST API running
 * on a Mac Mini (or any always-on Mac). BlueBubbles exposes an HTTPS endpoint
 * (tunnelled via Cloudflare Tunnel) that we hit from the VPS.
 *
 * Architecture:
 *  Mac Mini (BlueBubbles Server + Messages.app)
 *    ↕  Cloudflare Tunnel (HTTPS)
 *  VPS (this service) → POST /api/v1/message/text  (outbound)
 *                      ← POST /webhook/imessage     (inbound via webhook)
 *
 * Supports N IMessageAccount rows in DB — e.g. Mac Mini + MacBook.
 * Round-robin routing across enabled accounts with hourly/daily caps.
 *
 * macOS Tahoe note: Private API helper has injection issues on arm64 Tahoe.
 * We default to method:"apple-script" which works perfectly on all macOS versions.
 *
 * BlueBubbles docs: https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks
 */

import { withDefaultCountryCode } from '../utils/phoneDefaults.js';
import fetch from 'node-fetch';
import crypto from 'crypto';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import activityLog, { EVENT_TYPES } from '../utils/activityLog.js';
import leadStateService from '../domain/leadStateService.js';

try {
} catch {}

// ── AES-256-GCM encryption (same scheme as emailService + whatsappCloudApi) ──
function getEncryptionKey() {
  const raw = process.env.LEAD_SYNC_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (raw.length < 16) {
    throw new Error('Encryption key too short - set LEAD_SYNC_ENCRYPTION_KEY (32+ chars)');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

function decrypt(stored) {
  if (!stored) return '';
  if (!stored.startsWith('enc:v1:')) return stored;
  try {
    const parts = stored.slice('enc:v1:'.length).split('.');
    if (parts.length !== 3) throw new Error('Malformed encrypted value');
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    logger.error(`[iMessage] Password decrypt failed (key rotated?): ${error.message}`);
    return '';
  }
}

/**
 * Normalise a phone number for iMessage.
 * iMessage accepts E.164 (+15551234567) or email addresses.
 * We ensure the number starts with +.
 */
function normalizePhone(phone) {
  if (!phone) return '';
  if (String(phone).includes('@')) return String(phone).trim().toLowerCase();
  const digits = String(phone).replace(/\D/g, '');
  return `+${withDefaultCountryCode(digits)}`;
}

/**
 * Build a BlueBubbles chatGuid for an individual iMessage chat.
 * Format: "iMessage;-;<E.164 phone>"
 * e.g.  "iMessage;-;+15551234567"
 */
function buildChatGuid(phone) {
  return `iMessage;-;${normalizePhone(phone)}`;
}

export function normalizeIMessageServerUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('BlueBubbles server URL is invalid');
  }

  const isLocalHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('BlueBubbles server URL must use HTTPS');
  }
  if (url.username || url.password) throw new Error('BlueBubbles server URL must not contain credentials');
  url.pathname = url.pathname.replace(/\/$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function buildBlueBubblesApiUrl(serverUrl, apiPath, password) {
  const url = new URL(apiPath, `${normalizeIMessageServerUrl(serverUrl)}/`);
  url.searchParams.set('guid', password);
  return url.toString();
}

class IMessageService {
  constructor() {
    // accountId → { hourlySent, dailySent, pausedUntil }
    this._hourlyTracker = new Map();
    this._dailyTracker  = new Map();
    this._pausedUntil   = new Map();
    this._errorTracker  = new Map();
    this._lastAccountIndex = 0;

    // hourly reset every 60 min
    const hourlyReset = setInterval(() => {
      this._hourlyTracker.clear();
      logger.debug('[iMessage] Hourly send counters reset');
    }, 60 * 60 * 1000);
    hourlyReset.unref?.();
  }

  // ─────────────────────────────────────────────────────────
  // Account management
  // ─────────────────────────────────────────────────────────

  /** Return all enabled IMessageAccount rows */
  async getEnabledAccounts() {
    return prisma.iMessageAccount.findMany({ where: { enabled: true } });
  }

  /**
   * Pick the next available account via round-robin.
   * Skips accounts that are paused, offline, or over rate limit.
   */
  async getNextAccount() {
    const accounts = await this.getEnabledAccounts();
    if (!accounts.length) return null;

    for (let i = 0; i < accounts.length; i++) {
      const idx = (this._lastAccountIndex + i) % accounts.length;
      const account = accounts[idx];

      // Check if paused due to recent error
      const pausedUntil = this._pausedUntil.get(account.id);
      if (pausedUntil && Date.now() < pausedUntil) continue;

      // Check hourly limit
      const hourlySent = this._hourlyTracker.get(account.id) || 0;
      if (hourlySent >= account.hourlyLimit) continue;

      // Check daily limit
      if (account.sentToday >= account.dailyLimit) continue;

      this._lastAccountIndex = (idx + 1) % accounts.length;
      return account;
    }

    logger.warn('[iMessage] All accounts are at rate limit or paused');
    return null;
  }

  /**
   * Decrypt password for an account.
   */
  _getPassword(account) {
    return decrypt(account.password);
  }

  async _incrementSentCounters(accountId) {
    if (!accountId) return;
    const hourlySent = (this._hourlyTracker.get(accountId) || 0) + 1;
    this._hourlyTracker.set(accountId, hourlySent);
    await prisma.iMessageAccount.update({
      where: { id: accountId },
      data: { sentToday: { increment: 1 } },
    });
  }

  /**
   * BlueBubbles' AppleScript transport can deliver a message but leave the
   * HTTP request open until it times out (BlueBubbles server issue #801).
   * Query the destination chat before treating an ambiguous timeout as a
   * failure, otherwise the queue would send a duplicate on its next retry.
   */
  async findRecentOutboundConfirmation({ accountId, phone, text, notBefore }) {
    const account = await prisma.iMessageAccount.findUnique({ where: { id: accountId } });
    if (!account?.enabled) return null;
    const password = this._getPassword(account);
    if (!password) return null;

    const address = normalizePhone(phone);
    const afterMs = new Date(notBefore || Date.now() - 10 * 60 * 1000).getTime();
    const chatGuids = [`any;-;${address}`, `iMessage;-;${address}`];

    for (const chatGuid of chatGuids) {
      try {
        const path = `/api/v1/chat/${encodeURIComponent(chatGuid)}/message`;
        const url = new URL(buildBlueBubblesApiUrl(account.serverUrl, path, password));
        url.searchParams.set('limit', '20');
        url.searchParams.set('offset', '0');
        const response = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) continue;
        const payload = await response.json().catch(() => ({}));
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.data?.messages) ? payload.data.messages : [];
        const match = rows.find((row) => {
          const createdAt = Number(row?.dateCreated || row?.date || 0);
          const body = String(row?.text ?? row?.body ?? '');
          return row?.isFromMe === true && body === String(text || '') && createdAt >= afterMs;
        });
        if (match) {
          return {
            messageId: match.guid || match.id || null,
            sentAt: new Date(Number(match.dateCreated || match.date || Date.now())),
            accountId: account.id,
          };
        }
      } catch (error) {
        logger.debug(`[iMessage] Confirmation lookup failed for account ${account.id}: ${error.message}`);
      }
    }
    return null;
  }

  /**
   * Encrypt a plain-text password for DB storage.
   */
  encryptPassword(plain) {
    return encrypt(plain);
  }

  // ─────────────────────────────────────────────────────────
  // BlueBubbles REST API calls
  // ─────────────────────────────────────────────────────────

  /**
   * Ping a BlueBubbles server to check it's online.
   * Updates account.status in DB.
   * @param {number} accountId
   * @returns {boolean} true if online
   */
  async ping(accountId) {
    try {
      const account = await prisma.iMessageAccount.findUnique({ where: { id: accountId } });
      if (!account) return false;

      const password = this._getPassword(account);
      if (!password) throw new Error('BlueBubbles password could not be decrypted');
      const url = buildBlueBubblesApiUrl(account.serverUrl, '/api/v1/ping', password);

      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });

      const isOnline = res.ok;
      await prisma.iMessageAccount.update({
        where: { id: accountId },
        data: {
          status: isOnline ? 'online' : 'offline',
          lastPingAt: new Date(),
        },
      });

      return isOnline;
    } catch (err) {
      logger.warn(`[iMessage] Ping failed for account ${accountId}: ${err.message}`);
      await prisma.iMessageAccount.update({
        where: { id: accountId },
        data: { status: 'offline', lastPingAt: new Date() },
      }).catch(() => {});
      return false;
    }
  }

  /**
   * Ping all enabled accounts. Called by a cron job every 5 minutes.
   */
  async pingAll() {
    const accounts = await this.getEnabledAccounts();
    await Promise.all(accounts.map(a => this.ping(a.id)));
  }

  /**
   * Send an iMessage to a phone number.
   *
   * @param {string} phone        — recipient phone (any format)
   * @param {string} text         — message body
   * @param {number|null} accountId — specific IMessageAccount to use (null = auto)
   * @returns {{ success: boolean, messageId?: string, accountId?: number, reason?: string }}
   */
  async sendMessage(phone, text, accountId = null, { deferCounters = false } = {}) {
    let account = null;
    let sendStartedAt = new Date();
    try {
      // Pick account
      if (accountId) {
        account = await prisma.iMessageAccount.findUnique({ where: { id: accountId } });
      } else {
        account = await this.getNextAccount();
      }

      if (!account) {
        return { success: false, reason: 'no_account_available' };
      }
      if (!account.enabled) return { success: false, reason: 'account_disabled' };

      const password = this._getPassword(account);
      if (!password) return { success: false, reason: 'credential_unavailable' };
      const chatGuid = buildChatGuid(phone);

      // Prepare payload — use apple-script method (works on all macOS including Tahoe)
      // "private-api" is faster but has arm64 Tahoe injection issues
      const payload = {
        chatGuid,
        // BlueBubbles server releases disagree on the public field name:
        // older REST examples use `text`, while newer validation requires
        // `message`. Supplying both is backward-compatible and avoids a
        // version-specific send failure.
        text,
        message: text,
        method: 'apple-script',
        // Recent BlueBubbles versions require a client-generated temporary
        // GUID for AppleScript sends so the eventual chat.db row can be
        // reconciled with the API request.
        tempGuid: crypto.randomUUID(),
        // Typing delay makes it feel human; BlueBubbles handles this client-side
        // when private-api is available. With apple-script it sends immediately.
      };

      const url = buildBlueBubblesApiUrl(account.serverUrl, '/api/v1/message/text', password);
      sendStartedAt = new Date();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        // BlueBubbles' AppleScript route can persist the message promptly but
        // leave the HTTP request open. A shorter timeout lets the catch block
        // reconcile against BlueBubbles history without blocking every live
        // lead for 30 seconds; a confirmed history row is still treated sent.
        signal: AbortSignal.timeout(12000),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const rawError = data?.error || data?.message || `HTTP ${res.status}`;
        const errMsg = typeof rawError === 'string' ? rawError : JSON.stringify(rawError);
        logger.error(`[iMessage] Send failed to ${phone} via account ${account.id}: ${errMsg}`);

        // Pause this account for 5 min on repeated errors
        const errCount = (this._errorTracker.get(account.id) || 0) + 1;
        this._errorTracker.set(account.id, errCount);
        if (errCount >= 3) {
          this._pausedUntil.set(account.id, Date.now() + 5 * 60 * 1000);
          this._errorTracker.set(account.id, 0);
          logger.warn(`[iMessage] Account ${account.id} paused for 5 min after ${errCount} errors`);
        }

        return { success: false, reason: 'send_failed', rawError: errMsg };
      }

      if (!deferCounters) await this._incrementSentCounters(account.id);

      const messageId = data?.data?.guid || data?.guid || null;
      logger.info(`[iMessage] ✅ Sent to ${phone} via account ${account.id} (${account.name})`);

      // Clear error counter on success
      this._errorTracker.delete(account.id);

      return { success: true, messageId, accountId: account.id };

    } catch (err) {
      if (account) {
        const confirmed = await this.findRecentOutboundConfirmation({
          accountId: account.id,
          phone,
          text,
          notBefore: new Date(sendStartedAt.getTime() - 5000),
        });
        if (confirmed) {
          if (!deferCounters) await this._incrementSentCounters(account.id);
          logger.warn(`[iMessage] HTTP send did not complete, but delivery was confirmed in BlueBubbles (${confirmed.messageId || 'no-guid'})`);
          return {
            success: true,
            messageId: confirmed.messageId,
            accountId: account.id,
            sentAt: confirmed.sentAt,
            confirmation: 'bluebubbles_history_after_http_error',
          };
        }
      }
      logger.error(`[iMessage] sendMessage exception: ${err.message}`);
      return { success: false, reason: 'exception', rawError: err.message };
    }
  }

  /** Process staged iMessage rows created by fresh-lead automation. */
  async processQueue({ messageIds = null } = {}) {
    const pending = await prisma.message.findMany({
      where: {
        ...(Array.isArray(messageIds) ? { id: { in: messageIds } } : {}),
        status: 'queued', channel: 'imessage', direction: 'outbound',
        scheduledAt: { lte: new Date() },
      },
      include: { lead: true },
      orderBy: { scheduledAt: 'asc' },
      take: Array.isArray(messageIds) ? Math.max(1, messageIds.length) : 10,
    });

    for (const message of pending) {
      const claimed = await prisma.message.updateMany({
        where: { id: message.id, status: 'queued' }, data: { status: 'sending' },
      });
      if (claimed.count === 0) continue;
      try {
        const lead = await prisma.lead.findUnique({ where: { id: message.leadId } });
        if (!lead || leadStateService.shouldBlockAutomation(lead.status, { channel: 'imessage' })) {
          await prisma.message.update({ where: { id: message.id }, data: { status: 'cancelled' } });
          continue;
        }
        let sendAccountId = message.imessageAccountId;
        if (!sendAccountId) {
          const account = await this.getNextAccount();
          if (account) {
            sendAccountId = account.id;
            await prisma.message.update({
              where: { id: message.id },
              data: { imessageAccountId: sendAccountId },
            });
          }
        }
        const result = await this.sendMessage(lead.mobile, message.content, sendAccountId, { deferCounters: true });
        if (result.success) {
          const updated = await prisma.message.updateMany({
            where: { id: message.id, status: { in: ['sending', 'queued'] } },
            data: {
              status: 'sent', sentAt: result.sentAt || new Date(),
              imessageAccountId: result.accountId || sendAccountId,
              imessageMessageId: result.messageId || null,
              providerStatusReason: result.confirmation || null,
            },
          });
          if (updated.count > 0) {
            await this._incrementSentCounters(result.accountId || sendAccountId);
          }
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              imessageStatus: 'sent', lastImessageAt: result.sentAt || new Date(), lastMessageAt: result.sentAt || new Date(),
              assignedIMessageAccountId: result.accountId || sendAccountId,
            },
          });
          continue;
        }

        // An outbound webhook can confirm delivery while the HTTP request is
        // still unwinding. Never turn that confirmed row back into a retry.
        const latest = await prisma.message.findUnique({
          where: { id: message.id },
          select: { status: true },
        });
        if (latest?.status === 'sent') continue;

        const retryCount = (message.retryCount || 0) + 1;
        await prisma.message.update({
          where: { id: message.id },
          data: {
            retryCount,
            status: retryCount >= (message.maxRetries || 3) ? 'permanently_failed' : 'queued',
            scheduledAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        });
        if (retryCount >= (message.maxRetries || 3)) {
          await prisma.lead.update({ where: { id: lead.id }, data: { imessageStatus: 'failed' } });
        }
      } catch (error) {
        logger.error(`[iMessage] Queue message ${message.id} failed: ${error.message}`);
        await prisma.message.updateMany({
          where: { id: message.id, status: 'sending' },
          data: { status: 'queued', retryCount: { increment: 1 }, scheduledAt: new Date(Date.now() + 10 * 60 * 1000) },
        }).catch(() => {});
      }
    }
  }

  parseOutboundWebhookEvent(body) {
    try {
      const type = body?.type;
      const data = body?.data;
      if (!['new-message', 'new_message'].includes(type) || !data || data.isFromMe !== true) return null;
      const chatGuid = data?.chats?.[0]?.guid || '';
      const address = data?.handle?.address
        || data?.handle?.id
        || (chatGuid.includes(';-;') ? chatGuid.split(';-;').pop() : '');
      if (!address) return null;
      return {
        to: address,
        text: String(data.text ?? data.body ?? ''),
        messageId: data.guid || data.id || null,
        timestamp: data.dateCreated || Date.now(),
      };
    } catch (error) {
      logger.error(`[iMessage] Outbound webhook parse error: ${error.message}`);
      return null;
    }
  }

  /** Mark a queue row sent from BlueBubbles' self-message webhook. */
  async reconcileOutboundWebhook(body, accountId = null) {
    const event = this.parseOutboundWebhookEvent(body);
    if (!event) return { matched: false };

    // BlueBubbles retries webhooks. A provider GUID is a delivery receipt, so
    // consuming it twice must never advance a second queued row.
    if (event.messageId) {
      const existing = await prisma.message.findFirst({
        where: { imessageMessageId: event.messageId },
        select: { id: true },
      });
      if (existing) return { matched: true, messageId: existing.id, duplicate: true };
    }

    const candidates = await prisma.message.findMany({
      where: {
        channel: 'imessage',
        direction: 'outbound',
        status: { in: ['sending', 'queued'] },
        updatedAt: { gte: new Date(Date.now() - 20 * 60 * 1000) },
      },
      include: { lead: { select: { id: true, mobile: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });
    const destination = normalizePhone(event.to);
    const destinationMatches = candidates.filter((row) => normalizePhone(row.lead.mobile) === destination);
    const candidate = destinationMatches.find((row) => event.text && row.content === event.text)
      || destinationMatches.find((row) => row.status === 'sending');
    if (!candidate) return { matched: false };

    const resolvedAccountId = accountId || candidate.imessageAccountId || null;
    const sentAt = new Date(Number(event.timestamp) || Date.now());
    const updated = await prisma.message.updateMany({
      where: { id: candidate.id, status: { in: ['sending', 'queued'] } },
      data: {
        status: 'sent',
        sentAt,
        imessageAccountId: resolvedAccountId,
        imessageMessageId: event.messageId,
        providerStatusReason: 'bluebubbles_outbound_webhook',
      },
    });
    if (updated.count === 0) return { matched: false };

    if (resolvedAccountId) await this._incrementSentCounters(resolvedAccountId);
    await prisma.lead.update({
      where: { id: candidate.leadId },
      data: {
        imessageStatus: 'sent',
        lastImessageAt: sentAt,
        lastMessageAt: sentAt,
        ...(resolvedAccountId ? { assignedIMessageAccountId: resolvedAccountId } : {}),
      },
    });
    logger.info(`[iMessage] ✅ Outbound webhook confirmed queue message ${candidate.id}`);
    return { matched: true, messageId: candidate.id };
  }

  /**
   * Reconcile messages left in `sending` by a crash before requeueing them.
   * Delivery history wins; only genuinely unconfirmed rows return to queue.
   */
  async recoverStuckMessages({ staleMinutes = 5 } = {}) {
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
    const rows = await prisma.message.findMany({
      where: {
        channel: 'imessage', direction: 'outbound', status: 'sending',
        updatedAt: { lt: cutoff },
      },
      include: { lead: { select: { mobile: true } } },
      take: 100,
    });
    let confirmed = 0;
    let requeued = 0;
    for (const row of rows) {
      const match = row.imessageAccountId
        ? await this.findRecentOutboundConfirmation({
            accountId: row.imessageAccountId,
            phone: row.lead.mobile,
            text: row.content,
            notBefore: new Date(row.updatedAt.getTime() - 5000),
          })
        : null;
      if (match) {
        const updated = await prisma.message.updateMany({
          where: { id: row.id, status: 'sending' },
          data: {
            status: 'sent', sentAt: match.sentAt, imessageMessageId: match.messageId,
            providerStatusReason: 'bluebubbles_history_after_restart',
          },
        });
        if (updated.count > 0) {
          confirmed += 1;
          await this._incrementSentCounters(row.imessageAccountId);
          await prisma.lead.update({
            where: { id: row.leadId },
            data: { imessageStatus: 'sent', lastImessageAt: match.sentAt, lastMessageAt: match.sentAt },
          });
        }
      } else {
        const updated = await prisma.message.updateMany({
          where: { id: row.id, status: 'sending' },
          data: { status: 'queued', scheduledAt: new Date() },
        });
        requeued += updated.count;
      }
    }
    return { count: rows.length, confirmed, requeued };
  }

  // ─────────────────────────────────────────────────────────
  // Webhook parsing
  // ─────────────────────────────────────────────────────────

  /**
   * Parse an incoming BlueBubbles webhook payload.
   *
   * BlueBubbles webhook event shape (type: "new-message"):
   * {
   *   "type": "new-message",
   *   "data": {
   *     "guid": "message-guid",
   *     "text": "Hello",
   *     "isFromMe": false,
   *     "handle": { "address": "+15551234567" },
   *     "chats": [{ "guid": "iMessage;-;+15551234567", ... }],
   *     "dateCreated": 1234567890000
   *   }
   * }
   *
   * Returns null if this is not a parseable inbound message event.
   * Returns { from, text, messageId, chatGuid } for inbound messages.
   */
  parseWebhookEvent(body) {
    try {
      const type = body?.type;

      // Only process new incoming messages (not sent by us)
      if (type !== 'new-message' && type !== 'new_message') return null;

      const data = body?.data;
      if (!data) return null;

      // Skip messages we sent
      if (data.isFromMe === true) return null;

      // Handle address
      const address = data?.handle?.address || data?.handle?.id;
      if (!address) return null;

      const text = data.text || data.body || '';
      const messageId = data.guid || data.id || null;
      const chatGuid = data?.chats?.[0]?.guid || buildChatGuid(address);

      return {
        from: address,       // E.164 phone or Apple ID email
        text,
        messageId,
        chatGuid,
        timestamp: data.dateCreated || Date.now(),
      };
    } catch (err) {
      logger.error(`[iMessage] Webhook parse error: ${err.message}`);
      return null;
    }
  }

  /**
   * Reset sentToday counters for all iMessage accounts.
   * Called by midnight cron job in index.js.
   */
  async resetDailyCounters() {
    await prisma.iMessageAccount.updateMany({
      data: { sentToday: 0, lastResetAt: new Date() },
    });
    logger.info('[iMessage] Daily send counters reset');
  }
}

const imessageService = new IMessageService();
export default imessageService;
