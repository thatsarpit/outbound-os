import { campaignFilter } from '../utils/campaignFilter.js';
import { suppressedWhatsAppLeads } from './whatsappSuppression.js';
import { contactBudgetGate } from './contactBudget.js';
import { CAPACITY_REASONS } from '../utils/whatsappCapacity.js';
import { refreshCampaignMetrics, readCampaignMetrics } from './campaignMetrics.js';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import whatsappManager from './whatsapp.js';
import { credentialState } from './whatsappProviders.js';
import emailService from './emailService.js';
import emailVerification from './emailVerification.js';
import { emailIdentity } from '../utils/emailVerification.js';
import imessageService from './imessage.js';
import { randomDelay, isBusinessHours } from '../utils/delay.js';
import { whatsappAddress } from '../utils/whatsappAddress.js';
import { whatsappSession } from '../utils/whatsappSession.js';
import { reconcileMetaReceipts } from './whatsappDelivery.js';
import {
  campaignChannels, campaignChannelEligibility, campaignSenderId, hasAllLeadTags,
} from '../utils/campaignAudience.js';

function firstNameOf(name) {
  const value = String(name || '').trim();
  return !value || /^user$/i.test(value) ? 'there' : value.split(/\s+/)[0];
}
function countryOf(country) { return String(country || '').trim() || 'your country'; }
const ACCEPTED = new Set(['sent', 'delivered', 'read']);
const UNCERTAIN = new Set(['timeout', 'exception', 'no_message_id', 'confirmation_unknown']);

/**
 * Early-failure canary. A bad template, a restricted sender or a provider
 * outage shows up in the first sends; without a tripwire the executor keeps
 * walking the audience, converting one mistake into hundreds of failures and
 * a damaged sender rating. Counters are per run, so an operator's resume is
 * itself the reset — the next run starts a fresh sample instead of tripping
 * instantly on the failures it was paused for.
 */
export const CANARY_MIN_ATTEMPTS = 20;
export const CANARY_FAILURE_RATE = 0.25;

/** Campaign dispatch has injectable dependencies so its safety rules need no provider calls to test. */
export class CampaignEngine {
  constructor({ db = prisma, whatsapp = whatsappManager, email = emailService,
    imessage = imessageService, delay = randomDelay, businessHours = isBusinessHours,
    reconcileReceipts = reconcileMetaReceipts, verification = emailVerification,
    budgetGate = contactBudgetGate } = {}) {
    Object.assign(this, { db, whatsapp, email, imessage, delay, businessHours, reconcileReceipts, verification, budgetGate });
  }

  async createCampaign({ name, description, messageTemplate, targetFilter, channel = 'whatsapp',
    emailSubject, senderAccountId, emailSenderAccountId = null, whatsappSenderAccountId = null,
    waCampaignName = null, variantBTemplate = null, variantBSubject = null, poolId = null }) {
    campaignChannels(channel);
    const campaign = await this.db.campaign.create({
      data: {
        name, description: description || null, poolId: poolId ? Number(poolId) : null,
        channel, messageTemplate, emailSubject: emailSubject || null,
        senderAccountId: senderAccountId || null,
        emailSenderAccountId, whatsappSenderAccountId,
        waCampaignName: String(waCampaignName || '').trim() || null,
        targetFilter: targetFilter ? (typeof targetFilter === 'string' ? targetFilter : JSON.stringify(targetFilter)) : null,
        status: 'draft', variantBTemplate, variantBSubject,
      },
    });
    logger.info(`Campaign created (ID: ${Number(campaign.id)})`);
    return campaign;
  }

