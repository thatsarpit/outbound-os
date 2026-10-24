import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import whatsappManager from './whatsapp.js';
import { credentialState } from './whatsappProviders.js';
import emailService from './emailService.js';
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

/** Campaign dispatch has injectable dependencies so its safety rules need no provider calls to test. */
export class CampaignEngine {
  constructor({ db = prisma, whatsapp = whatsappManager, email = emailService,
    imessage = imessageService, delay = randomDelay, businessHours = isBusinessHours,
    reconcileReceipts = reconcileMetaReceipts } = {}) {
    Object.assign(this, { db, whatsapp, email, imessage, delay, businessHours, reconcileReceipts });
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
    logger.info(`Campaign "${name}" (${channel}) created (ID: ${campaign.id})`);
    return campaign;
  }

  async getMatchingLeads(filterJson, poolId = null, channel = 'whatsapp') {
    const filter = typeof filterJson === 'string' ? JSON.parse(filterJson) : (filterJson || {});
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
    return leads.filter((lead) => hasAllLeadTags(lead.tags, filter.tags)
      && channels.some((item) => campaignChannelEligibility(lead, item).eligible));
  }

  async populateCampaign(campaignId) {
    const campaign = await this.db.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status !== 'draft') throw new Error('Only draft campaigns can change their audience');
    const leads = await this.getMatchingLeads(campaign.targetFilter, campaign.poolId, campaign.channel);
    let added = 0;
    for (const lead of leads) {
      try {
        await this.db.campaignLead.create({ data: { campaignId, leadId: lead.id, status: 'pending' } });
        added++;
      } catch (error) { if (error.code !== 'P2002') throw error; }
    }
    const total = await this.db.campaignLead.count({ where: { campaignId } });
    await this.db.campaign.update({ where: { id: campaignId }, data: { totalLeads: total } });
    return { added, total };
  }

  personalizeMessage(template, lead) {
    return String(template || '')
      .replace(/\{\{name\}\}/gi, () => lead.name || 'there')
      .replace(/\{\{product\}\}/gi, () => lead.product || 'your product requirements')
      .replace(/\{\{company\}\}/gi, () => lead.company || 'your company')
      .replace(/\{\{country\}\}/gi, () => lead.country || '')
      .replace(/\{\{quantity\}\}/gi, () => lead.quantity || '').trim();
  }

  async startCampaign(campaignId) {
    const campaign = await this.db.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');
    if (!['draft', 'paused', 'scheduled'].includes(campaign.status)) throw new Error('Campaign is not startable');
    const pending = await this.db.campaignLead.count({ where: { campaignId, status: 'pending' } });
    const updated = await this.db.campaign.updateMany({
      where: { id: campaignId, status: campaign.status }, data: { status: 'running', startedAt: new Date(), completedAt: null },
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
    return eligibility.eligible ? { lead } : { reason: eligibility.reason };
  }

  async _executeCampaign(campaign) {
    const channels = campaignChannels(campaign.channel);
    const pending = await this.db.campaignLead.findMany({
      where: { campaignId: campaign.id, status: 'pending' }, orderBy: { id: 'asc' },
    });
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
              if (ACCEPTED.has(existing.status)) accepted++;
              else { failed++; reasons.push(`${channel}:${existing.providerStatusReason || existing.status}`); }
              continue;
            }
            const context = await this._dispatchContext(campaign, recipient.leadId, channel);
            if (context.halt) { halted = true; break; }
            if (!context.lead) { reasons.push(`${channel}:${context.reason}`); continue; }
            const result = await this._sendChannel(campaign, context.lead, channel, body, subject);
            if (result.halt) { halted = true; break; }
            if (result.success) accepted++;
            else if (!result.skipped) failed++;
            if (result.reason) reasons.push(`${channel}:${result.reason}`);
            if (result.attempted) await this.delay(channel === 'imessage' ? 8000 : 1000, channel === 'imessage' ? 20000 : 3000);
          }
          if (halted) {
            await this.db.campaignLead.update({ where: { id: recipient.id }, data: { status: 'pending' } });
            break;
          }
          await this.db.campaignLead.update({
            where: { id: recipient.id },
            data: {
              status: failed ? 'failed' : accepted ? 'sent' : 'skipped',
              sentAt: accepted ? new Date() : null,
              skipReason: reasons.length ? reasons.join('; ').slice(0, 500) : null,
            },
          });
        } catch (error) {
          // A failed local write after an accepted request cannot release a recipient for an automatic retry.
          await this.db.campaignLead.update({ where: { id: recipient.id }, data: { status: 'failed', skipReason: 'dispatch_error_review_required' } });
          logger.error(`Campaign ${campaign.id} recipient ${recipient.id} requires review: ${error.message}`);
        }
      }
      const stats = await this.db.campaignLead.groupBy({ by: ['status'], where: { campaignId: campaign.id }, _count: true });
      const count = (status) => stats.find((item) => item.status === status)?._count || 0;
      const unfinished = count('pending') + count('sending');
      await this.db.campaign.update({
        where: { id: campaign.id },
        data: { sentCount: count('sent'), failedCount: count('failed'), status: unfinished ? 'paused' : 'completed',
          completedAt: unfinished ? null : new Date() },
      });
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
      if (!accountId) return { skipped: true, reason: 'no_whatsapp_sender' };
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
      ...(channel === 'whatsapp' ? { waAccount: accountId } : {}),
    } });
    const live = await this._dispatchContext(campaign, lead.id, channel);
    if (!live.lead) {
      await this.db.message.update({ where: { id: message.id }, data: { status: 'cancelled', providerStatusReason: live.reason } });
      return { skipped: true, halt: live.halt, reason: live.reason };
    }
    // Templates and destinations use the freshly read row, including opt-outs and changed addresses.
    const liveBody = this.personalizeMessage(bodyTemplate, live.lead);
    let result;
    try {
      if (channel === 'email') {
        result = await this.email.sendEmail({ leadId: lead.id, accountId,
          subject: this.personalizeMessage(subjectTemplate || `Re: ${live.lead.product || 'Your inquiry'}`, live.lead),
          body: liveBody, htmlBody: liveBody.includes('<') ? liveBody : null, existingMessageId: message.id });
      } else if (channel === 'whatsapp') {
        result = campaign.waCampaignName
          ? await this.whatsapp.sendCampaignTemplate(whatsappAddress(live.lead), campaign.waCampaignName,
            [firstNameOf(live.lead.name), countryOf(live.lead.country)], accountId, { poolId: live.lead.poolId, source: 'campaign' })
          : await this.whatsapp.sendMessage(whatsappAddress(live.lead), liveBody, accountId, { poolId: live.lead.poolId });
      } else {
        result = await this.imessage.sendMessage(live.lead.mobile, liveBody, live.lead.assignedIMessageAccountId || undefined);
      }
    } catch (error) {
      logger.error(`Campaign ${campaign.id} ${channel} request confirmation unknown: ${error.message}`);
      result = { success: false, reason: 'confirmation_unknown' };
    }
    const reason = result.reason || result.error || 'send_failed';
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
    } });
    const saved = await this.db.message.findUnique({ where: { id: message.id } });
    if (result.success && channel === 'whatsapp' && saved.waMessageId) await this.reconcileReceipts(saved.waMessageId, saved.waAccount);
    if (result.success && channel === 'imessage') {
      await this.db.lead.updateMany({ where: { id: lead.id }, data: { imessageStatus: 'sent', lastImessageAt: new Date(), assignedIMessageAccountId: result.accountId || null } });
    }
    if (result.success) {
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
    const stats = await this.db.campaignLead.groupBy({ by: ['status'], where: { campaignId }, _count: true });
    return { ...campaign, stats: Object.fromEntries(stats.map((item) => [item.status, item._count])) };
  }
  async listCampaigns() { return this.db.campaign.findMany({ orderBy: { createdAt: 'desc' } }); }
}
export default new CampaignEngine();
