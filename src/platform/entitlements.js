import prisma from '../utils/prismaClient.js';
import { requireTenantId } from './tenantContext.js';

/**
 * Plan entitlements.
 *
 * A `Plan` row carries limits — seats, sender numbers, mailboxes, monthly
 * messages. Without something to read them they are decoration on a pricing
 * page, and the first customer to exceed their plan simply keeps going.
 *
 * Two things happen here:
 *   - `checkLimit` answers "may this tenant do one more of X?" before the act
 *   - `recordUsage` counts what was actually done, for metering and overage
 *
 * Both are deliberately cheap to call. An entitlement check that requires
 * three joins gets skipped at the call sites that matter most.
 */

/** Metric keys. Strings are used in the DB, so they are fixed here once. */
export const METRIC = {
  SEATS: 'seats',
  WHATSAPP_NUMBERS: 'whatsapp_numbers',
  MAILBOXES: 'mailboxes',
  MONTHLY_MESSAGES: 'monthly_messages',
  LEADS: 'leads',
};

/** Which Plan column caps which metric. Null cap means unlimited. */
const LIMIT_COLUMN = {
  [METRIC.SEATS]: 'maxSeats',
  [METRIC.WHATSAPP_NUMBERS]: 'maxWhatsAppNumbers',
  [METRIC.MAILBOXES]: 'maxMailboxes',
  [METRIC.MONTHLY_MESSAGES]: 'maxMonthlyMessages',
  [METRIC.LEADS]: 'maxLeads',
};

/** Subscription states that entitle a tenant to use the product. */
const ENTITLED_STATUSES = new Set(['trialing', 'active']);

export class EntitlementError extends Error {
  constructor(metric, limit, current) {
    super(`Plan limit reached for ${metric}: ${current}/${limit}`);
    this.name = 'EntitlementError';
    this.metric = metric;
    this.limit = limit;
    this.current = current;
    /** Payment Required — the correct signal for "upgrade to continue". */
    this.statusCode = 402;
  }
}

/** Start of the current calendar month, UTC. The period usage aggregates into. */
export function currentPeriodStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * The tenant's live subscription with its plan, or null.
 * A tenant with no entitled subscription is not simply "on the free plan" —
 * callers decide what that means, because the answer differs between a trial
 * that lapsed and an account that never subscribed.
 */
export async function getActiveSubscription(tenantId = requireTenantId()) {
  const subs = await prisma.subscription.findMany({
    where: { tenantId, status: { in: [...ENTITLED_STATUSES] } },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  return subs[0] ?? null;
}

/**
 * Current consumption of a metric.
 *
 * Counted metrics (seats, numbers, mailboxes) are counted live, because the
 * truth is the row count and a cached number drifts. Volume metrics
 * (messages) read from UsageRecord, because counting every message sent this
 * month on each send would not scale.
 */
export async function getUsage(metric, tenantId = requireTenantId()) {
  switch (metric) {
    case METRIC.SEATS:
      return prisma.userPool.count({ where: { tenantId } });
    case METRIC.WHATSAPP_NUMBERS:
      return prisma.whatsAppAccount.count({ where: { tenantId, enabled: true } });
    case METRIC.MAILBOXES:
      return prisma.emailAccount.count({ where: { tenantId, enabled: true } });
    case METRIC.LEADS:
      return prisma.lead.count({ where: { tenantId } });
    case METRIC.MONTHLY_MESSAGES: {
      const record = await prisma.usageRecord.findUnique({
        where: {
          tenantId_metric_periodStart: {
            tenantId,
            metric,
            periodStart: currentPeriodStart(),
          },
        },
      });
      return record?.quantity ?? 0;
    }
    default:
      throw new Error(`Unknown metric: ${metric}`);
  }
}


/**
 * The entitlement decision, with no I/O.
 *
 * Separated so the rules can be tested directly. The subtle case is `limit
 * === null`, which means unlimited — read as a numeric zero it would deny
 * every action on an uncapped plan, which is the worst possible failure: a
 * paying customer on the top tier blocked from sending anything.
 */
export function evaluateLimit({ hasSubscription, limit, current, amount = 1 }) {
  if (!hasSubscription) {
    return { allowed: false, reason: 'no_active_subscription', limit: 0, current: 0, remaining: 0 };
  }
  if (limit === null || limit === undefined) {
    return { allowed: true, reason: 'unlimited', limit: null, current: null, remaining: null };
  }
  const allowed = current + amount <= limit;
  return {
    allowed,
    reason: allowed ? 'within_limit' : 'limit_reached',
    limit,
    current,
    remaining: Math.max(0, limit - current),
  };
}

/**
 * May this tenant consume `amount` more of `metric`?
 *
 * Returns a verdict rather than throwing, so callers can surface a useful
 * message or degrade gracefully. Use `enforceLimit` when the action must stop.
 */
export async function checkLimit(metric, amount = 1, tenantId = requireTenantId()) {
  const column = LIMIT_COLUMN[metric];
  if (!column) throw new Error(`Unknown metric: ${metric}`);

  const subscription = await getActiveSubscription(tenantId);
  if (!subscription) return evaluateLimit({ hasSubscription: false });

  const limit = subscription.plan?.[column] ?? null;
  // Skip the usage query entirely when the plan is uncapped.
  if (limit === null || limit === undefined) {
    return evaluateLimit({ hasSubscription: true, limit: null, current: null, amount });
  }

  const current = await getUsage(metric, tenantId);
  return evaluateLimit({ hasSubscription: true, limit, current, amount });
}

/** checkLimit, but throws EntitlementError (402) when the answer is no. */
export async function enforceLimit(metric, amount = 1, tenantId = requireTenantId()) {
  const verdict = await checkLimit(metric, amount, tenantId);
  if (!verdict.allowed) {
    throw new EntitlementError(metric, verdict.limit, verdict.current);
  }
  return verdict;
}

/**
 * Record consumption of a volume metric.
 *
 * Upsert-and-increment so concurrent sends do not lose counts to a
 * read-modify-write race.
 */
export async function recordUsage(metric, quantity = 1, tenantId = requireTenantId()) {
  const periodStart = currentPeriodStart();
  return prisma.usageRecord.upsert({
    where: { tenantId_metric_periodStart: { tenantId, metric, periodStart } },
    create: { tenantId, metric, periodStart, quantity },
    update: { quantity: { increment: quantity } },
  });
}
