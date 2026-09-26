import prisma from '../utils/prismaClient.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import whatsappManager from './whatsapp.js';
import emailService from './emailService.js';
import { buildWhatsAppCtaEmail } from '../templates/emailWhatsappCta.js';
import { buildFreshAutomationKey, FRESH_AUTOMATION_KEY_PREFIX } from '../utils/automationKeys.js';
import { isSendableMobile } from '../utils/inboundLead.js';

export const FRESH_LEAD_VARIANT = 'fresh-lead-multichannel-v3';
// Earlier names for the same first touch. Matching them keeps a lead that was
// already contacted under an old name from being contacted again.
export const LEGACY_FRESH_LEAD_VARIANTS = ['fresh-indiamart-multichannel-v2', 'fresh-indiamart-multichannel-v1'];
// Template used for a new lead's first WhatsApp message when the sending
// number has no default of its own (Settings → WhatsApp). Blank means "none":
// first contact on WhatsApp must be an approved template, so without one the
// channel is skipped rather than queued to fail.
export const DEFAULT_WA_CAMPAIGN = process.env.WA_FIRST_TOUCH_TEMPLATE || '';

const BLOCKED_LEAD_STATUSES = ['paused', 'closed', 'replied', 'engaged'];

/**
 * Lead.mobile is a required column, so an email-only lead carries a `no-phone:`
 * placeholder rather than a number. Queueing WhatsApp and iMessage on the
 * strength of `lead.mobile` being truthy therefore lined up sends to an address
 * that can never receive one — burning a daily account cap and logging a
 * delivery failure for a lead whose email was perfectly reachable.
 */
function hasSendableMobile(lead) {
  return isSendableMobile(lead?.mobile);
}

export { buildFreshAutomationKey } from '../utils/automationKeys.js';

function firstName(name) {
  const value = String(name || '').trim();
  return !value || /^user$/i.test(value) ? 'there' : value.split(/\s+/)[0];
}

function countryName(country) {
  return String(country || '').trim() || 'your country';
}

/**
 * Default first-touch copy.
 *
 * Deliberately says nothing about a specific industry or lead source: a lead
 * can arrive from the ingest webhook, a CSV, or any connected source, and the
 * business identity comes from config rather than being written into the
 * sentence. Deployments that want their own wording override these through
 * message templates rather than editing this file.
 */
function businessName() {
  return config.business.name || 'us';
}

function whatsappPreview(lead) {
  return `Hi ${firstName(lead.name)}, thanks for your enquiry.\n\nWe can supply to ${countryName(lead.country)}.\n\nCould you share your required quantity so I can send pricing and a delivery timeline?\n\nThank you.`;
}

function imessageBody(lead) {
  const product = String(lead.product || 'your enquiry').trim();
  const sender = config.business.senderName;
  const intro = sender ? `${sender} from ${businessName()}` : businessName();
  return `Hi ${firstName(lead.name)}, ${intro} here. I’m reaching out about your requirement for ${product}. If it is still active, please send the quantity and destination and I’ll confirm availability and pricing.`;
}

function isUniqueConflict(error) {
  return error?.code === 'P2002';
}

/**
 * Find a durable automation row, including v1 rows created before the global
 * automationKey existed. Legacy rows are adopted in place so the upgrade does
 * not send a second first-contact message to an already-queued channel.
 */