  async getAudience(filterJson, poolId = null, channel = 'whatsapp', whatsappSenderId = null) {
    const filter = campaignFilter(filterJson);
    if (filter.poolId !== undefined) throw Object.assign(new Error('Pass poolId at the top level, outside the lead filter.'), { statusCode: 400 });
    const channels = campaignChannels(channel);
    const where = {};
    if (poolId) where.poolId = poolId;
    if (filter.status) where.status = { in: Array.isArray(filter.status) ? filter.status : [filter.status] };
    if (filter.minScore !== undefined) where.score = { ...where.score, gte: filter.minScore };
    if (filter.maxScore !== undefined) where.score = { ...where.score, lte: filter.maxScore };
    if (filter.source) where.source = filter.source;
    if (filter.olderThanDays) {
      where.createdAt = { lte: new Date(Date.now() - Number(filter.olderThanDays) * 86_400_000) };
    }
    if (filter.product) where.product = { contains: filter.product };
    if (filter.country) where.country = { contains: filter.country };
    const leads = await this.db.lead.findMany({ where, orderBy: [{ score: 'desc' }, { id: 'asc' }] });
    // A DB substring predicate is not a tag match: "uk" must not select "bulk".
    const matching = leads.filter(lead => hasAllLeadTags(lead.tags, filter.tags));
    const ready = channels.includes('email') ? await this.verification.readyEmails(matching.map(lead => lead.email)) : null;
    const suppressed = new Set();
    if (channels.includes('whatsapp')) {
      const groups = new Map();
      for (const lead of matching) {
        const senderId = whatsappSenderId || lead.assignedAccount;
        // Unassigned leads get a sender at dispatch. Do not treat another
        // business's refusal as global while that sender is still unknown.
        if (!senderId) continue;
        if (!groups.has(senderId)) groups.set(senderId, []);
        groups.get(senderId).push(lead.id);
      }
      for (const [senderId, ids] of groups) {
        for (const id of await suppressedWhatsAppLeads(this.db, ids, senderId)) suppressed.add(id);
      }
    }
    const eligible = [], excludedSample = [], exclusionCounts = {};
    let excludedCount = 0;
    for (const lead of matching) {
      const decisions = channels.map(item => {
        const decision = item === 'whatsapp' && suppressed.has(lead.id)
          ? { eligible: false, reason: 'whatsapp_marketing_opted_out' } : campaignChannelEligibility(lead, item);
        if (decision.eligible && item === 'email' && ready && !ready.has(emailIdentity(lead.email))) {
          return { channel: item, eligible: false, reason: 'email_verification_required' };
        }
        return { channel: item, ...decision };
      });
      if (decisions.some(decision => decision.eligible)) eligible.push(lead);
      else {
        excludedCount++;
        const reasons = decisions.map(({ channel: item, reason }) => ({ channel: item, reason }));
        for (const reason of reasons) {
          const key = `${reason.channel}:${reason.reason}`;
          exclusionCounts[key] = (exclusionCounts[key] || 0) + 1;
        }
        if (excludedSample.length < 10) excludedSample.push({ id: lead.id, reasons });
      }
    }
    return { leads: filter.limit ? eligible.slice(0, filter.limit) : eligible, matchedCount: matching.length, excludedCount, exclusionCounts, excludedSample,
      ...(filter.limit ? { limitExcludedCount: Math.max(0, eligible.length - filter.limit) } : {}) };
  }

  async getMatchingLeads(filterJson, poolId = null, channel = 'whatsapp') {
    return (await this.getAudience(filterJson, poolId, channel)).leads;
  }

