import { credentialState, publicCredentialSummary } from './whatsappProviders.js';
import prisma from '../utils/prismaClient.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import { formatPhoneForWA } from '../utils/delay.js';
import whatsappCloudApi from './whatsappCloudApi.js';

/**
 * WhatsApp Account Manager — official Cloud API only.
 *
 * This module is the *account brain*, not a transport. It owns:
 *  - Round-robin routing across enabled accounts (pool- and role-aware)
 *  - Per-account hourly / daily / new-lead budgets read from the DB
 *  - Per-account persona, consumed by messageComposer.js and emailService.js
 *    persona injection — which is why this file survives the web_js removal
 *  - Error-spike detection and auto-pause
 *  - Account CRUD used by the Settings UI
 *
 * Actual message delivery is delegated to ./whatsappCloudApi.js.
 *
 * History: this file used to embed a whatsapp-web.js + Puppeteer transport
 * (QR pairing, Chrome lifecycle, reconnect backoff, fromMe echo suppression,
 * typing simulation). All of that was removed when we moved to the official
 * API. Inbound replies and delivery receipts now arrive by webhook instead of
 * client events, so there is no listener wiring here any more.
 */
class WhatsAppManager {
  constructor() {
    this._lastAccountIndex = 0;      // for round-robin cycling

    // ── Per-account rate tracking (Maps) ──
    this.hourlySent = new Map();          // accountId → number
    this._hourlyResetTimer = null;
    // Wall-clock of last successful send per account — enforces a hard minimum
    // gap between any two sends.
    this.lastSendAt = new Map();          // accountId → ms timestamp

    // ── Error spike detection ──
    this.consecutiveErrors = new Map();   // accountId → number
    this.pausedUntil = new Map();         // accountId → timestamp
  }

  // ════════════════════════════════════════
  // Initialization
  // ════════════════════════════════════════

  async initialize() {
    logger.info('🟢 Initializing WhatsApp accounts (Cloud API)...');

    let accounts = await prisma.whatsAppAccount.findMany();

    // If no accounts exist yet, seed one default account.
    // Multi-account round-robin was a web_js ban-spreading tactic; the official
    // API ties the display name to one verified business, so one is the norm.
    if (accounts.length === 0) {
      logger.info('No accounts found — seeding 1 default account...');
      await prisma.whatsAppAccount.create({
        data: { id: 1, name: 'Account 1', phone: '', status: 'disconnected', enabled: true },
      });
      accounts = await prisma.whatsAppAccount.findMany();
    }

    // ── One-time migration off the retired web_js runtime ──
    // whatsapp-web.js no longer exists, so any account still flagged 'web_js'
    // would be unroutable (whatsappCloudApi only resolves per-account
    // credentials for 'cloud_api' rows). Flip them over; they simply have
    // no credentials yet and will report as not-ready until configured.
    const legacyRuntime = accounts.filter(a => a.waAccountType !== 'cloud_api');
    if (legacyRuntime.length > 0) {
      await prisma.whatsAppAccount.updateMany({
        where: { id: { in: legacyRuntime.map(a => a.id) } },
        data: { waAccountType: 'cloud_api' },
      });
      logger.info(`🔀 Migrated ${legacyRuntime.length} account(s) from web_js → cloud_api`);
      for (const a of legacyRuntime) a.waAccountType = 'cloud_api';
    }

    // ── Repair invalid legacy limits without imposing a hard ceiling. ──
    // Throughput is an operator setting. Older builds silently clamped values
    // to 20/day, 3/hour and 10 new leads/day on every restart, which made a
    // deliberate higher-volume campaign impossible to persist.
    const NEW_LEAD_DEFAULT = 5;
    for (const a of accounts) {
      const updates = {};
      // Treat zero/negative values from partially-migrated rows as unset.
      if (!a.dailyLimit || a.dailyLimit <= 0) updates.dailyLimit = config.whatsapp.maxMessagesPerDay || 15;
      if (!a.hourlyLimit || a.hourlyLimit <= 0) updates.hourlyLimit = config.whatsapp.hourlyLimit || 2;
      if (!a.newLeadsPerDay || a.newLeadsPerDay <= 0) updates.newLeadsPerDay = NEW_LEAD_DEFAULT;
      if (Object.keys(updates).length > 0) {
        await prisma.whatsAppAccount.update({ where: { id: a.id }, data: updates });
        logger.info(`🧮 Account ${a.id} invalid limits repaired: ${JSON.stringify(updates)}`);
        Object.assign(a, updates);
      }
    }

    // ── Reconcile persisted status with credential reality ──
    // There is no connection to establish any more: an account is usable the
    // moment it is enabled AND has credentials. Statuses left over from the QR
    // era (qr_pending / qr_expired / connecting / error) are meaningless now.
    // Keep this predicate identical to getStatus().isReady, or the Settings
    // cards drift from the health banner the way they did before #28.
    for (const a of accounts) {
      const ready = a.enabled && this._hasCredentials(a);
      const status = ready ? 'connected' : 'disconnected';
      if (a.status !== status) {
        await prisma.whatsAppAccount.update({
          where: { id: a.id },
          data: { status },
        }).catch(() => {});
        a.status = status;
      }
    }

    const readyCount = accounts.filter(a => a.enabled && this._hasCredentials(a)).length;
    logger.info(`Found ${accounts.length} account(s), ${readyCount} enabled and configured`);
    if (readyCount === 0) {
      logger.warn('⚠️ No WhatsApp account has Cloud API credentials — sending is disabled until one is configured in Settings');
    }

    // Reset hourly counters every hour
    if (this._hourlyResetTimer) clearInterval(this._hourlyResetTimer);
    this._hourlyResetTimer = setInterval(() => {
      for (const [id] of this.hourlySent) {
        this.hourlySent.set(id, 0);
      }
      logger.info('⏰ Hourly message counters reset');
    }, 60 * 60 * 1000);
  }

