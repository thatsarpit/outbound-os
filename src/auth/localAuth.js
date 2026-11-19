import { resolveMcpDelegation } from './mcpPersonal.js';
/**
 * Built-in sign-in: email + password against the User table, with a signed
 * session token (JWT). This is the default, so a self-hosted install needs no
 * third-party account. Set AUTH_PROVIDER=clerk to use Clerk instead.
 *
 * Every request re-reads the user row, so disabling someone or changing
 * their role takes effect immediately rather than when their token expires.
 */

import { timingSafeEqual } from 'crypto';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import { hashPassword, matchesSessionPassword, signToken, verifyPassword, verifyToken } from './rbac.js';
import { localPasswordError } from '../../shared/localPassword.js';

const ROLE_LEVELS = { viewer: 0, agent: 1, manager: 2, admin: 3 };

const MCP_SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN || '';

function matchesServiceToken(candidate) {
  if (!MCP_SERVICE_TOKEN || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(MCP_SERVICE_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearerFrom(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function toSessionUser(user) {
  return {
    id: user.id,
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    orgId: 'local',
  };
}

/** Resolve a session token to a live, enabled user, or null. */
async function sessionForToken(token) {
  if (!token) return null;
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } }).catch(() => null);
  if (!user || user.enabled === false || !ROLE_LEVELS.hasOwnProperty(user.role)) return null;
  if (!matchesSessionPassword(payload, user)) return null;
  return { user, expiresAt: payload.exp * 1000 };
}

/** No request-wide middleware is needed for local sessions. */
export function authMiddleware() {
  return (_req, _res, next) => next();
}

export function requireRole(minRole) {
  const minLevel = ROLE_LEVELS[minRole];
  if (minLevel === undefined) throw new Error(`requireRole: unknown role "${minRole}"`);

  return async (req, res, next) => {
    if (await resolveMcpDelegation(req, res, next, minRole)) return;
    const bearer = bearerFrom(req);
    if (matchesServiceToken(bearer)) {
      req.user = { id: 'mcp-service', orgId: 'service', role: 'admin' };
      return next();
    }
    const user = (await sessionForToken(bearer))?.user;
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    if (ROLE_LEVELS[user.role] < minLevel) {
      return res.status(403).json({ error: `Requires ${minRole} role or above.` });
    }
    req.user = toSessionUser(user);
    next();
  };
}

/** Dashboard streams require a user session. Service tokens are handled separately. */
export async function verifyStreamSession(token) {
  const session = await sessionForToken(token);
  return session ? { expiresAt: session.expiresAt } : null;
}

export async function currentUserPayload(req) {
  return req.user || null;
}

/** POST /api/auth/login */
export async function login(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = await prisma.user.findUnique({ where: { email } }).catch(() => null);
  // One message for every failure so the response does not reveal which
  // emails have accounts.
  if (!user || user.enabled === false || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    logger.warn(`Sign-in failed for ${email.replace(/^(.).*@/, '$1***@')} from ${req.ip}`);
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
  res.json({ token: signToken(user), user: toSessionUser(user) });
}

/** POST /api/auth/change-password — the signed-in user changes their own password. */
export async function changePassword(req, res) {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = req.body?.newPassword;
  const policyError = localPasswordError(newPassword);
  if (policyError) return res.status(400).json({ error: policyError });
  const user = await prisma.user.findUnique({ where: { id: Number(req.user?.id) } }).catch(() => null);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(403).json({ error: 'Current password is incorrect.' });
  }
  const passwordHash = hashPassword(newPassword);
  const updated = await prisma.user.updateMany({
    where: { id: user.id, passwordHash: user.passwordHash, enabled: true },
    data: { passwordHash },
  });
  if (updated.count !== 1) {
    return res.status(409).json({ error: 'The account changed while saving. Sign in again and retry.' });
  }
  res.json({ ok: true, token: signToken({ ...user, passwordHash }), user: toSessionUser(user) });
}

export default { authMiddleware, requireRole, verifyStreamSession, currentUserPayload, login, changePassword };
