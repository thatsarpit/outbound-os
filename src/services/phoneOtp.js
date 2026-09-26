/**
 * Phone one-time-code login.
 *
 * Lets a sales agent sign in with their phone number instead of an email and a
 * password they will forget. Issues the same JWT as the password route, so
 * everything downstream — RBAC, pool scoping, the dashboard — is unchanged.
 *
 * ── Security model ──────────────────────────────────────────────────────────
 * A 6-digit code is only 1,000,000 possibilities, so the code itself is never
 * the whole defence. What actually holds:
 *
 *   • The code is NEVER stored — only sha256(code). A database read cannot be
 *     replayed as a login.
 *   • Single use. `consumedAt` is set the moment a code verifies.
 *   • Short TTL (default 5 min).
 *   • Bounded guesses — `maxAttempts` per code, then it is dead. This is what
 *     makes the 6-digit space safe; without it the code length would matter.
 *   • Requesting a new code invalidates every outstanding one for that phone,
 *     so an attacker cannot farm several live codes in parallel.
 *   • Timing-safe comparison.
 *   • Codes are never written to logs outside explicit dev mode.
 *   • Callers must not reveal whether a phone maps to a user (enumeration) —
 *     `requestCode` returns the same shape either way.
 */

import { withDefaultCountryCode } from '../utils/phoneDefaults.js';
import crypto from 'crypto';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';

const CODE_LENGTH = 6;
const TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES) || 5;
const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 5;
/** Max codes per phone per hour — blocks using OTP send as an SMS/WA cannon. */
const MAX_REQUESTS_PER_HOUR = Number(process.env.OTP_MAX_REQUESTS_PER_HOUR) || 5;

/** Echo the code in the API response. Local development only. */
export const DEV_ECHO = process.env.OTP_DEV_ECHO === 'true';

// ── helpers ─────────────────────────────────────────────────────────────────

/** Normalize to bare digits so "+91 98765 43210" and "919876543210" match. */
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/^0+/, '');
}

/**
 * Two numbers are the same person if they match outright, or match once a bare
 * national number is given the workspace's DEFAULT_COUNTRY_CODE, so a user
 * stored as "9876543210" can log in typing the full international number.
 */
