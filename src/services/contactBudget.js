/**
 * Send-time gate for the cross-channel contact budget.
 *
 * The Message table is already the contact ledger — every channel writes its
 * outbound rows there — so the budget derives from message history instead of
 * keeping a parallel count that could drift. Callers are the automated send
 * paths (follow-up queue, email queue, campaign dispatch); manual sends and
 * the sanctioned first-touch burst never pass through this gate.
 */
import prisma from '../utils/prismaClient.js';
import config from '../config.js';
import { evaluateContactBudget, touchTime, TOUCH_STATUSES, WEEK_MS } from '../utils/contactBudget.js';

/**
 * May automation touch this lead right now?
 *
 * @param {{ id: number, createdAt: Date|string }} lead the live lead row
 * @param {{ now?: Date, excludeCampaignId?: number|null, db?: object }} options
 *   `excludeCampaignId` keeps a multi-channel campaign from blocking its own
 *   second channel: rows the same campaign just wrote are not prior contact.
 * @returns {Promise<{allowed: true} | {allowed: false, reason: string, nextEligibleAt: Date}>}
 */
export async function contactBudgetGate(lead, { now = new Date(), excludeCampaignId = null, db = prisma } = {}) {
  const cfg = config.contactBudget;
  if (!cfg.enabled || !lead?.id) return { allowed: true };

  // A brand-new enquiry's first day is sanctioned burst territory: the product
  // deliberately reaches a fresh lead on several channels at once, and HOT
  // follow-ups deliberately arrive within hours. The budget governs the days
  // after that. Touches made during the exempt period also do not count later,
  // or the day-one burst would consume day two's whole budget.
  const createdAt = new Date(lead.createdAt || 0).getTime();
  const exemptUntil = Number.isFinite(createdAt) && createdAt > 0
    ? createdAt + Math.max(0, cfg.exemptFirstHours) * 60 * 60 * 1000 : 0;
  if (now.getTime() < exemptUntil) return { allowed: true };

  const since = new Date(now.getTime() - WEEK_MS);
  const touches = await db.message.findMany({
    where: {
      leadId: lead.id,
      direction: 'outbound',
      status: { in: TOUCH_STATUSES },
      AND: [
        { OR: [{ sentAt: { gte: since } }, { sentAt: null, createdAt: { gte: since } }] },
        // `campaignId: { not: n }` alone would also drop NULL rows (SQL
        // three-valued logic), silently uncounting every non-campaign touch.
        ...(excludeCampaignId
          ? [{ OR: [{ campaignId: null }, { campaignId: { not: excludeCampaignId } }] }]
          : []),
      ],
    },
    select: { sentAt: true, createdAt: true },
  });

  return evaluateContactBudget(
    touches.filter((row) => touchTime(row) >= exemptUntil),
    { now, maxPerDay: cfg.maxPerDay, maxPerWeek: cfg.maxPerWeek, minGapMinutes: cfg.minGapMinutes },
  );
}

export default { contactBudgetGate };