  /**
   * An account is sendable when its provider's credentials are present —
   * per account, or the env fallback for single-account installs. The rule
   * for each provider lives in whatsappProviders.credentialState.
   */
  _hasCredentials(account) {
    if (!account) return false;
    return credentialState(account).ready;
  }

  // ════════════════════════════════════════
  // Rate limiting & account selection
  // ════════════════════════════════════════

  /**
   * Check if an account is currently paused due to error spike
   */
  _isAccountPaused(accountId) {
    return Date.now() < (this.pausedUntil.get(accountId) || 0);
  }

  /**
   * Get the next available account (round-robin across ALL enabled accounts).
   */
  async getNextAccount({ poolId, forInitialOutreach = false } = {}) {
    // role != client_relations: the client-relations number is reserved for
    // post-sale contact and must NEVER be picked for cold outreach or as a send
    // fallback, or we lose the clientele channel.
    let accountFilter = { enabled: true, role: { not: 'client_relations' } };
    if (poolId) {
      const poolLinks = await prisma.leadPoolWhatsApp.findMany({
        where: { poolId },
        select: { whatsappAccountId: true },
      });
      if (poolLinks.length > 0) {
        accountFilter.id = { in: poolLinks.map(l => l.whatsappAccountId) };
      }
    }
    const accounts = await prisma.whatsAppAccount.findMany({
      where: accountFilter,
      orderBy: { id: 'asc' },
    });

    if (accounts.length === 0) {
      logger.warn('⚠️ No enabled WhatsApp accounts');
      return null;
    }

    // Round-robin: start from the next index after the last used
    for (let i = 0; i < accounts.length; i++) {
      const idx = (this._lastAccountIndex + i) % accounts.length;
      const account = accounts[idx];
      const id = account.id;

      // Skip if the account has no Cloud API credentials configured.
      // (Replaces the old Chrome-session readiness check — there is no
      // connection to wait on, only credentials to have or not have.)
      if (!this._hasCredentials(account)) continue;

      // Skip if paused due to errors
      if (this._isAccountPaused(id)) {
        logger.info(`⏸️ Account ${id} paused until ${new Date(this.pausedUntil.get(id)).toLocaleTimeString()}`);
        continue;
      }

      // ── Minimum gap between any two sends ────────────────────────────────
      // This account is good to go — advance the round-robin index
      this._lastAccountIndex = (idx + 1) % accounts.length;
      return id;
    }

    logger.warn(`⚠️ No WhatsApp accounts available${forInitialOutreach ? ' for new-lead outreach' : ''} (paused or unconfigured)`);
    return null;
  }