export function phonesMatch(a, b) {
  const x = normalizePhone(a);
  const y = normalizePhone(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return withDefaultCountryCode(x) === withDefaultCountryCode(y);
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

/**
 * Cryptographically random digits. Math.random() is predictable from prior
 * outputs and must never generate an auth credential.
 */
function generateCode() {
  const max = 10 ** CODE_LENGTH;
  // Rejection-sample so the modulo does not bias the low digits.
  const limit = Math.floor(0xffffffff / max) * max;
  let n;
  do {
    n = crypto.randomBytes(4).readUInt32BE(0);
  } while (n >= limit);
  return String(n % max).padStart(CODE_LENGTH, '0');
}

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Resolve a user by phone, tolerating country-code differences. */
export async function findUserByPhone(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;

  const exact = await prisma.user.findUnique({ where: { phone } });
  if (exact) return exact;

  // Fall back to a scan over the small set sharing the last 10 digits, so a
  // number saved without its country code still resolves.
  const last10 = phone.slice(-10);
  if (last10.length < 10) return null;
  const candidates = await prisma.user.findMany({
    where: { phone: { endsWith: last10 } },
    take: 10,
  });
  return candidates.find((u) => phonesMatch(phone, u.phone)) || null;
}

// ── request ─────────────────────────────────────────────────────────────────

/**
 * Issue a code for a phone number.
 *
 * @returns {Promise<{issued: boolean, code?: string, reason?: string}>}
 *   `issued` is for the CALLER's internal branching (whether to send a
 *   message) — it must never be surfaced to the client, or the endpoint
 *   becomes a phone-number oracle.
 */
export async function requestCode(rawPhone, { ip = null, purpose = 'login' } = {}) {
  const phone = normalizePhone(rawPhone);
  if (!phone || phone.length < 7) return { issued: false, reason: 'invalid_phone' };

  const user = await findUserByPhone(phone);
  if (!user) return { issued: false, reason: 'no_user' };
  if (!user.enabled) return { issued: false, reason: 'disabled' };

  // Per-phone throttle, independent of the per-IP limiter, so rotating IPs
  // cannot be used to spam one person's phone.
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.phoneOtp.count({
    where: { phone, purpose, createdAt: { gte: since } },
  });
  if (recent >= MAX_REQUESTS_PER_HOUR) {
    logger.warn(`OTP throttled for *${phone.slice(-4)} — ${recent} requests in the last hour`);
    return { issued: false, reason: 'throttled' };
  }

  // Kill outstanding codes so only the newest can ever verify.
  await prisma.phoneOtp.updateMany({
    where: { phone, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateCode();
  await prisma.phoneOtp.create({
    data: {
      phone,
      codeHash: hashCode(code),
      purpose,
      maxAttempts: MAX_ATTEMPTS,
      expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
      requestIp: ip ? String(ip).slice(0, 64) : null,
    },
  });

  // Log the event, never the code.
  logger.info(`🔐 OTP issued for *${phone.slice(-4)} (user ${user.id}, ttl ${TTL_MINUTES}m)`);
  return { issued: true, code, user };
}

// ── verify ──────────────────────────────────────────────────────────────────

/**
 * Check a submitted code.
 * @returns {Promise<{ok: boolean, user?: object, reason?: string}>}
 */
export async function verifyCode(rawPhone, submittedCode, { purpose = 'login' } = {}) {
  const phone = normalizePhone(rawPhone);
  const code = String(submittedCode || '').replace(/\D/g, '');
  if (!phone || !code) return { ok: false, reason: 'invalid' };

  const otp = await prisma.phoneOtp.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) return { ok: false, reason: 'no_pending_code' };

  // NOTE: deliberately not marking consumed here. `consumedAt` means "this code
  // was successfully used". Setting it on expiry would hide the row from the
  // next lookup, so the user's second attempt would report 'no_pending_code'
  // and send them chasing a delivery problem that does not exist.
  if (otp.expiresAt <= new Date()) {
    return { ok: false, reason: 'expired' };
  }

  // Same reasoning as expiry: leave the row visible so every further attempt
  // keeps saying 'too_many_attempts'. The guard itself is what makes the code
  // unusable — it can never reach the comparison below.
  if (otp.attempts >= otp.maxAttempts) {
    logger.warn(`OTP locked out for *${phone.slice(-4)} — attempts exhausted`);
    return { ok: false, reason: 'too_many_attempts' };
  }

  // Count the attempt BEFORE comparing, so a crash mid-verify cannot hand an
  // attacker a free guess.
  const bumped = await prisma.phoneOtp.update({
    where: { id: otp.id },
    data: { attempts: { increment: 1 } },
  });

  if (!timingSafeEqualHex(hashCode(code), otp.codeHash)) {
    const left = Math.max(0, bumped.maxAttempts - bumped.attempts);
    return { ok: false, reason: left === 0 ? 'too_many_attempts' : 'incorrect', attemptsRemaining: left };
  }

  const user = await findUserByPhone(phone);
  if (!user || !user.enabled) return { ok: false, reason: 'no_user' };

  // Burn the code — a verified code must never verify twice.
  await prisma.phoneOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  logger.info(`✅ OTP login for user ${user.id} (*${phone.slice(-4)})`);
  return { ok: true, user };
}

// ── housekeeping ────────────────────────────────────────────────────────────

/** Delete spent and expired rows. Safe to run on a cron. */
export async function pruneExpired(olderThanHours = 24) {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const { count } = await prisma.phoneOtp.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { consumedAt: { lt: cutoff } }] },
  });
  if (count > 0) logger.info(`🧹 Pruned ${count} expired OTP row(s)`);
  return count;
}

export default {
  normalizePhone,
  phonesMatch,
  findUserByPhone,
  requestCode,
  verifyCode,
  pruneExpired,
  DEV_ECHO,
  TTL_MINUTES,
};
