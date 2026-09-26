import businessProfile from '../businessProfile.js';
import crypto from 'crypto';

import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import emailService from './emailService.js';
import {
  buildWhatsAppCtaEmail,
  DAILY_EMAIL_TEMPLATE_VARIANT,
} from '../templates/emailWhatsappCta.js';

/**
 * Brevo Marketing Campaign adapter
 *
 * Daily prospecting must use Brevo's marketing-campaign surface, not the
 * transactional /smtp/email endpoint.  This adapter is deliberately dormant
 * until an operator turns it on after sender verification, IP authorization,
 * and lawful marketing consent are in place.  It never falls back to a
 * transactional send.
 */

const KEYS = {
  enabled: 'email.daily.marketing.enabled',
  folderId: 'email.daily.marketing.brevo_folder_id',
  lastResult: 'email.daily.marketing.last_result',
  statePrefix: 'email.daily.marketing.batch.',
};

const ACTIVE_STATUSES = new Set(['sent', 'scheduled', 'in_process', 'in process', 'queued', 'running']);

function stateKey(date, accountId) {
  return `${KEYS.statePrefix}${date}.${accountId}`;
}

function safeJson(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '';
}

function recipientHash(value) {
  return crypto.createHash('sha256').update(normalEmail(value)).digest('hex').slice(0, 24);
}

function marketingTemplate() {
  // Brevo renders these contact attributes independently for each recipient.
  // Every attribute receives a fallback so incomplete imported leads never
  // expose a raw placeholder.
  return buildWhatsAppCtaEmail({
    name: '{{ contact.FIRSTNAME|default:"there" }}',
    product: '{{ contact.PRODUCT|default:"our products" }}',
    country: '{{ contact.COUNTRY|default:"your market" }}',
  });
}

function firstName(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned || /^user$/i.test(cleaned)) return '';
  return cleaned.split(/\s+/)[0].slice(0, 80);
}

function contactAttributes(lead) {
  return Object.fromEntries(Object.entries({
    FIRSTNAME: firstName(lead.name),
    PRODUCT: String(lead.product || '').trim().slice(0, 180),
    COUNTRY: String(lead.country || '').trim().slice(0, 120),
  }).filter(([, value]) => Boolean(value)));
}

async function readConfig(key) {
  return prisma.systemConfig.findUnique({ where: { key } });
}

async function writeConfig(key, value) {
  return prisma.systemConfig.upsert({
    where: { key }, update: { value: String(value) }, create: { key, value: String(value) },
  });
}

async function isGloballyPaused() {
  const row = await readConfig('sending_paused');
  return row?.value === 'true';
}

function standardCampaignName({ date, account }) {
  const address = String(account.email || 'sender').split('@')[0].replace(/[^a-z0-9]+/gi, '-').slice(0, 28);
  return `Outbound OS Daily ${date} ${address}`;
}

function senderDisplayName(account) {
  const fallback = businessProfile.businessName || 'Outbound OS';
  return String(account.senderName || account.name || fallback).trim() || fallback;
}

function campaignStateFromRow(row) {
  return safeJson(row?.value, {});
}

function campaignStatus(value) {
  return String(value?.status || value?.campaign?.status || '').trim().toLowerCase().replace(/-/g, '_');
}

