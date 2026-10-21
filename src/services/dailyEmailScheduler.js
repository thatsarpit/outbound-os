import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import { createHash } from 'node:crypto';
import emailService from './emailService.js';
import brevoMarketingCampaigns from './brevoMarketingCampaigns.js';
import { zonedDateKey, isSameZonedDay } from '../utils/workspaceTime.js';
import { batchRecipientIdentity, countryAllowed, normalizeRecipientEmail, prepareBatchTemplate, renderBatchTemplate, validateCountries } from '../utils/emailBatchPolicy.js';

const KEYS = {
  enabled: 'email.daily.enabled', batchSize: 'email.daily.batch_size',
  lastRunDate: 'email.daily.last_run_date', lastQueued: 'email.daily.last_queued_count',
  lastRunAt: 'email.daily.last_run_at', senderIds: 'email.daily.sender_ids',
  perSenderQuota: 'email.daily.per_sender_quota', deliveryMode: 'email.daily.delivery_mode',
  countries: 'email.daily.countries', templateId: 'email.daily.template_id',
};
const BLOCKED_LEAD_STATUSES = ['paused', 'closed', 'replied', 'engaged'];
const BLOCKED_EMAIL_STATUSES = ['bounced', 'complained', 'suppressed', 'unsubscribed'];
const ACTIVE_MESSAGE_STATUSES = ['queued', 'sending', 'sent', 'delivered', 'read'];

function parseList(value) {
  try { const result = JSON.parse(value || '[]'); return Array.isArray(result) ? result : []; }
  catch { return []; }
}

async function getConfigMap() {
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: Object.values(KEYS) } } });
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
}

async function setConfig(key, value) {
  await prisma.systemConfig.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
}

function eligibleWhere() {
  return { AND: [
    { email: { not: null } }, { email: { not: '' } }, { emailOptOut: false }, { emailMarketingConsent: true },
    { status: { notIn: BLOCKED_LEAD_STATUSES } }, { emailStatus: { notIn: BLOCKED_EMAIL_STATUSES } },
    { messages: { none: { direction: 'outbound', channel: 'email', status: { in: ACTIVE_MESSAGE_STATUSES } } } },
  ] };
}

class DailyEmailScheduler {
  constructor() { this.running = false; }

  async ensureDefaults() {
    // Initialization is only used by an explicit launch, never a status read or preview.
    for (const [key, value] of [
      [KEYS.enabled, 'false'], [KEYS.batchSize, '100'], [KEYS.perSenderQuota, '50'],
    ]) await prisma.systemConfig.upsert({ where: { key }, update: {}, create: { key, value } });
    await setConfig(KEYS.deliveryMode, 'brevo_marketing');
  }

  async _policy(config) {
    let countries = [];
    try { countries = validateCountries(parseList(config[KEYS.countries])); } catch { /* Corrupt policy stays blocked. */ }
    const configuredSenders = parseList(config[KEYS.senderIds]);
    const senderIds = configuredSenders.every(id => Number.isSafeInteger(id) && id > 0) ? [...new Set(configuredSenders)] : [];
    const id = Number(config[KEYS.templateId]);
    const template = Number.isSafeInteger(id) && id > 0 ? await prisma.emailTemplate.findUnique({ where: { id } }) : null;
    let preparedTemplate = null;
    let templateError = null;
    if (template) {
      try { preparedTemplate = prepareBatchTemplate(template); } catch (error) { templateError = error.message; }
    }
    return { countries, senderIds, template, preparedTemplate, templateError };
  }

  async _excludedRecipients() {
    const [messages, blocked] = await Promise.all([
      prisma.message.findMany({
        where: { direction: 'outbound', channel: 'email', status: { in: ACTIVE_MESSAGE_STATUSES } },
        select: { lead: { select: { email: true } } },
      }),
      prisma.lead.findMany({ where: { OR: [
        { emailOptOut: true }, { status: { in: BLOCKED_LEAD_STATUSES } }, { emailStatus: { in: BLOCKED_EMAIL_STATUSES } },
      ] }, select: { email: true } }),
    ]);
    return new Set([...messages.map(message => message.lead?.email), ...blocked.map(lead => lead.email)]
      .map(normalizeRecipientEmail).filter(Boolean));
  }

