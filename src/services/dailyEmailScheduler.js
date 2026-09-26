import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import { createHash } from 'crypto';
import emailService from './emailService.js';
import brevoMarketingCampaigns from './brevoMarketingCampaigns.js';
import { getOptimalSendTime } from '../utils/timezone.js';
import { workspaceTimezone, zonedDateKey } from '../utils/workspaceTime.js';
import {
  buildWhatsAppCtaEmail,
  DAILY_EMAIL_TEMPLATE_NAME,
  DAILY_EMAIL_TEMPLATE_VARIANT,
} from '../templates/emailWhatsappCta.js';

const KEYS = {
  enabled: 'email.daily.enabled',
  batchSize: 'email.daily.batch_size',
  lastRunDate: 'email.daily.last_run_date',
  lastQueued: 'email.daily.last_queued_count',
  lastRunAt: 'email.daily.last_run_at',
  senderIds: 'email.daily.sender_ids',
  perSenderQuota: 'email.daily.per_sender_quota',
  deliveryMode: 'email.daily.delivery_mode',
};
const BLOCKED_LEAD_STATUSES = ['paused', 'closed', 'replied', 'engaged'];
const BLOCKED_EMAIL_STATUSES = ['bounced', 'complained', 'suppressed', 'unsubscribed'];
const ACTIVE_MESSAGE_STATUSES = ['queued', 'sending', 'sent', 'delivered', 'read'];

// One batch per calendar day in the workspace's zone.
function workspaceDateKey(date = new Date()) {
  return zonedDateKey(date);
}

function normalizeRecipientEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return '';
  if (/@test\.com$/i.test(email)) return '';
  return email;
}

function recipientHash(email) {
  return createHash('sha256').update(email).digest('hex').slice(0, 24);
}

async function getConfigMap() {
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: Object.values(KEYS) } } });
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

async function setConfig(key, value) {
  await prisma.systemConfig.upsert({
    where: { key }, update: { value: String(value) }, create: { key, value: String(value) },
  });
}

function eligibleWhere() {
  return {
    AND: [
      { email: { not: null } }, { email: { not: '' } }, { emailOptOut: false },
      { emailMarketingConsent: true },
      { status: { notIn: BLOCKED_LEAD_STATUSES } },
      { emailStatus: { notIn: BLOCKED_EMAIL_STATUSES } },
      { messages: { none: { direction: 'outbound', channel: 'email', status: { in: ACTIVE_MESSAGE_STATUSES } } } },
    ],
  };
}

class DailyEmailScheduler {
  constructor() { this.running = false; }

  async ensureDefaults() {
    for (const [key, value] of [
      // Off until an admin turns it on: a new install must never start a
      // daily marketing send by itself.
      [KEYS.enabled, 'false'], [KEYS.batchSize, '100'], [KEYS.perSenderQuota, '50'],
      // Daily promotional email is always modeled as a marketing campaign.
      // A deliberate launch gate in brevoMarketingCampaigns keeps it dormant
      // until operators verify senders, consent, provider IP, and the pause.
      [KEYS.deliveryMode, 'brevo_marketing'],
    ]) {
      await prisma.systemConfig.upsert({ where: { key }, update: {}, create: { key, value } });
    }
    // The prior implementation used a transactional fallback when this
    // setting drifted. Daily prospecting must never leave the Brevo Marketing
    // Campaigns path, so repair an old value before any scheduler work starts.
    const deliveryMode = await prisma.systemConfig.findUnique({ where: { key: KEYS.deliveryMode } });
    if (deliveryMode?.value !== 'brevo_marketing') {
      await setConfig(KEYS.deliveryMode, 'brevo_marketing');
    }
    const senderConfig = await prisma.systemConfig.findUnique({ where: { key: KEYS.senderIds } });
    if (!senderConfig) {
      const senders = await prisma.emailAccount.findMany({
        where: { enabled: true, provider: 'brevo' }, select: { id: true }, orderBy: { id: 'asc' },
      });
      await setConfig(KEYS.senderIds, JSON.stringify(senders.map((sender) => sender.id)));
    }
    const sample = buildWhatsAppCtaEmail({ name: '{{name}}', product: '{{product}}', country: '{{country}}' });
    const existing = await prisma.emailTemplate.findFirst({ where: { name: DAILY_EMAIL_TEMPLATE_NAME } });
    const data = {
      subject: sample.subject, htmlBody: sample.htmlBody, textBody: sample.textBody,
      variables: JSON.stringify(['name', 'product', 'country']), category: 'outreach',
    };
    if (existing) await prisma.emailTemplate.update({ where: { id: existing.id }, data });
    else await prisma.emailTemplate.create({ data: { name: DAILY_EMAIL_TEMPLATE_NAME, ...data } });
  }

