import prisma from '../utils/prismaClient.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import whatsappManager from './whatsapp.js';
import whatsappCloudApi from './whatsappCloudApi.js';
import emailService from './emailService.js';
import imessageService from './imessage.js';
import { randomDelay, isBusinessHours } from '../utils/delay.js';

/** {{1}} in the approved templates. Matches freshLeadOutreach's firstName(). */
function firstNameOf(name) {
  const value = String(name || '').trim();
  return !value || /^user$/i.test(value) ? 'there' : value.split(/\s+/)[0];
}

/** {{2}} in the approved templates. */
function countryOf(country) {
  return String(country || '').trim() || 'your country';
}
import replyDetector from './replyDetector.js';
import leadStateService from '../domain/leadStateService.js';

// Lazily imported to avoid a circular dep with api.js. Same pattern as
// src/services/followup.js and src/services/emailService.js.
try {
} catch(e) {}

/**
 * Campaign Engine
 * Creates and executes custom outreach campaigns to stored leads.
 */
class CampaignEngine {

  /**
   * Create a new campaign
   */
  async createCampaign({ name, description, messageTemplate, targetFilter, channel, emailSubject, senderAccountId, variantBTemplate = null, variantBSubject = null, poolId = null }) {
    const campaign = await prisma.campaign.create({
      data: {
        name,
        description: description || null,
        poolId: poolId ? parseInt(poolId) : null,
        channel: channel || 'whatsapp',
        messageTemplate,
        emailSubject: emailSubject || null,
        senderAccountId: senderAccountId || null,
        targetFilter: targetFilter ? JSON.stringify(targetFilter) : null,
        status: 'draft',
        variantBTemplate,
        variantBSubject,
      },
    });

    logger.info(`📨 Campaign "${name}" (${channel || 'whatsapp'}) created (ID: ${campaign.id})`);
    return campaign;
  }

  /**
   * Get matching leads for a campaign filter, optionally restricted to a pool.
   * The poolId is the campaign's owning pool — we never select leads from a
   * different pool, even if the targetFilter would otherwise match them.
   */
  async getMatchingLeads(filterJson, poolId = null) {
    const filter = typeof filterJson === 'string' ? JSON.parse(filterJson) : (filterJson || {});
    const where = {
      OR: [
        { isOnWhatsApp: null },
        { isOnWhatsApp: true }
      ]
    }; // exclude those we know are NOT on WA

    // Pool scoping: campaigns target one pool. Without this, a campaign in
    // pool A would silently send to leads in pool B if targetFilter matched.
    if (poolId) where.poolId = poolId;

    if (filter.status) where.status = { in: Array.isArray(filter.status) ? filter.status : [filter.status] };
    if (filter.minScore !== undefined) where.score = { ...where.score, gte: filter.minScore };
    if (filter.maxScore !== undefined) where.score = { ...where.score, lte: filter.maxScore };
    if (filter.source) where.source = filter.source;
    if (filter.tags) where.tags = { contains: filter.tags };
    if (filter.olderThanDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filter.olderThanDays);
      where.createdAt = { lte: cutoff };
    }
    if (filter.product) where.product = { contains: filter.product };
    if (filter.country) where.country = { contains: filter.country };