  async selectEligibleLeads(limit = 200, countries = []) {
    if (!countries.length) return { leads: [], count: 0 };
    const seen = await this._excludedRecipients();
    const leads = [];
    let count = 0;
    let cursor;
    // Scan all pages so counts and selection agree even after thousands of duplicates.
    while (true) {
      const page = await prisma.lead.findMany({
        where: eligibleWhere(),
        orderBy: [{ score: 'desc' }, { consumedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const lead of page) {
        const email = normalizeRecipientEmail(lead.email);
        if (!email || seen.has(email) || !countryAllowed(lead.country, countries)) continue;
        seen.add(email);
        count += 1;
        if (leads.length < limit) leads.push(lead);
      }
      if (page.length < 500) break;
      cursor = page.at(-1).id;
    }
    return { leads, count };
  }

  async validateRecipients(leads, countries) {
    const [current, excluded] = await Promise.all([
      prisma.lead.findMany({ where: { AND: [eligibleWhere(), { id: { in: leads.map(lead => lead.id) } }] } }),
      this._excludedRecipients(),
    ]);
    const byId = new Map(current.map(lead => [lead.id, lead]));
    return leads.every(original => {
      const lead = byId.get(original.id);
      const email = normalizeRecipientEmail(lead?.email);
      return lead && email && email === normalizeRecipientEmail(original.email)
        && JSON.stringify(batchRecipientIdentity(lead)) === JSON.stringify(batchRecipientIdentity(original))
        && !excluded.has(email) && countryAllowed(lead.country, countries);
    });
  }

  async getStatus() {
    const config = await getConfigMap();
    const policy = await this._policy(config);
    const [accounts, selection, consentedCount, blockedNoConsentCount, marketing, templates] = await Promise.all([
      prisma.emailAccount.findMany({
        select: { id: true, email: true, provider: true, enabled: true, status: true, lastError: true, dailyLimit: true, sentToday: true, lastResetAt: true },
        orderBy: { id: 'asc' },
      }),
      this.selectEligibleLeads(0, policy.countries),
      prisma.lead.count({ where: { emailMarketingConsent: true, emailOptOut: false } }),
      prisma.lead.count({ where: { email: { not: null }, emailOptOut: false, emailMarketingConsent: false } }),
      brevoMarketingCampaigns.getStatus({ senderIds: policy.senderIds }).catch(error => ({ enabled: false, ready: false, error: error.message })),
      prisma.emailTemplate.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return {
      enabled: config[KEYS.enabled] === 'true', batchSize: Number(config[KEYS.batchSize] || 100),
      senderIds: policy.senderIds, perSenderQuota: Number(config[KEYS.perSenderQuota] || 50),
      countries: policy.countries, templateId: policy.template?.id || null, templates,
      templateName: policy.template?.name || null, templateError: policy.templateError,
      policyReady: Boolean(policy.countries.length && policy.preparedTemplate && policy.senderIds.length),
      deliveryMode: 'brevo_marketing', marketing,
      lastRunDate: config[KEYS.lastRunDate] || null, lastRunAt: config[KEYS.lastRunAt] || null,
      lastQueued: Number(config[KEYS.lastQueued] || 0), eligibleCount: selection.count, consentedCount, blockedNoConsentCount,
      accounts: accounts.map(account => ({ ...account, sentToday: isSameZonedDay(account.lastResetAt || new Date(0)) ? account.sentToday : 0 })),
      canLaunchToday: config[KEYS.lastRunDate] !== zonedDateKey(),
      launchMode: 'manual', schedule: 'Manual launch only. Restarts and recovery never select a marketing batch.',
    };
  }

  async run({ force = false, dryRun = false, limit = null, trigger = null, expectedPreviewHash = null } = {}) {
    const skip = (reason, extra = {}) => ({ skipped: true, reason, ...(dryRun ? { dryRun: true, count: 0, items: [] } : {}), ...extra });
    if (!dryRun && trigger !== 'manual') return skip('explicit_launch_required');
    if (!dryRun && !expectedPreviewHash) return skip('reviewed_preview_required');
    if (this.running) return skip('already_running');
    this.running = true;
    try {
      const config = await getConfigMap();
      const today = zonedDateKey();
      if (config[KEYS.enabled] !== 'true' && !dryRun) return skip('disabled');
      if (config[KEYS.lastRunDate] === today && !force && !dryRun) return skip('already_ran_today', { date: today });
      const { countries, senderIds, template, preparedTemplate, templateError } = await this._policy(config);
      if (!countries.length) return skip('audience_countries_required');
      if (!preparedTemplate) return skip('saved_template_required', { error: templateError });
      if (!senderIds.length) return skip('campaign_senders_required');
      const accountRows = await prisma.emailAccount.findMany({ where: { id: { in: senderIds } } });
      const byId = new Map(accountRows.map(account => [account.id, account]));
      let accounts = senderIds.map(id => byId.get(id));
      if (accounts.some(account => !account || !account.enabled || account.provider !== 'brevo' || account.status !== 'verified')) return skip('verified_brevo_senders_required');
      // Preview computes fresh counters in memory; it cannot reset persisted account rows.
      accounts = accounts.map(account => ({ ...account, sentToday: isSameZonedDay(account.lastResetAt || new Date(0)) ? account.sentToday : 0 }));
      const batchSize = Number(limit ?? config[KEYS.batchSize] ?? 100);
      const perSenderQuota = Number(config[KEYS.perSenderQuota] || 50);
      if (!Number.isInteger(perSenderQuota) || perSenderQuota < 1 || perSenderQuota > 150) return skip('invalid_sender_quota');
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 200) return skip('invalid_batch_size');
      const remaining = Object.fromEntries(accounts.map(account => [account.id, Math.max(0, Math.min(perSenderQuota, account.dailyLimit - account.sentToday))]));
      const capacity = await emailService.getBrevoDailyCapacity({ readOnly: true });
      const groupRemaining = new Map([...capacity.values()].map(item => [item.group, item.remaining]));
      const selection = await this.selectEligibleLeads(Math.min(batchSize, Object.values(remaining).reduce((a, b) => a + b, 0)), countries);
      const allocations = [];
      let cursor = 0;
      for (const lead of selection.leads) {
        for (let attempt = 0; attempt < accounts.length; attempt += 1) {
          const index = (cursor + attempt) % accounts.length;
          const account = accounts[index];
          const group = capacity.get(account.id);
          if (!remaining[account.id] || !group || groupRemaining.get(group.group) <= 0) continue;
          allocations.push({ lead, account });
          remaining[account.id] -= 1;
          for (const [key, available] of groupRemaining) {
            if (group.group === 'unverified' || key === group.group || key === 'unverified') groupRemaining.set(key, available - 1);
          }
          cursor = (index + 1) % accounts.length;
          break;
        }
      }
      const previewHash = createHash('sha256').update(JSON.stringify({
        date: today, countries, templateHash: preparedTemplate.hash, senderIds, batchSize, perSenderQuota,
        senders: accounts.map(account => [account.id, account.email, account.senderName, account.dailyLimit]),
        recipients: allocations.map(({ lead, account }) => [batchRecipientIdentity(lead), account.id]),
      })).digest('hex');
      if (!dryRun && expectedPreviewHash !== previewHash) return skip('preview_changed');
      if (!allocations.length) return skip('no_eligible_recipients');
      const input = {
        date: today, allocations, template, countries, dryRun,
        validateRecipients: async leads => {
          const latest = await getConfigMap();
          const current = await this._policy(latest);
          if (latest[KEYS.enabled] !== 'true'
            || Number(latest[KEYS.batchSize] || 100) !== Number(config[KEYS.batchSize] || 100)
            || Number(latest[KEYS.perSenderQuota] || 50) !== perSenderQuota
            || JSON.stringify(current.senderIds) !== JSON.stringify(senderIds)
            || JSON.stringify(current.countries) !== JSON.stringify(countries)) return false;
          return current.preparedTemplate?.hash === preparedTemplate.hash && this.validateRecipients(leads, countries);
        },
      };
      if (!dryRun) {
        await this.ensureDefaults();
        await Promise.all(accounts.map(account => emailService._resetAccountCounterIfNeeded(byId.get(account.id))));
      }
      const marketing = await brevoMarketingCampaigns.dispatchDailyBatch(input);
      if (marketing.skipped) return skip(marketing.reason, { marketing });
      if (dryRun) return {
        dryRun: true, date: today, count: allocations.length, eligibleCount: selection.count, previewHash,
        countries, template: { id: template.id, name: template.name, hash: preparedTemplate.hash },
        sample: renderBatchTemplate(template, allocations[0].lead),
        items: allocations.map(({ lead, account }) => ({ leadId: lead.id, email: lead.email, country: lead.country, accountId: account.id, sender: account.email })),
        deliveryMode: 'brevo_marketing', marketing,
      };
      const accepted = (marketing.campaigns || []).filter(campaign => campaign.sent);
      const perAccount = Object.fromEntries(accepted.map(campaign => [campaign.accountId, campaign.recipientCount]));
      const queued = accepted.reduce((sum, campaign) => sum + Number(campaign.recipientCount || 0), 0);
      if (queued) await Promise.all([
        setConfig(KEYS.lastRunDate, today), setConfig(KEYS.lastRunAt, new Date().toISOString()), setConfig(KEYS.lastQueued, queued),
      ]);
      logger.info(`Email batch manually launched: ${queued} provider-accepted recipients`);
      return { date: today, queued, perAccount, deliveryMode: 'brevo_marketing', marketing };
    } finally { this.running = false; }
  }
}

export default new DailyEmailScheduler();
