import prisma from '../utils/prismaClient.js';
import campaignEngine from './campaignEngine.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import { isBusinessHours } from '../utils/delay.js';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export const LATE_WINDOW_MS = 60 * 60 * 1000;

export function validateSchedule(input, now = new Date(), hours = config.businessHours) {
  if (!input || typeof input.scheduledAt !== 'string'
    || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.scheduledAt)) {
    throw fail('Choose a date and time with an explicit UTC offset.');
  }
  const date = new Date(input.scheduledAt);
  if (!Number.isFinite(date.getTime()) || date <= now || date - now > 366 * 86400000) {
    throw fail('Choose a future time within the next year.');
  }
  if (typeof input.timezone !== 'string' || input.timezone.length > 100) throw fail('Choose a valid time zone.');
  try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format(date); }
  catch { throw fail('Choose a valid time zone.'); }
  if (!isBusinessHours(hours.start, hours.end, hours.timezone, date)) {
    throw fail(`Choose a time inside workspace sending hours (${hours.start}:00–${hours.end}:00, ${hours.timezone}).`);
  }
  return date;
}

export class CampaignScheduler {
  constructor({ db = prisma, engine = campaignEngine, now = () => new Date(), hours = () => config.businessHours } = {}) {
    Object.assign(this, { db, engine, now, hours });
  }

  async schedule(id, input) {
    const date = validateSchedule(input, this.now(), this.hours());
    return this.db.$transaction(async (tx) => {
      const campaign = await tx.campaign.findUnique({ where: { id } });
      if (!campaign) throw fail('Campaign not found.', 404);
      const missed = campaign.status === 'paused' && campaign.scheduleTimezone && campaign.scheduleError;
      if (!['draft', 'scheduled'].includes(campaign.status) && !missed) throw fail('Only an unstarted campaign can be scheduled.', 409);
      if (campaign.startedAt || await tx.message.count({ where: { campaignId: id } })) throw fail('This campaign already has send attempts. Review it before sending again.', 409);
      const recipients = await tx.campaignLead.count({ where: { campaignId: id } });
      const pending = await tx.campaignLead.count({ where: { campaignId: id, status: 'pending' } });
      if (!pending || pending !== recipients) throw fail('Populate and review an unstarted audience before scheduling.', 409);
      const updated = await tx.campaign.updateMany({ where: { id, status: campaign.status, updatedAt: campaign.updatedAt }, data: {
        status: 'scheduled', scheduledAt: date, scheduleTimezone: input.timezone, scheduleError: null,
      } });
      if (!updated.count) throw fail('Campaign changed. Refresh before scheduling.', 409);
      return tx.campaign.findUnique({ where: { id } });
    });
  }

  async cancel(id) {
    const result = await this.db.campaign.updateMany({ where: { id, status: 'scheduled' }, data: {
      status: 'draft', scheduledAt: null, scheduleTimezone: null, scheduleError: null,
    } });
    if (!result.count) throw fail('Schedule changed or launch already started. Refresh; pause a running campaign to stop remaining sends.', 409);
    return { status: 'draft' };
  }

  async recoverInterrupted() {
    // Called only on single-instance startup, before the due-work loop. Never
    // requeue a provider request whose acceptance might have preceded a crash.
    return this.db.$transaction(async tx => {
      const interrupted = await tx.campaign.findMany({ where: { status: 'running', scheduleTimezone: { not: null } }, select: { id: true } });
      const ids = interrupted.map(x => x.id);
      if (!ids.length) return { paused: 0 };
      await tx.message.updateMany({ where: { campaignId: { in: ids }, status: 'sending' }, data: { status: 'unconfirmed', providerStatusReason: 'interrupted_scheduled_send_review_required' } });
      await tx.campaignLead.updateMany({ where: { campaignId: { in: ids }, status: 'sending' }, data: { status: 'failed', skipReason: 'interrupted_scheduled_send_review_required' } });
      const result = await tx.campaign.updateMany({ where: { id: { in: ids }, status: 'running' }, data: { status: 'paused', scheduleError: 'Scheduled execution was interrupted. Review provider receipts before resuming; no automatic retry was made.' } });
      return { paused: result.count };
    });
  }

  async processDue() {
    const now = this.now();
    const due = await this.db.campaign.findMany({
      where: { status: 'scheduled', scheduleTimezone: { not: null }, scheduledAt: { lte: now } },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: 20,
    });
    for (const campaign of due) {
      const identity = { id: campaign.id, status: 'scheduled', scheduledAt: campaign.scheduledAt, updatedAt: campaign.updatedAt };
      if (now - campaign.scheduledAt > LATE_WINDOW_MS) {
        await this.db.campaign.updateMany({ where: identity, data: { status: 'paused', scheduleError: 'Launch missed by more than one hour. Review the audience and choose a new campaign time.' } });
        continue;
      }
      try {
        // Claim this exact schedule so another worker, cancellation or
        // reschedule cannot reuse this stale due-work snapshot.
        await this.engine.startCampaign(campaign.id, { expectedSchedule: campaign });
      } catch (error) {
        const paused = await this.db.campaign.updateMany({ where: identity, data: { status: 'paused', scheduleError: error.statusCode ? error.message : 'Scheduled launch could not start. Review campaign and sender readiness.' } });
        if (paused.count) logger.warn(`Scheduled campaign ${campaign.id} launch needs review.`);
      }
    }
    return { checked: due.length };
  }
}

export default new CampaignScheduler();