  async populateCampaign(campaignId) {
    const campaign = await this.db.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status !== 'draft') throw new Error('Only draft campaigns can change their audience');
    const { leads, excludedCount, exclusionCounts } = await this.getAudience(campaign.targetFilter, campaign.poolId, campaign.channel, campaignSenderId(campaign, 'whatsapp'));
    return this.db.$transaction(async tx => {
      // Acquire the draft write before inserting recipients so scheduling
      // cannot approve a partial audience or race a stale population request.
      const draft = await tx.campaign.updateMany({
        where: { id: campaignId, status: 'draft', updatedAt: campaign.updatedAt },
        data: { updatedAt: new Date() },
      });
      if (!draft.count) throw Object.assign(new Error('Campaign changed. Preview the audience again.'), { statusCode: 409 });
      // Recheck status and capacity under the same lock as insertion. Repeated
      // population may not grow a capped campaign when eligibility changes.
      const current = await tx.campaign.findUnique({ where: { id: campaignId } });
      if (current?.status !== 'draft') throw new Error('Only draft campaigns can change their audience');
      if (['targetFilter', 'poolId', 'channel', 'whatsappSenderAccountId', 'senderAccountId'].some(key => current[key] !== campaign[key])) {
        throw Object.assign(new Error('Campaign audience settings changed. Preview and populate again.'), { statusCode: 409 });
      }
      const filter = campaignFilter(current.targetFilter);
      let added = 0;
      const existing = await tx.campaignLead.findMany({ where: { campaignId }, select: { leadId: true } });
      const existingIds = new Set(existing.map(row => row.leadId));
      for (const lead of leads) {
        if (existingIds.has(lead.id)) continue;
        if (filter.limit && existing.length + added >= filter.limit) break;
        await tx.campaignLead.create({ data: { campaignId, leadId: lead.id, status: 'pending' } });
        added++;
      }
      const total = await tx.campaignLead.count({ where: { campaignId } });
      await tx.campaign.update({ where: { id: campaignId }, data: { totalLeads: total } });
      return { added, total, excludedCount, exclusionCounts };
    });
  }

  personalizeMessage(template, lead) {
    return String(template || '')
      .replace(/\{\{name\}\}/gi, () => lead.name || 'there')
      .replace(/\{\{product\}\}/gi, () => lead.product || 'your product requirements')
      .replace(/\{\{company\}\}/gi, () => lead.company || 'your company')
      .replace(/\{\{country\}\}/gi, () => lead.country || '')
      .replace(/\{\{quantity\}\}/gi, () => lead.quantity || '').trim();
  }

  async startCampaign(campaignId, { expectedSchedule } = {}) {
    const campaign = await this.db.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');
    if (!['draft', 'paused', 'scheduled'].includes(campaign.status)) throw new Error('Campaign is not startable');
    if (campaign.status === 'scheduled' && (!expectedSchedule || !campaign.scheduledAt || campaign.scheduledAt > new Date())) {
      throw Object.assign(new Error('Cancel the schedule before starting manually.'), { statusCode: 409 });
    }
    if (!this.businessHours()) throw Object.assign(new Error('Outside configured sending hours. Resume during the sending window.'), { statusCode: 409, reason: 'outside_business_hours' });
    const filter = campaignFilter(campaign.targetFilter);
    if (filter.limit && await this.db.campaignLead.count({ where: { campaignId } }) > filter.limit) {
      throw Object.assign(new Error('Populated audience exceeds the campaign limit. Create a correctly capped draft before sending.'), { statusCode: 409, reason: 'audience_limit_exceeded' });
    }
    const pending = await this.db.campaignLead.count({ where: { campaignId, status: 'pending' } });
    if (!pending) throw Object.assign(new Error('There are no pending recipients to send.'), { statusCode: 409 });
    const updated = await this.db.campaign.updateMany({
      where: { id: campaignId, status: campaign.status, updatedAt: campaign.updatedAt,
        ...(expectedSchedule ? { status: 'scheduled', scheduledAt: expectedSchedule.scheduledAt, updatedAt: expectedSchedule.updatedAt } : {}) },
      data: { status: 'running', startedAt: new Date(), completedAt: null, scheduleError: null },
    });
    if (!updated.count) throw new Error('Campaign already running or changed');
    this._executeCampaign(campaign).catch((error) => logger.error(`Campaign ${campaignId}: ${error.message}`));
    return { status: 'running', pending };
  }

  /** Re-read after any previous recipient/channel's delay, and again after staging a message. */
  async _dispatchContext(campaign, leadId, channel) {
    const current = await this.db.campaign.findUnique({ where: { id: campaign.id } });
    if (!current || current.status !== 'running') return { halt: true, reason: 'campaign_not_running' };
    if (!this.businessHours()) return { halt: true, reason: 'outside_business_hours' };
    const lead = await this.db.lead.findUnique({ where: { id: leadId } });
    if (campaign.poolId && lead?.poolId !== campaign.poolId) return { reason: 'lead_left_campaign_pool' };
    const eligibility = campaignChannelEligibility(lead, channel);
    if (eligibility.eligible && channel === 'whatsapp' && (await suppressedWhatsAppLeads(this.db, [lead.id], campaignSenderId(campaign, channel) || lead.assignedAccount || null)).has(lead.id)) {
      return { reason: 'whatsapp_marketing_opted_out' };
    }
    if (eligibility.eligible && channel === 'email') {
      const ready = await this.verification.readyEmails([lead.email]);
      if (ready && !ready.has(emailIdentity(lead.email))) return { reason: 'email_verification_required' };
    }
    // A lead automation already touched recently is not campaign inventory.
    // The campaign's own rows are excluded so a multi-channel campaign cannot
    // block its second channel with its first.
    if (eligibility.eligible) {
      const budget = await this.budgetGate(lead, { excludeCampaignId: campaign.id, db: this.db });
      if (!budget.allowed) return { reason: budget.reason };
    }
    return eligibility.eligible ? { lead } : { reason: eligibility.reason };
  }

  async _executeCampaign(campaign) {
    const channels = campaignChannels(campaign.channel);
    const pending = await this.db.campaignLead.findMany({
      where: { campaignId: campaign.id, status: 'pending' }, orderBy: { id: 'asc' },
    });
    let billingBlocked = false, capacityBlocked = false;
    let runAccepted = 0, runFailed = 0, canaryTripped = false;
    try {
      for (const recipient of pending) {
        const claim = await this.db.campaignLead.updateMany({
          where: { id: recipient.id, status: 'pending' }, data: { status: 'sending', skipReason: null },
        });
        if (!claim.count) continue;
        let accepted = 0, failed = 0, halted = false;
        const reasons = [];
        try {
          let variant = recipient.variant || 'A';
          if (variant === 'A' && campaign.variantBTemplate && recipient.id % 2 !== 0) {
            variant = 'B';
            await this.db.campaignLead.update({ where: { id: recipient.id }, data: { variant } });
          }
          const body = variant === 'B' && campaign.variantBTemplate ? campaign.variantBTemplate : campaign.messageTemplate;
          const subject = variant === 'B' && campaign.variantBSubject ? campaign.variantBSubject : campaign.emailSubject;
          for (const channel of channels) {
            // A previous accepted/uncertain attempt must never become another send on resume.
            const existing = await this.db.message.findFirst({
              where: { campaignId: campaign.id, leadId: recipient.leadId, channel, direction: 'outbound', status: { not: 'cancelled' } },
              orderBy: { id: 'desc' },
            });
            if (existing) {
              if (ACCEPTED.has(existing.status)) {
                accepted++;
                await this.db.campaignLead.updateMany({ where: { id: recipient.id, status: 'sending' },
                  data: { status: 'sent', sentAt: existing.sentAt || existing.createdAt } });
              }
              else { failed++; reasons.push(`${channel}:${existing.providerStatusReason || existing.status}`); }
              continue;
            }
            const context = await this._dispatchContext(campaign, recipient.leadId, channel);
            if (context.halt) { halted = true; break; }
            if (!context.lead) { reasons.push(`${channel}:${context.reason}`); continue; }
            const result = await this._sendChannel(campaign, context.lead, channel, body, subject);
            if (result.halt) {
              if (CAPACITY_REASONS.includes(result.reason) || result.reason === 'no_whatsapp_sender') capacityBlocked = true;
              halted = true; break;
            }
            if (result.success) {
              accepted++;
              // Publish acceptance before the delay so an immediate reply can
              // claim attribution while the executor is still working.
              await this.db.campaignLead.updateMany({ where: { id: recipient.id, status: 'sending' },
                data: { status: 'sent', sentAt: new Date() } });
            }
            else if (!result.skipped) failed++;
            if (result.reason) reasons.push(`${channel}:${result.reason}`);
            await refreshCampaignMetrics(this.db, campaign.id);
            if (result.reason === 'payment_issue') {
              billingBlocked = true;
              break;
            }
            if (result.attempted) await this.delay(channel === 'imessage' ? 8000 : 1000, channel === 'imessage' ? 20000 : 3000);
          }
          if (halted) {
            await this.db.campaignLead.updateMany({ where: { id: recipient.id, status: { not: 'replied' } }, data: { status: 'pending' } });
            break;
          }
          await this.db.campaignLead.updateMany({
            where: { id: recipient.id, status: { not: 'replied' } },
            data: {
              status: failed ? 'failed' : accepted ? 'sent' : 'skipped',
              ...(!accepted ? { sentAt: null } : {}),
              skipReason: reasons.length ? reasons.join('; ').slice(0, 500) : null,
            },
          });
          runAccepted += accepted;
          runFailed += failed;
          const attempts = runAccepted + runFailed;
          if (attempts >= CANARY_MIN_ATTEMPTS && runFailed / attempts >= CANARY_FAILURE_RATE) {
            canaryTripped = true;
            logger.warn(`Campaign ${campaign.id} paused by failure canary: ${runFailed} of ${attempts} sends failed this run`);
            break;
          }
        } catch (error) {
          // A failed local write after an accepted request cannot release a recipient for an automatic retry.
          await this.db.campaignLead.updateMany({ where: { id: recipient.id, status: { not: 'replied' } }, data: { status: 'failed', skipReason: 'dispatch_error_review_required' } });
          logger.error(`Campaign ${campaign.id} recipient ${recipient.id} requires review: ${error.message}`);
        }
        if (billingBlocked) break;
      }
      const stats = await this.db.campaignLead.groupBy({ by: ['status'], where: { campaignId: campaign.id }, _count: true });
      const count = (status) => stats.find((item) => item.status === status)?._count || 0;
      const unfinished = count('pending') + count('sending');
      const paused = unfinished || billingBlocked;
      await this.db.campaign.update({
        where: { id: campaign.id },
        data: { status: paused ? 'paused' : 'completed',
          completedAt: paused ? null : new Date(),
          ...(billingBlocked ? { scheduleError: 'The provider rejected payment. Check the sending account balance before resuming.' }
            // A canary trip on the final recipient leaves nothing pending, so
            // the run completes normally and the note would only mislead.
            : canaryTripped && unfinished ? { scheduleError: `Paused automatically: ${runFailed} of ${runAccepted + runFailed} sends in this run failed. Review the failed recipients before resuming.` }
            : capacityBlocked && unfinished ? { scheduleError: 'No WhatsApp sender has capacity left (daily or hourly limit, or none available). Resume when an account has room.' } : {}) },
      });
      await refreshCampaignMetrics(this.db, campaign.id);
    } catch (error) {
      logger.error(`Campaign ${campaign.id} paused after execution error: ${error.message}`);
      await this.db.campaign.update({ where: { id: campaign.id }, data: { status: 'paused' } });
    }
  }

  async _sendChannel(campaign, lead, channel, bodyTemplate, subjectTemplate) {
    const body = this.personalizeMessage(bodyTemplate, lead);
    let accountId = null;
    if (channel === 'email') {
      accountId = campaignSenderId(campaign, channel) || await this.email._getNextEmailAccount({ poolId: lead.poolId });
      if (!accountId) return { skipped: true, reason: 'no_email_sender' };
    } else if (channel === 'whatsapp') {
      accountId = campaignSenderId(campaign, channel) || lead.assignedAccount
        || await this.whatsapp.getNextAccount({ poolId: lead.poolId, forInitialOutreach: true });
      // Halt, not skip: with rotation skipping at-capacity accounts, "none
      // available" is usually temporary, and a skipped recipient would be
      // terminal for the run while a pending one survives to the resume.
      if (!accountId) return { skipped: true, halt: true, reason: 'no_whatsapp_sender' };
      const account = await this.db.whatsAppAccount.findUnique({ where: { id: accountId } });
      if (!account?.enabled || !credentialState(account).ready) return { skipped: true, reason: 'whatsapp_sender_not_ready' };
      if (!campaign.waCampaignName) {
        const inbound = await this.db.message.findMany({ where: { leadId: lead.id, channel, direction: 'inbound', waAccount: accountId } });
        if (!whatsappSession(inbound, accountId).isOpen) return { skipped: true, reason: 're_engagement_required' };
      }
    }
    const subject = this.personalizeMessage(subjectTemplate || `Re: ${lead.product || 'Your inquiry'}`, lead);
    const message = await this.db.message.create({ data: {
      campaignId: campaign.id, leadId: lead.id, direction: 'outbound', channel, content: body,
      status: 'sending',
      ...(channel === 'email' ? { emailAccountId: accountId, emailSubject: subject } : {}),
      ...(channel === 'whatsapp' ? { waAccount: accountId,
        ...(campaign.waCampaignName ? { waCampaignName: campaign.waCampaignName,
          waTemplateParams: JSON.stringify([firstNameOf(lead.name), countryOf(lead.country)]) } : {}) } : {}),
    } });
    const live = await this._dispatchContext(campaign, lead.id, channel);
    if (!live.lead) {
      await this.db.message.update({ where: { id: message.id }, data: { status: 'cancelled', providerStatusReason: live.reason } });
      return { skipped: true, halt: live.halt, reason: live.reason };
    }
    if (channel === 'whatsapp') {
      const prior = await this.db.message.findMany({
        where: { leadId: lead.id, channel, direction: 'outbound', waAccount: accountId, waMessageId: { not: null } },
        select: { waMessageId: true },
      });
      const optedOut = prior.length && await this.db.whatsAppReceipt.findFirst({
        where: { accountId, waMessageId: { in: prior.map(row => row.waMessageId) }, failureCode: 131050 },
        select: { id: true },
      });
      if (optedOut) {
        const reason = 'whatsapp_marketing_opted_out';
        await this.db.message.update({ where: { id: message.id }, data: { status: 'cancelled', providerStatusReason: reason } });
        return { skipped: true, reason };
      }
    }
    // Templates and destinations use the freshly read row, including opt-outs and changed addresses.
    const liveBody = this.personalizeMessage(bodyTemplate, live.lead);
    const templateParams = [firstNameOf(live.lead.name), countryOf(live.lead.country)];
    await this.db.message.update({ where: { id: message.id }, data: { content: liveBody,
      ...(channel === 'whatsapp' && campaign.waCampaignName ? { waTemplateParams: JSON.stringify(templateParams) } : {}) } });
    let result;
    try {
      if (channel === 'email') {
        result = await this.email.sendEmail({ leadId: lead.id, accountId,
          subject: this.personalizeMessage(subjectTemplate || `Re: ${live.lead.product || 'Your inquiry'}`, live.lead),
          body: liveBody, htmlBody: liveBody.includes('<') ? liveBody : null, existingMessageId: message.id });
      } else if (channel === 'whatsapp') {
        result = campaign.waCampaignName
          ? await this.whatsapp.sendCampaignTemplate(whatsappAddress(live.lead), campaign.waCampaignName,
            templateParams, accountId, { poolId: live.lead.poolId, source: 'campaign' })
          : await this.whatsapp.sendMessage(whatsappAddress(live.lead), liveBody, accountId, { poolId: live.lead.poolId });
      } else {
        result = await this.imessage.sendMessage(live.lead.mobile, liveBody, live.lead.assignedIMessageAccountId || undefined);
      }
    } catch (error) {
      logger.error(`Campaign ${campaign.id} ${channel} request confirmation unknown: ${error.message}`);
      result = { success: false, reason: 'confirmation_unknown' };
    }
    const reason = result.reason || result.error || 'send_failed';
    // Out of capacity is a fact about the sending account, not this recipient.
    // The staged row is cancelled — a 'failed' row would permanently block
    // this recipient on resume — and the run halts so the rest stay pending.
    if (CAPACITY_REASONS.includes(reason)) {
      await this.db.message.update({ where: { id: message.id }, data: { status: 'cancelled', providerStatusReason: reason } });
      return { skipped: true, halt: true, reason };
    }
    const status = result.success ? 'sent' : UNCERTAIN.has(reason) ? 'unconfirmed' : 'failed';
    await this.db.message.update({ where: { id: message.id }, data: {
      content: liveBody,
      ...(channel === 'email' && result.messageId ? { emailMessageId: result.messageId } : {}),
      ...(channel === 'whatsapp' ? { waAccount: result.accountId || accountId, waMessageId: result.waMessageId || result.messageId || null } : {}),
      ...(channel === 'imessage' ? { imessageAccountId: result.accountId || null, imessageMessageId: result.messageId || null } : {}),
    } });
    // An email service or receipt may already have advanced this row to delivered/read.
    await this.db.message.updateMany({ where: { id: message.id, status: { in: ['sending', 'queued'] } }, data: {
      status, sentAt: result.success ? new Date() : null,
      providerStatusReason: result.success ? 'provider_accepted' : String(reason).slice(0, 300),
      ...(!result.success ? { providerErrorCode: result.errorCode == null ? null : String(result.errorCode),
        providerErrorMessage: result.error || null, providerRequestId: result.requestId || null } : {}),
    } });
    const saved = await this.db.message.findUnique({ where: { id: message.id } });
    if (result.success && channel === 'whatsapp' && saved.waMessageId) await this.reconcileReceipts(saved.waMessageId, saved.waAccount);
    if (result.success && channel === 'imessage') {
      await this.db.lead.updateMany({ where: { id: lead.id }, data: { imessageStatus: 'sent', lastImessageAt: new Date(), assignedIMessageAccountId: result.accountId || null } });
    }
    if (result.success) {
      const sentAt = saved.sentAt || new Date();
      await this.db.lead.updateMany({ where: { id: lead.id, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: sentAt } }] }, data: { lastMessageAt: sentAt } });
      // Never restore a stale pre-send status after an inbound reply or manual pause.
      await this.db.lead.updateMany({ where: { id: lead.id, status: 'new' }, data: { status: 'contacted' } });
    }
    return { success: result.success, attempted: true, reason: result.success ? null : reason };
  }

  async pauseCampaign(campaignId) {
    await this.db.campaign.update({ where: { id: campaignId }, data: { status: 'paused' } });
  }
  async getCampaign(campaignId) {
    const campaign = await this.db.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return null;
    const metrics = await readCampaignMetrics(this.db, campaignId);
    const stats = await this.db.campaignLead.groupBy({ by: ['status'], where: { campaignId }, _count: true });
    return { ...campaign, ...metrics, stats: Object.fromEntries(stats.map((item) => [item.status, item._count])) };
  }
  async listCampaigns() { return this.db.campaign.findMany({ orderBy: { createdAt: 'desc' } }); }
}
export default new CampaignEngine();