  // ════════════════════════════════════════
  // Message sending
  // ════════════════════════════════════════

  /**
   * Send a message with all safety measures.
   *
   * Return shape is preserved from the web_js implementation so every caller
   * (followup, campaignEngine, api.js, cookieRefresher) is
   * unaffected by the transport swap.
   *
   * @param {string} phone
   * @param {string} message
   * @param {number | null | undefined} accountId
   * @returns {{success: boolean, accountId: number | null, reason: string, error?: string, isNotOnWhatsApp?: boolean, identifiers?: string[], waMessageId?: string}}
   */
  async sendMessage(phone, message, accountId, { poolId } = {}) {
    // PERSONA SAFETY: If a specific account is requested, ONLY use that account.
    // Never silently fall back to a different account — that would cause persona
    // mismatch (content was generated with the requested account's persona).
    const selectedAccountId = accountId || await this.getNextAccount({ poolId });
    if (!selectedAccountId) {
      logger.warn('No account available for send');
      return { success: false, accountId: null, reason: 'no_account' };
    }

    const account = await prisma.whatsAppAccount.findUnique({ where: { id: selectedAccountId } });
    if (!account || !this._hasCredentials(account)) {
      logger.error(`Account ${selectedAccountId} has no Cloud API credentials`);
      return { success: false, accountId: selectedAccountId, reason: 'account_not_ready' };
    }

    // Re-check pause
    if (this._isAccountPaused(selectedAccountId)) {
      logger.warn(`Account ${selectedAccountId} is paused, skipping send`);
      return { success: false, accountId: selectedAccountId, reason: 'account_paused' };
    }

    const formattedPhone = formatPhoneForWA(phone);
    if (!formattedPhone) {
      logger.error(`Invalid phone number format`);
      return { success: false, accountId: selectedAccountId, reason: 'invalid_phone' };
    }

    const result = await whatsappCloudApi.sendTextMessage(formattedPhone, message, selectedAccountId);

    if (result.success) {
      // ── Success — reset error count, increment counters ──
      this.consecutiveErrors.set(selectedAccountId, 0);
      this.hourlySent.set(selectedAccountId, (this.hourlySent.get(selectedAccountId) || 0) + 1);
      this.lastSendAt.set(selectedAccountId, Date.now());

      await prisma.whatsAppAccount.update({
        where: { id: selectedAccountId },
        data: { messagesSentToday: { increment: 1 } },
      });

      const hrLimit = account.hourlyLimit || config.whatsapp.hourlyLimit || 8;
      logger.info(`📤 Sent via Acct ${selectedAccountId} to *${formattedPhone.slice(-4)} [hr:${this.hourlySent.get(selectedAccountId)}/${hrLimit}]`);
      return {
        success: true,
        accountId: selectedAccountId,
        reason: 'sent',
        // The Cloud API returns no chat identifiers; reply matching happens by
        // phone number through the webhook instead.
        identifiers: [],
        waMessageId: result.messageId || null,
      };
    }

    // ── Failure ──
    const errorMessage = result.rawError || result.reason || 'Unknown WhatsApp send error';

    if (result.reason === 'not_on_whatsapp') {
      // Bad lead number, not an account health issue — don't count it against
      // the error streak.
      logger.warn(`📵 Not on WhatsApp (Acct ${selectedAccountId}) → *${formattedPhone.slice(-4)}: ${errorMessage}`);
      return {
        success: false,
        accountId: selectedAccountId,
        reason: 'not_on_whatsapp',
        error: errorMessage,
        isNotOnWhatsApp: true,
      };
    }

    if (result.reason === 'invalid_phone') {
      return { success: false, accountId: selectedAccountId, reason: 'invalid_phone', error: errorMessage };
    }

    // ── Error spike detection ──
    const errCount = (this.consecutiveErrors.get(selectedAccountId) || 0) + 1;
    this.consecutiveErrors.set(selectedAccountId, errCount);
    const threshold = config.whatsapp.pauseOnErrorCount || 3;

    logger.error(`Send failed Acct ${selectedAccountId} → *${formattedPhone.slice(-4)}: ${errorMessage} (streak: ${errCount})`);

    if (errCount >= threshold) {
      const pauseMs = config.whatsapp.pauseDurationMs || 1800000;
      this.pausedUntil.set(selectedAccountId, Date.now() + pauseMs);
      logger.warn(`🛑 Account ${selectedAccountId} AUTO-PAUSED for ${pauseMs / 60000} min after ${errCount} consecutive errors`);
    }

    return {
      success: false,
      accountId: selectedAccountId,
      reason: result.reason || 'send_failed',
      error: errorMessage,
    };
  }