    return prisma.lead.findMany({ where, orderBy: { score: 'desc' } });
  }

  /**
   * Populate campaign with matching leads
   */
  async populateCampaign(campaignId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');

    const leads = await this.getMatchingLeads(campaign.targetFilter, campaign.poolId);

    // Create campaign-lead associations (skip existing)
    let added = 0;
    for (const lead of leads) {
      try {
        await prisma.campaignLead.create({
          data: { campaignId, leadId: lead.id, status: 'pending' },
        });
        added++;
      } catch (e) {
        if (e.code !== 'P2002') throw e; // ignore duplicate
      }
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { totalLeads: added },
    });

    logger.info(`📨 Campaign ${campaign.name}: ${added} leads added`);
    return { added, total: leads.length };
  }

  /**
   * Personalize a message template with lead data
   */
  personalizeMessage(template, lead) {
    return template
      .replace(/\{\{name\}\}/gi, lead.name || 'there')
      .replace(/\{\{product\}\}/gi, lead.product || 'your product requirements')
      .replace(/\{\{company\}\}/gi, lead.company || 'your company')
      .replace(/\{\{country\}\}/gi, lead.country || '')
      .replace(/\{\{quantity\}\}/gi, lead.quantity || '')
      .trim();
  }

  /**
   * Start executing a campaign — sends messages with anti-ban delays
   */
  async startCampaign(campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        campaignLeads: {
          where: { status: 'pending' },
          include: { lead: true },
        },
      },
    });

    if (!campaign) throw new Error('Campaign not found');

    const updated = await prisma.campaign.updateMany({
      where: { id: campaignId, status: { not: 'running' } },
      data: { status: 'running', startedAt: new Date() },
    });

    if (updated.count === 0) throw new Error('Campaign already running or not found');

    logger.info(`🚀 Campaign "${campaign.name}" started — ${campaign.campaignLeads.length} messages to send`);

    // Process in background
    this._executeCampaign(campaign).catch(err => {
      logger.error(`Campaign ${campaignId} error: ${err.message}`);
    });

    return { status: 'running', pending: campaign.campaignLeads.length };
  }

  /**
   * Internal: execute campaign messages with delays
   */
  async _executeCampaign(campaign) {
    const pendingLeads = await prisma.campaignLead.findMany({
      where: { campaignId: campaign.id, status: 'pending' },
      include: { lead: true },
    });

    let sentCount = 0;
    let failedCount = 0;

    try {

    for (const cl of pendingLeads) {
      // Atomic claim: pending → sending. If a previous run crashed between
      // sendMessage() and the campaignLead update, this row may still be 'pending'
      // even though a Message already exists. Guard with a Message lookup before
      // dispatch, and serialize the claim so concurrent campaign runs can't
      // both pick up the same row.
      const claimed = await prisma.campaignLead.updateMany({
        where: { id: cl.id, status: 'pending' },
        data: { status: 'sending' },
      });
      if (claimed.count === 0) continue;

      // Idempotency: skip if we already have a non-cancelled outbound Message
      // for this (campaignId, leadId). Covers the crash-after-send case.
      const alreadySent = await prisma.message.findFirst({
        where: {
          campaignId: campaign.id,
          leadId: cl.lead.id,
          direction: 'outbound',
          status: { in: ['queued', 'sending', 'sent', 'delivered', 'permanently_failed'] },
        },
        select: { id: true },
      });
      if (alreadySent) {
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { status: 'sent', sentAt: new Date() },
        });
        logger.info(`⏭️ Campaign ${campaign.id} lead ${cl.lead.id}: message ${alreadySent.id} already exists, marking sent`);
        sentCount++;
        continue;
      }

      // Check if campaign was paused
      const current = await prisma.campaign.findUnique({ where: { id: campaign.id } });
      if (!current) {
        logger.error(`Campaign ${campaign.id} deleted mid-execution`);
        break;
      }
      if (current.status === 'paused') {
        logger.info(`⏸️ Campaign "${campaign.name}" paused after ${sentCount} messages`);
        // Release the claim so paused campaigns resume cleanly.
        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'pending' } });
        break;
      }

      // Pass the channel: "WhatsApp can't reach this number" must not keep an
      // email or iMessage campaign from the leads it exists to reach.
      const stopChannel = campaign.channel === 'email' || campaign.channel === 'imessage'
        ? campaign.channel
        : 'whatsapp';
      if (leadStateService.shouldBlockAutomation(cl.lead.status, { channel: stopChannel })) {
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { status: 'failed' },
        });
        logger.info(`⏭️ Skipping campaign lead ${cl.lead.id}: status is ${cl.lead.status}`);
        failedCount++;
        continue;
      }

      // Respect business hours. The defaults now come from config, so this and
      // followup.js agree on when outreach is allowed.
      if (!isBusinessHours()) {
        logger.info(`Campaign "${campaign.name}" waiting for business hours...`);
        // Release the claim so the next run picks this row up cleanly.
        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'pending' } });
        break;
      }

      // A/B split: assign variant if not yet set, then pick template
      let clVariant = cl.variant;
      if (clVariant === 'A' && campaign.variantBTemplate) {
        // Determine variant on-the-fly based on CampaignLead ID parity (deterministic, no DB write needed)
        clVariant = cl.id % 2 === 0 ? 'A' : 'B';
        if (clVariant !== cl.variant) {
          await prisma.campaignLead.update({ where: { id: cl.id }, data: { variant: clVariant } });
        }
      }
      const templateBody = (clVariant === 'B' && campaign.variantBTemplate)
        ? campaign.variantBTemplate : campaign.messageTemplate;
      const templateSubject = (clVariant === 'B' && campaign.variantBSubject)
        ? campaign.variantBSubject : campaign.emailSubject;

      const personalizedMsg = this.personalizeMessage(templateBody, cl.lead);
      const isEmailCampaign = campaign.channel === 'email' || (campaign.channel === 'both' && !cl.lead.mobile);
      const isBothChannel = campaign.channel === 'both';

      if (isEmailCampaign || (isBothChannel && cl.lead.email)) {
        // ── Email Campaign Send ──
        if (!cl.lead.email) {
          await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'failed' } });
          failedCount++;
          continue;
        }

        const emailSubject = templateSubject
          ? this.personalizeMessage(templateSubject, cl.lead)
          : `Re: ${cl.lead.product || 'Your inquiry'}`;

        const result = await emailService.sendEmail({
          leadId: cl.lead.id,
          accountId: campaign.senderAccountId || await emailService._getNextEmailAccount({ poolId: cl.lead.poolId }),
          subject: emailSubject,
          body: personalizedMsg,
          htmlBody: personalizedMsg.includes('<') ? personalizedMsg : null,
        });

        if (result.success) {
          await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'sent', sentAt: new Date() } });
          sentCount++;
        } else {
          await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'failed' } });
          failedCount++;
        }

        // No aggressive delay needed for email (not anti-ban sensitive)
        await randomDelay(2000, 5000);

        // For 'both' channel, also send WA if lead has mobile
        if (isBothChannel && cl.lead.mobile && cl.lead.isOnWhatsApp !== false) {
          // Fall through to WA send below
        } else {
          continue;
        }
      }

      // ── WhatsApp Campaign Send ──
      if (campaign.channel === 'whatsapp' || campaign.channel === 'both') {
        // Use the lead's assigned account, or pick next available.
        // PERSONA SAFETY: waAccount must be a real account ID, never 0 (which causes silent fallback)
        const campaignWaAccount = cl.lead.assignedAccount || campaign.senderAccountId || await whatsappManager.getNextAccount({ poolId: cl.lead.poolId }) || 0;

        // Determine if this account uses Cloud API or web_js
        let useCloudApi = false;
        if (campaignWaAccount) {
          const waAccount = await prisma.whatsAppAccount.findUnique({ where: { id: campaignWaAccount } });
          if (waAccount?.waAccountType === 'cloud_api') {
            useCloudApi = true;
          }
        }

        const message = await prisma.message.create({
          data: {
            leadId: cl.lead.id,
            direction: 'outbound',
            channel: 'whatsapp',
            content: personalizedMsg,
            waAccount: campaignWaAccount,
            status: 'queued',
            campaignId: campaign.id,
          },
        });

        // Route through Cloud API or web_js based on account type
        let sendResult;
        if (campaign.waCampaignName) {
          // An approved template (a template name on Meta, a campaign name on
          // AiSensy). Free text is only deliverable inside
          // the 24h customer-service window, so for a cold or re-engagement
          // audience this is the only transport WhatsApp accepts — a plain text
          // send to those leads is rejected for every recipient.
          sendResult = await whatsappManager.sendCampaignTemplate(
            cl.lead.mobile,
            campaign.waCampaignName,
            [firstNameOf(cl.lead.name), countryOf(cl.lead.country)],
            campaignWaAccount || null,
            { poolId: cl.lead.poolId, source: 'campaign' },
          );
        } else if (useCloudApi) {
          sendResult = await whatsappCloudApi.sendTextMessage(
            cl.lead.mobile,
            personalizedMsg,
            campaignWaAccount
          );
          // Map Cloud API response shape to match web_js shape
          if (sendResult.success) {
            sendResult.accountId = campaignWaAccount;
            sendResult.identifiers = []; // Cloud API doesn't return chat identifiers
          }
        } else {
          sendResult = await whatsappManager.sendMessage(
            cl.lead.mobile,
            personalizedMsg,
            campaignWaAccount || undefined
          );
        }

        if (sendResult.success) {
          if (Array.isArray(sendResult.identifiers) && sendResult.identifiers.length > 0) {
            replyDetector.rememberLeadIdentity(
              cl.lead.id,
              sendResult.accountId || cl.lead.assignedAccount || 1,
              sendResult.identifiers
            );
          }

          await prisma.message.update({
            where: { id: message.id },
            data: {
              status: 'sent',
              sentAt: new Date(),
              waAccount: sendResult.accountId || campaignWaAccount || 1,
              ...(sendResult.waMessageId ? { waMessageId: sendResult.waMessageId } : {}),
            },
          });
          if (!isEmailCampaign) {
            await prisma.campaignLead.update({
              where: { id: cl.id },
              data: { status: 'sent', sentAt: new Date() },
            });
            sentCount++;
          }
        } else {
          const failedStatus = (sendResult.reason === 'not_on_whatsapp' || sendResult.reason === 'invalid_phone')
            ? 'permanently_failed'
            : 'failed';

          await prisma.message.update({
            where: { id: message.id },
            data: { status: failedStatus, waAccount: sendResult.accountId || 0 },
          });
          if (!isEmailCampaign) {
            await prisma.campaignLead.update({
              where: { id: cl.id },
              data: { status: 'failed' },
            });
            failedCount++;
          }
          if (sendResult.reason === 'not_on_whatsapp' || sendResult.reason === 'invalid_phone') {
            await prisma.lead.update({
              where: { id: cl.lead.id },
              data: { isOnWhatsApp: false, status: 'wa_unavailable' },
            });
          }
        }

        // Cloud API doesn't need anti-ban delays (official API), but still throttle slightly
        const minDelay = useCloudApi ? 1000 : (config.whatsapp.minDelay || 30000);
        const maxDelay = useCloudApi ? 3000 : (config.whatsapp.maxDelay || 90000);
        await randomDelay(minDelay, maxDelay);
      }

      // ── iMessage Campaign Send ──
      if (campaign.channel === 'imessage') {
        if (!cl.lead.mobile) {
          await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'failed' } });
          failedCount++;
          continue;
        }

        const imsgMessage = await prisma.message.create({
          data: {
            leadId: cl.lead.id,
            direction: 'outbound',
            channel: 'imessage',
            content: personalizedMsg,
            status: 'queued',
            campaignId: campaign.id,
          },
        });

        const sendResult = await imessageService.sendMessage(cl.lead.mobile, personalizedMsg);

        if (sendResult.success) {
          await prisma.message.update({
            where: { id: imsgMessage.id },
            data: {
              status: 'sent',
              sentAt: new Date(),
              imessageAccountId: sendResult.accountId || null,
              imessageMessageId: sendResult.messageId || null,
            },
          });
          await prisma.lead.update({
            where: { id: cl.lead.id },
            data: {
              imessageStatus: 'sent',
              lastImessageAt: new Date(),
              assignedIMessageAccountId: sendResult.accountId || null,
              status: cl.lead.status === 'new' ? 'contacted' : cl.lead.status,
            },
          });
          await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'sent', sentAt: new Date() } });
          sentCount++;
          logger.info(`[iMessage] Campaign sent to Lead ${cl.lead.id}`);
        } else {
          await prisma.message.update({
            where: { id: imsgMessage.id },
            data: { status: 'failed' },
          });
          await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'failed' } });
          failedCount++;
          logger.warn(`[iMessage] Campaign send failed for Lead ${cl.lead.id}: ${sendResult.reason}`);
        }

        // Polite delay between iMessages (BlueBubbles/Apple limits)
        await randomDelay(8000, 20000);
        continue;
      }
    }

    // Update campaign stats
    const stats = await prisma.campaignLead.groupBy({
      by: ['status'],
      where: { campaignId: campaign.id },
      _count: true,
    });

    const sentTotal = stats.find(s => s.status === 'sent')?._count || 0;
    const failedTotal = stats.find(s => s.status === 'failed')?._count || 0;
    const pendingTotal = stats.find(s => s.status === 'pending')?._count || 0;

    const finalStatus = pendingTotal === 0 ? 'completed' : 'paused';

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        sentCount: sentTotal,
        failedCount: failedTotal,
        status: finalStatus,
        ...(finalStatus === 'completed' ? { completedAt: new Date() } : {}),
      },
    });

    logger.info(`📨 Campaign "${campaign.name}" ${finalStatus}: ${sentTotal} sent, ${failedTotal} failed, ${pendingTotal} pending`);
    } catch (err) {
      logger.error(`Fatal error executing campaign ${campaign.id}: ${err.message}`);
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'paused' }
      });
    }
  }

  /**
   * Pause a running campaign
   */
  async pauseCampaign(campaignId) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'paused' },
    });
    logger.info(`⏸️ Campaign ${campaignId} paused`);
  }

  /**
   * Get campaign with stats
   */
  async getCampaign(campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    const stats = await prisma.campaignLead.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: true,
    });

    return {
      ...campaign,
      stats: Object.fromEntries(stats.map(s => [s.status, s._count])),
    };
  }

  /**
   * List all campaigns
   */
  async listCampaigns() {
    return prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}

const campaignEngine = new CampaignEngine();
export default campaignEngine;
