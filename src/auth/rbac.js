/**
 * RBAC — Role-Based Access Control
 *
 * Roles (ascending permission):
 *   viewer  — read-only (GET leads, messages, stats)
 *   agent   — viewer + send messages, add notes/tasks
 *   manager — agent + campaigns, bulk actions, import/export
 *   admin   — manager + user management, env config, system settings
 *
 * JWT payload: { sub: userId, email, name, role, iat, exp }
 *
 * Password hashing, session tokens and the first-admin seed. The role guards
 * themselves are in auth/index.js.
 */

import '../bootstrapEnv.js';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';

// Outside production a missing secret gets a random one per process, not a
// constant: a constant in public source lets anyone mint a valid admin token
// for any install that forgot to set it. Sessions just end on restart.
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('JWT_SECRET must be set in production'); })()
  : randomBytes(32).toString('hex'));
const JWT_EXPIRY = '7d';
const LEGACY_KEYLEN = 64;
const MODERN_SCRYPT_MIN_MAXMEM = 64 * 1024 * 1024;


// ── Password helpers (scrypt, no external deps) ──────────────────────────────

function getScryptMaxmem(cost, blockSize, parallelization) {
  const required = 128 * cost * blockSize * Math.max(parallelization, 1);
  return Math.max(required * 2, MODERN_SCRYPT_MIN_MAXMEM);
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, LEGACY_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyLegacyPassword(password, stored) {
  const [salt, storedHash] = String(stored || '').split(':');
  if (!salt || !storedHash) return false;

  const expected = Buffer.from(storedHash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function verifyModernPassword(password, stored) {
  const [algorithm, costRaw, blockSizeRaw, parallelizationRaw, salt, expectedHex] = String(stored || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;

  const cost = Number(costRaw);
  const blockSize = Number(blockSizeRaw);
  const parallelization = Number(parallelizationRaw);
  if (!Number.isFinite(cost) || !Number.isFinite(blockSize) || !Number.isFinite(parallelization)) return false;

  const expected = Buffer.from(expectedHex, 'hex');
  const actual = scryptSync(password, salt, expected.length, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: getScryptMaxmem(cost, blockSize, parallelization),
  });

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyPassword(password, stored) {
  const value = String(password || '');
  const encoded = String(stored || '');
  if (!value || !encoded) return false;

  if (encoded.startsWith('scrypt$')) return verifyModernPassword(value, encoded);
  if (encoded.includes(':')) return verifyLegacyPassword(value, encoded);
  return false;
}

// ── Token helpers ─────────────────────────────────────────────────────────────

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Route guards live in auth/index.js (built-in sign-in or Clerk). The
// requireRole that used to be here was no longer mounted anywhere, and it
// still accepted a shared admin password in a header or ?pass= query string;
// it was removed so it cannot be wired back in by mistake.

// ── Pool-scoped authorization ─────────────────────────────────────────────────
//
// A platform admin (User.role === 'admin') bypasses all pool checks — used
// for ops / support work. Every other user must have a UserPool row for the
// pool they're trying to read or write.
//
// Caching: pool memberships rarely change, so we cache them on req.user for
// the duration of a single request. The cache lives in req.user._poolIds.

/**
 * Returns the pool ids the user can read.
 *
 * Returns `null` for platform admins to mean "unrestricted, no pool filter
 * needed" — caller should skip the WHERE clause entirely. Returns an array
 * (possibly empty) for everyone else, intended to be used in
 * `where: { poolId: { in: <result> } }`.
 *
 * Cached on req.user._poolIds for the request lifetime.
 */
/**
 * Lead pools were removed; provenance is expressed with tags instead. These
 * helpers remain so existing call sites keep compiling, but they scope
 * nothing.
 *
 * They previously narrowed every lead query to the caller's UserPool rows.
 * That table was empty, so any non-admin resolved to an empty id list and saw
 * no leads at all — returning "no scoping" is both the removal and the fix.
 */
export async function getAccessiblePoolIds(_req) {
  return null;
}

/** No-op scope fragment. Kept for call-site compatibility. */
export async function buildPoolScopeWhere(_req, _key = null) {
  return {};
}

/** Every authenticated user can reach every lead now. */
export async function userCanAccessPool(_req, _poolId) {
  return true;
}

/**
 * Express middleware: 403 if the request references a pool the user can't
 * access. Reads the pool id from req.params.id, req.params.poolId,
 * req.body.poolId, or req.query.poolId — in that priority order. If no
 * poolId is supplied at all, the middleware lets the request through, and
 * the handler is expected to scope its own queries via getAccessiblePoolIds.
 */
export function requirePoolAccess() {
  return (_req, _res, next) => next();
}
/**
 * Express middleware: 403 when the lead referenced by req.params[paramName]
 * (default 'id') is in a pool the user can't access. Use on per-lead detail
 * routes (PATCH /api/leads/:id, POST /api/leads/:id/send, etc.). Caches the
 * resolved lead on req.lead so the handler doesn't need to refetch.
 */
export function requireLeadAccess(paramName = 'id') {
  return async (req, res, next) => {
    const id = parseInt(req.params?.[paramName]);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid lead id' });
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: { id: true, name: true, mobile: true, email: true, poolId: true, status: true, assignedToId: true },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    // Pool gating removed with lead pools. It used to 403 any lead with a null
    // poolId for non-admins, which covered every imported lead.
    req.lead = lead;
    return next();
  };
}

// ── Seed: ensure at least one admin user exists ───────────────────────────────

export async function ensureDefaultAdmin() {
  const count = await prisma.user.count();
  if (count > 0) return;

  // Never fall back to a fixed password: the source is public, so a constant
  // here would be a working login on every install that skipped the env var.
  // Generate one instead and show it once, the way the first boot of most
  // self-hosted tools does.
  const configuredPass = process.env.ADMIN_PASSWORD || process.env.DASHBOARD_PASSWORD;
  const defaultPass = configuredPass || randomBytes(18).toString('base64url');
  const defaultEmail = process.env.ADMIN_EMAIL
    || process.env.DASHBOARD_ADMIN_EMAIL
    || process.env.REPORTS_ADMIN_EMAIL
    || 'admin@example.com';
  const defaultName = process.env.ADMIN_FULL_NAME || 'Outbound OS Admin';
  const admin = await prisma.user.create({
    data: {
      name: defaultName,
      email: defaultEmail.toLowerCase(),
      passwordHash: hashPassword(defaultPass),
      role: 'admin',
    },
  });
  if (configuredPass) {
    logger.info(`👤 First admin created: ${admin.email} (password from ADMIN_PASSWORD)`);
  } else {
    logger.warn(`👤 First admin created: ${admin.email} with generated password ${defaultPass} — sign in and change it now. It will not be shown again.`);
  }
}