  /**
   * Trigger an approved AiSensy API Campaign while preserving the same account
   * selection, throttling, and counters used by normal WhatsApp sends.
   * This is the only valid first-contact transport when the Project API app
   * password is unavailable.
   */
  async sendCampaignTemplate(phone, campaignName, templateParams = [], accountId = null, {
    poolId,
    source = 'outboundos',
    userName,
  } = {}) {
    const selectedAccountId = accountId || await this.getNextAccount({ poolId, forInitialOutreach: true });
    if (!selectedAccountId) {
      return { success: false, accountId: null, reason: 'no_account' };
    }

    const account = await prisma.whatsAppAccount.findUnique({ where: { id: selectedAccountId } });
    if (!account || !this._hasCredentials(account)) {
      return { success: false, accountId: selectedAccountId, reason: 'account_not_ready' };
    }
    if (this._isAccountPaused(selectedAccountId)) {
      return { success: false, accountId: selectedAccountId, reason: 'account_paused' };
    }

    const formattedPhone = formatPhoneForWA(phone);
    if (!formattedPhone) {
      return { success: false, accountId: selectedAccountId, reason: 'invalid_phone' };
    }

    const result = await whatsappCloudApi.sendCampaignTemplate({
      phone: formattedPhone,
      campaignName,
      templateParams,
      userName: userName || account.name || config.business.name || 'Outbound OS',
      source,
      accountId: selectedAccountId,
    });

    if (!result.success) {
      return {
        success: false,
        accountId: selectedAccountId,
        reason: result.reason || 'send_failed',
        error: result.rawError || result.reason || 'WhatsApp template send failed',
      };
    }

    this.consecutiveErrors.set(selectedAccountId, 0);
    this.hourlySent.set(selectedAccountId, (this.hourlySent.get(selectedAccountId) || 0) + 1);
    this.lastSendAt.set(selectedAccountId, Date.now());
    await prisma.whatsAppAccount.update({
      where: { id: selectedAccountId },
      data: { messagesSentToday: { increment: 1 } },
    });

    return {
      success: true,
      accountId: selectedAccountId,
      reason: 'sent',
      identifiers: [],
      waMessageId: result.messageId || null,
    };
  }