  async getEligibleLeads(limit = 100) {
    const desired = Math.max(0, Math.min(Number(limit) || 100, 200));
    const [candidates, priorMessages] = await Promise.all([
      prisma.lead.findMany({
        where: eligibleWhere(),
        orderBy: [{ score: 'desc' }, { consumedAt: 'desc' }, { createdAt: 'desc' }],
        take: 3000,
      }),
      prisma.message.findMany({
        where: {
          direction: 'outbound', channel: 'email',
          templateVariant: DAILY_EMAIL_TEMPLATE_VARIANT,
          status: { in: ACTIVE_MESSAGE_STATUSES },
        },
        include: { lead: { select: { email: true } } },
      }),
    ]);
    const seen = new Set(priorMessages.map((message) => normalizeRecipientEmail(message.lead?.email)).filter(Boolean));
    const selected = [];
    for (const lead of candidates) {
      const email = normalizeRecipientEmail(lead.email);
      if (!email || seen.has(email)) continue;
      seen.add(email);
      selected.push(lead);
      if (selected.length >= desired) break;
    }
    return selected;
  }

  async getStatus() {
    await this.ensureDefaults();
    const [config, accounts, eligibleCount, consentedCount, blockedNoConsentCount] = await Promise.all([
      getConfigMap(),
      prisma.emailAccount.findMany({
        where: { enabled: true },
        select: { id: true, email: true, provider: true, status: true, lastError: true, dailyLimit: true, sentToday: true }, orderBy: { id: 'asc' },
      }),
      prisma.lead.count({ where: eligibleWhere() }),
      prisma.lead.count({ where: { emailMarketingConsent: true, emailOptOut: false } }),
      prisma.lead.count({
        where: {
          email: { not: null }, emailOptOut: false, emailMarketingConsent: false,
        },
      }),
    ]);
    const senderIds = (() => { try { return JSON.parse(config[KEYS.senderIds] || '[]'); } catch { return []; } })();
    const marketing = await brevoMarketingCampaigns.getStatus({ senderIds }).catch((error) => ({
      enabled: false, ready: false, error: error.message,
    }));
    return {
      enabled: config[KEYS.enabled] !== 'false',
      batchSize: Number(config[KEYS.batchSize] || 100),
      senderIds,
      perSenderQuota: Number(config[KEYS.perSenderQuota] || 50),
      deliveryMode: config[KEYS.deliveryMode] || 'brevo_marketing',
      marketing,
      lastRunDate: config[KEYS.lastRunDate] || null,
      lastRunAt: config[KEYS.lastRunAt] || null,
      lastQueued: Number(config[KEYS.lastQueued] || 0),
      eligibleCount,
      consentedCount,
      blockedNoConsentCount,
      accounts,
      schedule: `06:05 ${workspaceTimezone()} with startup catch-up`,
    };
  }

