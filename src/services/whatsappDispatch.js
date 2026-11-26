import config from '../config.js';
import prisma from '../utils/prismaClient.js';
import { workspaceTimezone, zonedParts, zonedTimeToUtc } from '../utils/workspaceTime.js';

const HOUR_MS = 60 * 60 * 1000;
const RETENTION_MS = 4 * 24 * HOUR_MS;
const positiveLimit = (value, fallback) => Number.isSafeInteger(value) && value > 0 ? value : fallback;

const quotaReasons = {
  whatsapp_hourly_limit: 'This WhatsApp sender has reached its limit for the last hour.',
  whatsapp_daily_limit: 'This WhatsApp sender has reached its limit for the workspace day.',
};
export function whatsappQuotaMessage(reason) {
  return Object.hasOwn(quotaReasons, reason) ? quotaReasons[reason] : undefined;
}

function windows(now) {
  const zone = workspaceTimezone();
  const { year, month, day } = zonedParts(now, zone);
  return {
    hourSince: new Date(now.getTime() - HOUR_MS + 1),
    daySince: zonedTimeToUtc(year, month, day, 0, 0, zone),
    nextDay: zonedTimeToUtc(year, month, day + 1, 0, 0, zone),
  };
}

export function whatsappDispatchLimits(account) {
  return {
    hourlyLimit: positiveLimit(account.hourlyLimit, positiveLimit(config.whatsapp.hourlyLimit, 2)),
    dailyLimit: positiveLimit(account.dailyLimit, positiveLimit(config.whatsapp.maxMessagesPerDay, 20)),
  };
}

export async function whatsappDispatchUsage(account, now = new Date(), db = prisma) {
  const { hourSince, daySince } = windows(now);
  const [hourlyUsed, dailyUsed] = await Promise.all([hourSince, daySince].map(attemptedAt =>
    db.whatsAppDispatch.count({ where: { accountId: account.id, attemptedAt: { gte: attemptedAt } } })));
  const limits = whatsappDispatchLimits(account);
  return { hourlyUsed, dailyUsed, ...limits };
}

export async function reserveWhatsAppDispatch(accountId, now = new Date(), db = prisma) {
  const { hourSince, daySince, nextDay } = windows(now);
  const defaultLimits = whatsappDispatchLimits({});
  // A single SQLite write checks both counts and inserts the reservation.
  // Separate count and insert calls could let two workers take the last slot.
  const inserted = await db.$executeRaw`
    INSERT INTO "WhatsAppDispatch" ("accountId", "attemptedAt")
    SELECT account."id", ${now.getTime()}
    FROM "WhatsAppAccount" AS account
    WHERE account."id" = ${accountId} AND account."enabled" = 1
      AND (SELECT COUNT(*) FROM "WhatsAppDispatch"
           WHERE "accountId" = account."id" AND "attemptedAt" >= ${hourSince.getTime()})
          < CASE WHEN account."hourlyLimit" > 0 THEN account."hourlyLimit" ELSE ${defaultLimits.hourlyLimit} END
      AND (SELECT COUNT(*) FROM "WhatsAppDispatch"
           WHERE "accountId" = account."id" AND "attemptedAt" >= ${daySince.getTime()})
          < CASE WHEN account."dailyLimit" > 0 THEN account."dailyLimit" ELSE ${defaultLimits.dailyLimit} END
  `;
  if (inserted) return { reserved: true };

  const account = await db.whatsAppAccount.findUnique({ where: { id: accountId } });
  if (!account?.enabled) return { reserved: false, reason: 'account_not_ready' };
  const { hourlyUsed, dailyUsed, hourlyLimit, dailyLimit } = await whatsappDispatchUsage(account, now, db);
  if (dailyUsed >= dailyLimit) return { reserved: false, reason: 'whatsapp_daily_limit', retryAt: nextDay };

  // Account settings may have changed since the atomic check. The caller can
  // retry later, but this invocation must not submit without a reservation.
  const oldest = await db.whatsAppDispatch.findFirst({
    where: { accountId, attemptedAt: { gte: hourSince } },
    orderBy: [{ attemptedAt: 'asc' }, { id: 'asc' }],
    skip: Math.max(0, hourlyUsed - hourlyLimit),
  });
  return {
    reserved: false,
    reason: 'whatsapp_hourly_limit',
    retryAt: new Date(oldest ? oldest.attemptedAt.getTime() + HOUR_MS : now.getTime() + 60_000),
  };
}

export function pruneWhatsAppDispatches(now = new Date(), db = prisma) {
  return db.whatsAppDispatch.deleteMany({ where: { attemptedAt: { lt: new Date(now.getTime() - RETENTION_MS) } } });
}