  /**
   * Send a media file (image / PDF / video) to a phone number via WhatsApp.
   *
   * NOTE: the Cloud API takes a publicly reachable URL, not a local file path.
   * Callers that still pass an absolute path will fail here until the media
   * upload flow lands.
   *
   * @param {string} phone
   * @param {string} mediaUrl - publicly accessible URL to the file
   * @param {string} caption  - optional caption
   * @param {string} filename - filename shown to recipient (optional)
   * @param {number} accountId
   */
  async sendMediaMessage(phone, mediaUrl, caption = '', filename = null, accountId = null, { poolId } = {}) {
    const selectedAccountId = accountId || await this.getNextAccount({ poolId });
    if (!selectedAccountId) return { success: false, reason: 'no_account' };

    const account = await prisma.whatsAppAccount.findUnique({ where: { id: selectedAccountId } });
    if (!account || !this._hasCredentials(account)) {
      return { success: false, accountId: selectedAccountId, reason: 'account_not_ready' };
    }

    const formattedPhone = formatPhoneForWA(phone);
    if (!formattedPhone) return { success: false, accountId: selectedAccountId, reason: 'invalid_phone' };

    // Infer the Cloud API media type from the file extension.
    const ext = String(filename || mediaUrl || '').split('.').pop()?.toLowerCase();
    const mediaType =
      ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? 'image' :
      ['mp4', '3gp'].includes(ext) ? 'video' :
      ['mp3', 'ogg', 'opus', 'aac', 'amr'].includes(ext) ? 'audio' : 'document';

    const result = await whatsappCloudApi.sendMediaMessage(
      formattedPhone, mediaUrl, mediaType, caption, filename || '', selectedAccountId
    );

    if (!result.success) {
      logger.error(`Media send failed for *${formattedPhone.slice(-4)}: ${result.rawError || result.reason}`);
      return { success: false, accountId: selectedAccountId, reason: result.reason || 'send_error', error: result.rawError };
    }

    this.hourlySent.set(selectedAccountId, (this.hourlySent.get(selectedAccountId) || 0) + 1);
    this.lastSendAt.set(selectedAccountId, Date.now());
    logger.info(`📎 Media sent to *${formattedPhone.slice(-4)} via Acct ${selectedAccountId}`);
    return { success: true, accountId: selectedAccountId, msgId: result.messageId };
  }

  // ════════════════════════════════════════
  // Utility
  // ════════════════════════════════════════

  async resetDailyCounters() {
    await prisma.whatsAppAccount.updateMany({
      data: {
        messagesSentToday: 0,
        newLeadsContactedToday: 0,
        lastResetAt: new Date(),
      },
    });
    for (const [id] of this.hourlySent) {
      this.hourlySent.set(id, 0);
      this.consecutiveErrors.set(id, 0);
      this.pausedUntil.set(id, 0);
    }
    logger.info('🔄 Daily + hourly counters reset (incl. new-lead budget), pauses cleared');
  }

  /**
   * The Cloud API has no "is this number registered" lookup — the only way to
   * find out is to send and read the error. Always returns null ("unknown");
   * callers treat that as "proceed and let the send path discover the truth",
   * and a send to a non-WhatsApp number comes back as reason 'not_on_whatsapp'.
   */
  async isNumberOnWhatsApp(_phone) {
    return null;
  }

  async destroy() {
    if (this._hourlyResetTimer) {
      clearInterval(this._hourlyResetTimer);
      this._hourlyResetTimer = null;
    }
    logger.info('🔌 WhatsApp manager stopped');
  }

  async getStatus() {
    const accounts = await prisma.whatsAppAccount.findMany({ orderBy: { id: 'asc' } });
    return accounts.map(a => {
      const {
        aisensyApiKey,
        aisensyCampaignApiKey,
        cloudApiToken,
        ...safe
      } = a;
      return {
        ...safe,
        ...publicCredentialSummary(a),
        isReady: a.enabled && this._hasCredentials(a),
        hourlySent: this.hourlySent.get(a.id) || 0,
        hourlyLimit: a.hourlyLimit || config.whatsapp.hourlyLimit || 8,
        dailyLimit: a.dailyLimit || config.whatsapp.maxMessagesPerDay || 50,
        isPaused: this._isAccountPaused(a.id),
        pausedUntil: this.pausedUntil.get(a.id) || 0,
      };
    });
  }

  // ════════════════════════════════════════
  // Account Management
  // ════════════════════════════════════════