  async run({ force = false, dryRun = false, limit = null, allowWhileGloballyPaused = false } = {}) {
    if (this.running) return { skipped: true, reason: 'already_running' };
    this.running = true;
    try {
      await this.ensureDefaults();
      const config = await getConfigMap();
      const today = workspaceDateKey();
      if (config[KEYS.enabled] === 'false' && !force) return { skipped: true, reason: 'disabled' };
      if (config[KEYS.lastRunDate] === today && !force) return { skipped: true, reason: 'already_ran_today', date: today };

      const batchSize = Math.max(1, Math.min(Number(limit || config[KEYS.batchSize] || 100), 200));
      let senderIds = [];
      try { senderIds = JSON.parse(config[KEYS.senderIds] || '[]').map(Number).filter(Number.isInteger); } catch {}
      senderIds = [...new Set(senderIds)];
      // One sender works; more spread the daily volume across domains, which
      // protects each domain's reputation.
      if (senderIds.length === 0) {
        return { skipped: true, reason: 'campaign_senders_required', accountCount: 0 };
      }
      const accountRows = await prisma.emailAccount.findMany({ where: { id: { in: senderIds } } });
      const accountById = new Map(accountRows.map((account) => [account.id, account]));
      let accounts = senderIds.map((id) => accountById.get(id)).filter(Boolean);
      accounts = await Promise.all(accounts.map((account) => emailService._resetAccountCounterIfNeeded(account)));
      const readyAccounts = accounts.filter((account) => account.enabled && account.status === 'verified');
      if (readyAccounts.length === 0) {
        return { skipped: true, reason: 'verified_senders_required', accountCount: 0 };
      }

      const perSenderQuota = Math.max(1, Math.min(Number(config[KEYS.perSenderQuota] || 50), 150));
      const remaining = Object.fromEntries(readyAccounts.map((account) => [
        account.id,
        Math.max(0, Math.min(perSenderQuota, account.dailyLimit - account.sentToday)),
      ]));
      const targetCount = Math.min(batchSize, Object.values(remaining).reduce((sum, value) => sum + value, 0));
      const leads = await this.getEligibleLeads(targetCount);
      const allocations = [];
      let senderCursor = 0;
      for (const lead of leads) {
        let selected = null;
        for (let attempt = 0; attempt < readyAccounts.length; attempt += 1) {
          const index = (senderCursor + attempt) % readyAccounts.length;
          const candidate = readyAccounts[index];
          if (remaining[candidate.id] > 0) {
            selected = candidate;
            remaining[candidate.id] -= 1;
            senderCursor = (index + 1) % readyAccounts.length;
            break;
          }
        }
        if (!selected) break;
        allocations.push({ lead, account: selected });
      }
      const preview = allocations.map(({ lead, account }) => ({
        leadId: lead.id, email: lead.email,
        accountId: account.id,
        sender: account.email,
        scheduledAt: getOptimalSendTime(lead.country),
      }));
      if (dryRun) {
        const deliveryMode = config[KEYS.deliveryMode] || 'brevo_marketing';
        const marketing = deliveryMode === 'brevo_marketing'
          ? await brevoMarketingCampaigns.dispatchDailyBatch({
              date: today,
              allocations,
              dryRun: true,
              allowWhileGloballyPaused,
            })
          : null;
        return { dryRun: true, date: today, count: preview.length, items: preview, deliveryMode, marketing };
      }

      const deliveryMode = config[KEYS.deliveryMode] || 'brevo_marketing';
      if (deliveryMode !== 'brevo_marketing') {
        // Defensive dead-end. ensureDefaults repairs persisted drift, but do
        // not allow a scheduler run to silently choose transactional delivery
        // if an operator changes the database between calls.
        return { skipped: true, reason: 'marketing_campaign_delivery_required', date: today, deliveryMode };
      }
      const marketing = await brevoMarketingCampaigns.dispatchDailyBatch({
        date: today,
        allocations,
        allowWhileGloballyPaused,
      });
      if (marketing.skipped) return { skipped: true, reason: marketing.reason, date: today, marketing };
      const queued = Number(marketing.recipients || 0);
      const perAccount = Object.fromEntries(
        (marketing.campaigns || []).map((campaign) => [campaign.accountId, Number(campaign.recipientCount || 0)]),
      );
      await Promise.all([
        setConfig(KEYS.lastRunDate, today), setConfig(KEYS.lastRunAt, new Date().toISOString()), setConfig(KEYS.lastQueued, queued),
      ]);
      logger.info(`📬 Daily Brevo marketing batch accepted for ${queued} consented lead(s): ${JSON.stringify(perAccount)}`);
      return { date: today, queued, perAccount, deliveryMode, marketing };
    } finally {
      this.running = false;
    }
  }
}

export default new DailyEmailScheduler();