async function findOrAdoptExisting(leadId, channel, automationKey) {
  // The unique index is the compound (tenantId, automationKey), so
  // automationKey alone is not a valid findUnique selector — Prisma rejects
  // the call outright rather than returning null, which threw out of queue()
  // and left every freshly polled lead with no outreach at all. findFirst says
  // what this actually needs: does a row with this key exist.
  const keyed = await prisma.message.findFirst({ where: { automationKey } });
  if (keyed) return keyed;

  const legacy = await prisma.message.findFirst({
    where: {
      leadId,
      channel,
      direction: 'outbound',
      templateVariant: { in: [FRESH_LEAD_VARIANT, ...LEGACY_FRESH_LEAD_VARIANTS] },
    },
    orderBy: { id: 'asc' },
  });
  if (!legacy) return null;

  if (!legacy.automationKey) {
    try {
      return await prisma.message.update({
        where: { id: legacy.id },
        data: { automationKey },
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      return prisma.message.findFirst({ where: { automationKey } });
    }
  }
  return legacy;
}

async function createIdempotently(data) {
  try {
    return { row: await prisma.message.create({ data }), created: true };
  } catch (error) {
    if (!isUniqueConflict(error) || !data.automationKey) throw error;
    return {
      row: await prisma.message.findFirst({ where: { automationKey: data.automationKey } }),
      created: false,
    };
  }
}

async function fallbackWhatsAppAccount(poolId) {
  const where = { enabled: true, role: 'outreach' };
  if (poolId) where.leadPools = { some: { poolId } };
  let account = await prisma.whatsAppAccount.findFirst({
    where,
    orderBy: [{ newLeadsContactedToday: 'asc' }, { messagesSentToday: 'asc' }, { id: 'asc' }],
  });
  // Pools created before account routing was configured should still retain a
  // durable queue row. The send processor applies the final safety gates.
  if (!account && poolId) {
    account = await prisma.whatsAppAccount.findFirst({
      where: { enabled: true, role: 'outreach' },
      orderBy: [{ newLeadsContactedToday: 'asc' }, { messagesSentToday: 'asc' }, { id: 'asc' }],
    });
  }
  return account;
}

async function fallbackEmailAccount(poolId) {
  const where = { enabled: true, status: 'verified' };
  if (poolId) where.leadPools = { some: { poolId } };
  let account = await prisma.emailAccount.findFirst({
    where,
    orderBy: [{ sentToday: 'asc' }, { id: 'asc' }],
  });
  if (!account && poolId) {
    account = await prisma.emailAccount.findFirst({
      where: { enabled: true, status: 'verified' },
      orderBy: [{ sentToday: 'asc' }, { id: 'asc' }],
    });
  }
  return account;
}

class FreshLeadOutreach {
  /**
   * Reconcile each channel independently. A crash after the WhatsApp insert no
   * longer suppresses email/iMessage forever, and every create is protected by
   * a database unique key rather than an in-memory check.
   */
  async queue(lead) {
    const liveLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    if (!liveLead) throw new Error('Lead not found');
    if (BLOCKED_LEAD_STATUSES.includes(liveLead.status)) {
      return { skipped: true, reason: `lead_${liveLead.status}` };
    }

    const summary = {
      whatsapp: 'unavailable',
      email: 'unavailable',
      imessage: 'unavailable',
      telegram: 'unavailable',
    };
    const now = Date.now();
    let assignedWaAccountId = null;

    // WhatsApp: keep a durable queue row even when the account is temporarily
    // at its daily cap. The queue processor will hold it until capacity resets.
    if (hasSendableMobile(liveLead)) {
      const key = buildFreshAutomationKey(liveLead.id, 'whatsapp');
      const existing = await findOrAdoptExisting(liveLead.id, 'whatsapp', key);
      if (existing) {
        summary.whatsapp = 'already_queued';
        assignedWaAccountId = existing.waAccount || null;
      } else {
        const preferredId = await whatsappManager.getNextAccount({
          forInitialOutreach: true,
          poolId: liveLead.poolId,
        });
        const account = preferredId
          ? await prisma.whatsAppAccount.findUnique({ where: { id: preferredId } })
          : await fallbackWhatsAppAccount(liveLead.poolId);
        const templateName = account?.defaultCampaignName || DEFAULT_WA_CAMPAIGN;
        if (account && !templateName) {
          summary.whatsapp = 'no_template';
          logger.warn(`Lead ${liveLead.id}: WhatsApp first touch skipped — set a default template on ${account.name} in Settings → WhatsApp`);
        } else if (account) {
          const result = await createIdempotently({
            leadId: liveLead.id,
            direction: 'outbound',
            channel: 'whatsapp',
            content: whatsappPreview(liveLead),
            waAccount: account.id,
            waCampaignName: templateName,
            waTemplateParams: JSON.stringify([firstName(liveLead.name), countryName(liveLead.country)]),
            templateVariant: FRESH_LEAD_VARIANT,
            automationKey: key,
            status: 'queued',
            scheduledAt: new Date(now),
          });
          summary.whatsapp = result.created ? 'queued' : 'already_queued';
          assignedWaAccountId = result.row?.waAccount || account.id;
        }
      }
    }

    if (liveLead.email && !liveLead.emailOptOut) {
      const key = buildFreshAutomationKey(liveLead.id, 'email');
      const existing = await findOrAdoptExisting(liveLead.id, 'email', key);
      if (existing) {
        summary.email = 'already_queued';
      } else {
        const preferredId = await emailService._getNextEmailAccount({ poolId: liveLead.poolId });
        const account = preferredId
          ? await prisma.emailAccount.findUnique({ where: { id: preferredId } })
          : await fallbackEmailAccount(liveLead.poolId);
        if (account) {
          const email = buildWhatsAppCtaEmail(liveLead);
          try {
            await emailService.queueEmail({
              leadId: liveLead.id,
              accountId: account.id,
              subject: email.subject,
              body: email.textBody,
              htmlBody: email.htmlBody,
              scheduledAt: new Date(now + 60 * 1000),
              templateVariant: FRESH_LEAD_VARIANT,
              automationKey: key,
            });
            summary.email = 'queued';
          } catch (error) {
            if (!isUniqueConflict(error)) throw error;
            summary.email = 'already_queued';
          }
        }
      }
    }

    if (hasSendableMobile(liveLead)) {
      const key = buildFreshAutomationKey(liveLead.id, 'imessage');
      const existing = await findOrAdoptExisting(liveLead.id, 'imessage', key);
      if (existing) {
        summary.imessage = 'already_queued';
      } else {
        const enabledCount = await prisma.iMessageAccount.count({ where: { enabled: true } });
        if (enabledCount > 0) {
          const result = await createIdempotently({
            leadId: liveLead.id,
            direction: 'outbound',
            channel: 'imessage',
            content: imessageBody(liveLead),
            waAccount: 0,
            // Keep this null so the processor can choose whichever Mac is back
            // online after a reboot instead of pinning the row to a dead host.
            imessageAccountId: null,
            templateVariant: FRESH_LEAD_VARIANT,
            automationKey: key,
            status: 'queued',
            maxRetries: 144,
            scheduledAt: new Date(now + 7 * 60 * 1000),
          });
          summary.imessage = result.created ? 'queued' : 'already_queued';
        }
      }
    }

    // Telegram. Unlike the others this sends directly rather than through a
    // queue, because there is no Telegram queue processor — so a "queued" row
    // here would sit untouched forever. It needs an explicit peer: Telegram
    // user accounts can only message peers they are allowed to contact, and a
    // raw phone number from a lead is not one of them.
    if (liveLead.telegramPeer) {
      const key = buildFreshAutomationKey(liveLead.id, 'telegram');
      const existing = await findOrAdoptExisting(liveLead.id, 'telegram', key);
      if (existing) {
        summary.telegram = 'already_sent';
      } else {
        try {
          const { default: telegramService } = await import('./telegram.js');
          const text = whatsappPreview(liveLead);
          const result = await telegramService.sendMessage({
            peer: liveLead.telegramPeer,
            message: text,
          });
          await createIdempotently({
            leadId: liveLead.id,
            direction: 'outbound',
            channel: 'telegram',
            content: text,
            waAccount: 0,
            telegramAccountId: result.accountId,
            telegramMessageId: result.messageId || null,
            templateVariant: FRESH_LEAD_VARIANT,
            automationKey: key,
            // Terminal on purpose: nothing polls Telegram rows, so anything
            // left 'queued' would never be picked up again.
            status: 'sent',
            sentAt: result.sentAt || new Date(),
          });
          summary.telegram = 'sent';
        } catch (error) {
          logger.warn(`Fresh lead ${liveLead.id}: Telegram send failed - ${error.message}`);
          summary.telegram = 'failed';
        }
      }
    }

    const hasDurableOutreach = Object.values(summary).some((value) =>
      value === 'queued' || value === 'already_queued' || value === 'sent' || value === 'already_sent'
    );
    if (hasDurableOutreach) {
      await prisma.lead.update({
        where: { id: liveLead.id },
        data: {
          status: liveLead.status === 'new' ? 'contacted' : liveLead.status,
          ...(assignedWaAccountId ? { assignedAccount: assignedWaAccountId } : {}),
          ...(summary.email === 'queued' ? { emailStatus: 'queued' } : {}),
          ...(summary.imessage === 'queued' ? { imessageStatus: 'queued' } : {}),
          ...(summary.telegram === 'sent' ? { telegramStatus: 'sent' } : {}),
        },
      });
    }

    logger.info(`⚡ Fresh lead ${liveLead.id} channel reconciliation: ${JSON.stringify(summary)}`);
    return summary;
  }

  /**
   * Send this batch's queued first-touch messages now, rather than waiting for
   * the next cron tick.
   *
   * `queue()` only records the intent; the queue processors run on a two-minute
   * cron, so without this a lead captured the instant a buyer enquires sits
   * untouched for up to two minutes. For a live enquiry that delay is the
   * product — this is what makes the outreach immediate.
   *
   * Lifted out of leadPoller, which was the only caller. The inbound webhook
   * queued messages and then left them for the cron, so webhook leads — which,
   * with the poller disabled, are now every lead — were never actually immediate.
   */
  async dispatchNow(leads) {
    const leadIds = (Array.isArray(leads) ? leads : [leads])
      .map((lead) => lead?.id)
      .filter(Number.isInteger);
    if (leadIds.length === 0) return { dispatched: 0 };

    const rows = await prisma.message.findMany({
      where: {
        leadId: { in: leadIds },
        status: 'queued',
        direction: 'outbound',
        automationKey: { startsWith: FRESH_AUTOMATION_KEY_PREFIX },
      },
      select: { id: true, channel: true },
    });
    if (rows.length === 0) return { dispatched: 0 };

    // Pull the schedule forward. Queue identity stays the dedupe boundary, so
    // this cannot produce a second send.
    await prisma.message.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: 'queued' },
      data: { scheduledAt: new Date(), providerStatusReason: null },
    });

    const idsFor = (channel) => rows.filter((row) => row.channel === channel).map((row) => row.id);
    const [{ default: followupEngine }, { default: emailService }, { default: imessageService }] =
      await Promise.all([
        import('./followup.js'),
        import('./emailService.js'),
        import('./imessage.js'),
      ]);

    // Each channel independently: one provider being down must not hold up the
    // others, which is the whole point of reaching out on several at once.
    const results = await Promise.allSettled([
      idsFor('whatsapp').length
        ? followupEngine.processQueue({ messageIds: idsFor('whatsapp') })
        : null,
      idsFor('email').length
        ? emailService.processEmailQueue({ messageIds: idsFor('email') })
        : null,
      idsFor('imessage').length
        ? imessageService.processQueue({ messageIds: idsFor('imessage') })
        : null,
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn(`Immediate fresh-lead dispatch: ${result.reason?.message || result.reason}`);
      }
    }
    return { dispatched: rows.length };
  }

  /** Reconcile leads that may have been interrupted midway during a crash. */
  async reconcileRecent({ since, limit = 2000 } = {}) {
    const from = since instanceof Date && !Number.isNaN(since.getTime())
      ? since
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const leads = await prisma.lead.findMany({
      where: {
        // Live sources only: a lead that arrived by webhook expects a first
        // touch, a bulk import deliberately does not.
        source: { notIn: ['csv_import', 'manual'] },
        createdAt: { gte: from },
        status: { notIn: BLOCKED_LEAD_STATUSES },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.max(1, Math.min(Number(limit) || 2000, 10000)),
    });

    const totals = {
      checked: leads.length,
      whatsappQueued: 0,
      emailQueued: 0,
      imessageQueued: 0,
      errors: 0,
    };
    for (const lead of leads) {
      try {
        const result = await this.queue(lead);
        if (result.whatsapp === 'queued') totals.whatsappQueued += 1;
        if (result.email === 'queued') totals.emailQueued += 1;
        if (result.imessage === 'queued') totals.imessageQueued += 1;
      } catch (error) {
        totals.errors += 1;
        logger.warn(`Fresh outreach reconciliation failed for lead ${lead.id}: ${error.message}`);
      }
    }
    return totals;
  }
}

export default new FreshLeadOutreach();