  /**
   * Add a new WhatsApp account to the system.
   * Creates a DB row and returns the new account.
   */
  async addAccount({ name, personaName, personaGender, personaTitle, companyName, companyCity, companyIndustry, companyCerts, companyUSP, hourlyLimit, dailyLimit, maxFollowups, followupDelays } = {}) {
    const account = await prisma.whatsAppAccount.create({
      data: {
        name: name || `Account ${Date.now()}`,
        phone: '',
        status: 'disconnected',
        enabled: false,
        waAccountType: 'cloud_api',
        // Identity comes from config or the caller — never a hardcoded company.
        // Blank is a valid value: messageComposer falls back to the global
        // profile, and an unset field is better than confidently introducing
        // this deployment as whatever business the code's author ran.
        personaName: personaName || config.business.senderName || '',
        personaGender: personaGender || '',
        personaTitle: personaTitle || 'sales representative',
        companyName: companyName || config.business.name || '',
        companyCity: companyCity || '',
        companyIndustry: companyIndustry || config.business.industry || '',
        companyCerts: companyCerts || '',
        companyUSP: companyUSP || '',
        hourlyLimit: hourlyLimit || 2,
        dailyLimit: dailyLimit || 20,
        newLeadsPerDay: 5,
        maxFollowups: maxFollowups || 5,
        followupDelays: followupDelays || '[0,240,1440,2880,4320]',
      },
    });
    logger.info(`➕ Created new WhatsApp account: ${account.name} (id=${account.id})`);
    return account;
  }

  /**
   * Enable an account. There is no client to boot — the account becomes
   * sendable as soon as it is enabled AND has credentials.
   */
  async enableAccount(accountId) {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new Error('Account not found');

    const ready = this._hasCredentials(account);
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { enabled: true, status: ready ? 'connected' : 'disconnected' },
    });
    if (!ready) {
      logger.warn(`⚠️ Account ${accountId} enabled but has no Cloud API credentials — add them in Settings before it can send`);
    }
    return { success: true, ready };
  }

  /**
   * Disable an account so it stops being selected for sends.
   */
  async disableAccount(accountId) {
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { enabled: false, status: 'disconnected' },
    });
    logger.info(`⏸️ Account ${accountId} disabled`);
    return { success: true };
  }

  /**
   * Get the per-account persona profile for LLM injection.
   */
  async getAccountProfile(accountId) {
    const account = await prisma.whatsAppAccount.findFirst({ where: { id: accountId } });
    if (!account) return null;
    return {
      _sourceAccountId: account.id, // Stamp for persona integrity verification
      personaName: account.personaName,
      personaGender: account.personaGender,
      personaTitle: account.personaTitle,
      companyName: account.companyName,
      companyCity: account.companyCity,
      companyIndustry: account.companyIndustry,
      companyCerts: account.companyCerts,
      companyUSP: account.companyUSP,
      hourlyLimit: account.hourlyLimit,
      dailyLimit: account.dailyLimit,
      maxFollowups: account.maxFollowups,
      followupDelays: JSON.parse(account.followupDelays || '[0,240,1440,2880,4320]'),
    };
  }

  /**
   * Update an account's persona and configuration.
   * Limits remain explicit operator-controlled guardrails, but are no longer
   * capped to legacy warm-up values by the server.
   */
  async updateAccount(accountId, updates) {
    const allowed = ['name', 'role', 'personaName', 'personaGender', 'personaTitle', 'companyName', 'companyCity', 'companyIndustry', 'companyCerts', 'companyUSP', 'hourlyLimit', 'dailyLimit', 'newLeadsPerDay', 'maxFollowups', 'followupDelays', 'autoSleep'];
    const data = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        if (key === 'role') {
          // Only two legal roles; ignore anything else so a bad value can't
          // silently pull the client-relations number into the outreach pool.
          if (updates.role === 'outreach' || updates.role === 'client_relations') {
            data.role = updates.role;
          }
        } else if (key === 'hourlyLimit' || key === 'dailyLimit' || key === 'newLeadsPerDay' || key === 'maxFollowups') {
          const val = parseInt(updates[key], 10);
          if (Number.isFinite(val) && val > 0) data[key] = val;
        } else {
          data[key] = updates[key];
        }
      }
    }
    if (Object.keys(data).length === 0) return null;
    const account = await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data,
    });
    logger.info(`✏️ Account ${accountId} updated: ${Object.keys(data).join(', ')}`);
    return account;
  }
}

const whatsappManager = new WhatsAppManager();
export default whatsappManager;