function positiveInteger(value) {
  const raw = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function configuredBrevoWebhookUrl() {
  // Do not guess from the dashboard application's public URL. It can include
  // a path such as /login, whereas Brevo needs the exact backend origin (or
  // the webhook endpoint itself). Requiring an explicit ops-level setting is
  // safer than accepting an apparently-valid but unreachable callback URL.
  const raw = String(process.env.BREVO_WEBHOOK_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(raw)) return null;
  if (raw.endsWith('/webhook/brevo') || raw.endsWith('/api/integrations/brevo')) return raw;
  return `${raw}/webhook/brevo`;
}

class BrevoMarketingCampaigns {
  async ensureDefaults() {
    await Promise.all([
      prisma.systemConfig.upsert({
        where: { key: KEYS.enabled }, update: {}, create: { key: KEYS.enabled, value: 'false' },
      }),
      prisma.systemConfig.upsert({
        where: { key: KEYS.folderId }, update: {}, create: { key: KEYS.folderId, value: '' },
      }),
    ]);
  }

  async isEnabled() {
    await this.ensureDefaults();
    const row = await readConfig(KEYS.enabled);
    return row?.value === 'true';
  }

  async setEnabled(enabled) {
    await writeConfig(KEYS.enabled, enabled ? 'true' : 'false');
    return this.getStatus();
  }

  async setFolderId(folderId) {
    const normalized = folderId == null || String(folderId).trim() === '' ? null : positiveInteger(folderId);
    if (folderId != null && String(folderId).trim() !== '' && !normalized) {
      throw new Error('Brevo folder ID must be a positive integer');
    }
    await writeConfig(KEYS.folderId, normalized || '');
    return this.getStatus();
  }

  async getStatus({ senderIds = [] } = {}) {
    await this.ensureDefaults();
    const uniqueIds = [...new Set(senderIds.map(Number).filter(Number.isInteger))];
    const [enabled, paused, folderRow, accounts, consentedCount, optOutCount] = await Promise.all([
      this.isEnabled(),
      isGloballyPaused(),
      readConfig(KEYS.folderId),
      uniqueIds.length
        ? prisma.emailAccount.findMany({
            where: { id: { in: uniqueIds } },
            select: { id: true, email: true, provider: true, enabled: true, status: true, sentToday: true, dailyLimit: true },
          })
        : Promise.resolve([]),
      prisma.lead.count({ where: { emailMarketingConsent: true, emailOptOut: false, email: { not: null } } }),
      prisma.lead.count({ where: { emailOptOut: true } }),
    ]);
    const configuredBrevoSenders = accounts.length === 2
      && accounts.every((account) => account.provider === 'brevo' && account.enabled && account.status === 'verified');
    const folderId = positiveInteger(folderRow?.value);
    const webhookUrl = configuredBrevoWebhookUrl();
    const webhookConfigured = Boolean(webhookUrl && process.env.BREVO_WEBHOOK_SECRET);
    return {
      enabled,
      globallyPaused: paused,
      configuredBrevoSenders,
      folderId,
      folderConfigured: Boolean(folderId),
      webhookConfigured,
      webhookUrl,
      consentedCount,
      optOutCount,
      accounts,
      ready: enabled && !paused && configuredBrevoSenders && Boolean(folderId) && webhookConfigured && consentedCount > 0,
      delivery: 'Brevo Marketing Campaigns',
    };
  }

  async _readBatchState(date, accountId) {
    const row = await readConfig(stateKey(date, accountId));
    return campaignStateFromRow(row);
  }

  async _writeBatchState(date, accountId, state) {
    await writeConfig(stateKey(date, accountId), JSON.stringify(state));
    return state;
  }

  async _createList({ account, date, folderId }) {
    const result = await emailService.brevoRequestForAccount(account.id, '/contacts/lists', {
      method: 'POST',
      body: {
        name: `${standardCampaignName({ date, account })} recipients`,
        folderId,
      },
    });
    const listId = Number(result?.id || result?.listId);
    if (!Number.isInteger(listId) || listId < 1) throw new Error('Brevo did not return a recipient list ID');
    return listId;
  }

  async _ensureContactAttributes(account) {
    const response = await emailService.brevoRequestForAccount(account.id, '/contacts/attributes');
    const existing = new Set((response?.attributes || []).map((attribute) => String(attribute.name || '').toUpperCase()));
    for (const name of ['PRODUCT', 'COUNTRY']) {
      if (existing.has(name)) continue;
      await emailService.brevoRequestForAccount(account.id, `/contacts/attributes/normal/${name}`, {
        method: 'POST',
        body: { type: 'text' },
      });
    }
  }

  async _upsertContact({ account, listId, lead }) {
    const email = normalEmail(lead.email);
    if (!email) throw new Error(`Lead ${lead.id} has no valid email address`);
    // Do not set emailBlacklisted=false: an unsubscribe made in Brevo must
    // remain honored even if this CRM lead is selected again by mistake.
    await emailService.brevoRequestForAccount(account.id, '/contacts', {
      method: 'POST',
      body: {
        email,
        attributes: contactAttributes(lead),
        listIds: [listId],
        updateEnabled: true,
      },
    });
  }

  async _createCampaign({ account, date, listId }) {
    const email = marketingTemplate();
    const result = await emailService.brevoRequestForAccount(account.id, '/emailCampaigns', {
      method: 'POST',
      body: {
        name: standardCampaignName({ date, account }),
        subject: email.subject,
        sender: { name: senderDisplayName(account), email: account.email },
        type: 'classic',
        htmlContent: email.htmlBody,
        recipients: { listIds: [listId] },
        mirrorActive: true,
        inlineImageActivation: false,
      },
    });
    const campaignId = Number(result?.id || result?.campaignId);
    if (!Number.isInteger(campaignId) || campaignId < 1) throw new Error('Brevo did not return a marketing campaign ID');
    return campaignId;
  }

  async _remoteCampaignStatus(account, campaignId) {
    return emailService.brevoRequestForAccount(account.id, `/emailCampaigns/${encodeURIComponent(campaignId)}`);
  }

  async _ensureCampaign({ date, account, leads, folderId }) {
    const key = stateKey(date, account.id);
    let state = await this._readBatchState(date, account.id);
    const leadIds = leads.map((lead) => Number(lead.id)).sort((a, b) => a - b);
    const recipientHashes = leads.map((lead) => recipientHash(lead.email)).sort();

    if (state.leadIds && JSON.stringify(state.leadIds) !== JSON.stringify(leadIds)) {
      throw new Error(`Brevo daily batch state mismatch for ${date} sender ${account.id}; review before changing recipients`);
    }
    if (!state.createdAt) {
      state = {
        version: 1,
        date,
        accountId: account.id,
        sender: account.email,
        leadIds,
        recipientHashes,
        createdAt: new Date().toISOString(),
      };
      await this._writeBatchState(date, account.id, state);
    }

    if (!state.listId) {
      state.listId = await this._createList({ account, date, folderId });
      state.listCreatedAt = new Date().toISOString();
      await this._writeBatchState(date, account.id, state);
    }

    if (!state.contactsSyncedAt) {
      await this._ensureContactAttributes(account);
      for (const lead of leads) await this._upsertContact({ account, listId: state.listId, lead });
      state.contactsSyncedAt = new Date().toISOString();
      await this._writeBatchState(date, account.id, state);
    }

    if (!state.campaignId) {
      state.campaignId = await this._createCampaign({ account, date, listId: state.listId });
      state.campaignCreatedAt = new Date().toISOString();
      await this._writeBatchState(date, account.id, state);
    }

    return state;
  }

  async _dispatchCampaign({ date, account, leads, state, allowWhileGloballyPaused = false }) {
    if (state.sentAt) return { state, alreadySent: true };

    // If a crash happened after accepting sendNow, do not issue the request a
    // second time.  Read provider state instead; drafts remain operator-review
    // items instead of becoming accidental duplicate sends.
    if (state.sendRequestedAt) {
      const remote = await this._remoteCampaignStatus(account, state.campaignId);
      const status = campaignStatus(remote);
      if (ACTIVE_STATUSES.has(status)) {
        state.sentAt = state.sendRequestedAt;
        state.providerStatus = status;
        await this._writeBatchState(date, account.id, state);
        return { state, recoveredAcceptedSend: true };
      }
      return { state, pendingReview: true, providerStatus: status || 'unknown' };
    }

    if (!allowWhileGloballyPaused && await isGloballyPaused()) return { state, paused: true };
    state.sendRequestedAt = new Date().toISOString();
    await this._writeBatchState(date, account.id, state);
    await emailService.brevoRequestForAccount(account.id, `/emailCampaigns/${encodeURIComponent(state.campaignId)}/sendNow`, { method: 'POST' });
    state.sentAt = new Date().toISOString();
    state.providerStatus = 'send_requested';
    await this._writeBatchState(date, account.id, state);
    return { state, sent: true };
  }

  async _recordAcceptedCampaign({ date, account, leads, state }) {
    const sentAt = new Date(state.sentAt || state.sendRequestedAt || Date.now());
    const email = marketingTemplate();
    await prisma.$transaction(async (tx) => {
      const automationKeys = leads.map((lead) => `daily-email:brevo:${date}:${recipientHash(lead.email)}`);
      const existing = await tx.message.findMany({
        where: { automationKey: { in: automationKeys } },
        select: { automationKey: true },
      });
      const existingKeys = new Set(existing.map((message) => message.automationKey));
      let newlyRecorded = 0;
      for (const lead of leads) {
        const normalized = normalEmail(lead.email);
        const automationKey = `daily-email:brevo:${date}:${recipientHash(normalized)}`;
        if (!existingKeys.has(automationKey)) newlyRecorded += 1;
        await tx.message.upsert({
          where: { automationKey },
          create: {
            leadId: lead.id,
            emailAccountId: account.id,
            channel: 'email',
            direction: 'outbound',
            status: 'sent',
            content: email.textBody,
            emailSubject: email.subject,
            emailHtmlBody: email.htmlBody,
            sentAt,
            providerCampaignId: String(state.campaignId),
            providerMessageId: `brevo-campaign:${state.campaignId}:${recipientHash(normalized)}`,
            templateVariant: DAILY_EMAIL_TEMPLATE_VARIANT,
            automationKey,
          },
          update: {
            status: 'sent',
            sentAt,
            emailAccountId: account.id,
            providerCampaignId: String(state.campaignId),
            providerMessageId: `brevo-campaign:${state.campaignId}:${recipientHash(normalized)}`,
            providerStatusReason: null,
          },
        });
        await tx.lead.update({
          where: { id: lead.id },
          data: { emailStatus: 'sent', assignedEmailAccountId: account.id },
        });
      }
      if (newlyRecorded > 0) {
        await tx.emailAccount.update({ where: { id: account.id }, data: { sentToday: { increment: newlyRecorded } } });
      }
    });
    if (!state.localRecordedAt) {
      state.localRecordedAt = new Date().toISOString();
      await this._writeBatchState(date, account.id, state);
    }
  }

  async dispatchDailyBatch({ date, allocations = [], dryRun = false, allowWhileGloballyPaused = false } = {}) {
    await this.ensureDefaults();
    const groups = new Map();
    for (const allocation of allocations) {
      if (!allocation?.lead || !allocation?.account) continue;
      if (!groups.has(allocation.account.id)) groups.set(allocation.account.id, { account: allocation.account, leads: [] });
      groups.get(allocation.account.id).leads.push(allocation.lead);
    }
    const senderIds = [...groups.keys()];
    const readiness = await this.getStatus({ senderIds });
    if (!readiness.enabled) return { handled: true, skipped: true, reason: 'brevo_marketing_campaigns_disabled', readiness };
    if (readiness.globallyPaused && !allowWhileGloballyPaused) {
      return { handled: true, skipped: true, reason: 'sending_paused', readiness };
    }
    if (!readiness.configuredBrevoSenders) return { handled: true, skipped: true, reason: 'two_verified_brevo_senders_required', readiness };
    if (!readiness.folderConfigured) return { handled: true, skipped: true, reason: 'brevo_marketing_folder_required', readiness };
    if (!readiness.webhookConfigured) return { handled: true, skipped: true, reason: 'brevo_webhook_configuration_required', readiness };
    if (allocations.some(({ lead }) => !lead.emailMarketingConsent || lead.emailOptOut)) {
      return { handled: true, skipped: true, reason: 'marketing_consent_required', readiness };
    }
    if (dryRun) {
      return {
        handled: true,
        dryRun: true,
        recipients: allocations.length,
        campaigns: [...groups.values()].map(({ account, leads }) => ({ accountId: account.id, sender: account.email, recipientCount: leads.length })),
        readiness,
      };
    }

    const results = [];
    for (const { account, leads } of groups.values()) {
      const state = await this._ensureCampaign({ date, account, leads, folderId: readiness.folderId });
      const dispatched = await this._dispatchCampaign({
        date,
        account,
        leads,
        state,
        allowWhileGloballyPaused,
      });
      if (dispatched.paused || dispatched.pendingReview) {
        results.push({ accountId: account.id, sender: account.email, ...dispatched });
        continue;
      }
      if (dispatched.state.sentAt) await this._recordAcceptedCampaign({ date, account, leads, state: dispatched.state });
      results.push({
        accountId: account.id,
        sender: account.email,
        campaignId: dispatched.state.campaignId,
        recipientCount: leads.length,
        sent: Boolean(dispatched.sent || dispatched.alreadySent || dispatched.recoveredAcceptedSend),
      });
    }
    const result = { handled: true, date, recipients: allocations.length, campaigns: results };
    await writeConfig(KEYS.lastResult, JSON.stringify({ ...result, finishedAt: new Date().toISOString() }));
    return result;
  }

  async reconcileWebhook(payload = {}) {
    const event = String(payload.event || payload.type || '').toLowerCase();
    const email = normalEmail(payload.email || payload.recipient || payload.to);
    if (!email || !event) return { ignored: true, reason: 'email_or_event_missing' };
    const rows = await prisma.$queryRaw`
      SELECT id FROM Lead WHERE lower(trim(email)) = ${email}
    `;
    const leadIds = rows.map((row) => Number(row.id)).filter(Number.isInteger);
    if (!leadIds.length) return { ignored: true, reason: 'lead_not_found' };

    const status = /(?:delivered)/.test(event) ? 'delivered'
      : /(?:opened|click)/.test(event) ? 'read'
      : /(?:hard_bounce|soft_bounce|invalid|blocked|error)/.test(event) ? 'permanently_failed'
      : null;
    const optOut = /(?:unsubscribed|spam|complaint)/.test(event);
    const messages = await prisma.message.findMany({
      where: {
        leadId: { in: leadIds }, channel: 'email', direction: 'outbound',
        status: { in: ['queued', 'sending', 'sent', 'delivered'] },
      },
      select: { id: true, leadId: true, status: true },
      orderBy: { sentAt: 'desc' },
      take: 20,
    });
    const updates = [];
    for (const message of messages) {
      if (!status) continue;
      if (message.status === 'delivered' && status === 'sent') continue;
      updates.push(prisma.message.update({
        where: { id: message.id },
        data: { status, providerStatusReason: `brevo_webhook:${event}` },
      }));
    }
    if (optOut || status === 'permanently_failed') {
      const emailStatus = optOut ? (event.includes('spam') || event.includes('complaint') ? 'complained' : 'unsubscribed') : 'bounced';
      updates.push(prisma.lead.updateMany({
        where: { id: { in: leadIds } },
        data: { ...(optOut ? { emailOptOut: true } : {}), emailStatus },
      }));
    }
    if (updates.length) await prisma.$transaction(updates);
    logger.info(`Brevo webhook reconciled ${event} for ${leadIds.length} local lead(s)`);
    return { ignored: false, event, leadCount: leadIds.length, messagesUpdated: messages.length, optedOut: optOut };
  }
}

export { BrevoMarketingCampaigns, KEYS as BREVO_MARKETING_KEYS, normalEmail, recipientHash };
export default new BrevoMarketingCampaigns();
