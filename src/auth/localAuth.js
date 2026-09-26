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
import { hashPassword, signToken, verifyPassword, verifyToken } from './rbac.js';

const ROLE_LEVELS = { viewer: 0, agent: 1, manager: 2, admin: 3 };
const MIN_PASSWORD_LENGTH = 10;

const MCP_SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN || '';

function matchesServiceToken(candidate) {
  if (!MCP_SERVICE_TOKEN || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(MCP_SERVICE_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearerFrom(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  // EventSource cannot set headers, so the live-updates stream sends its token
  // in the query string. Accepted for that one path only, so tokens do not
  // start appearing in URLs (and logs) anywhere else.
  const path = (req.originalUrl || '').split('?')[0];
  if (req.method === 'GET' && path === '/api/events' && typeof req.query?.token === 'string') {
    return req.query.token;
  }
  return '';
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
async function userForToken(token) {
  if (!token) return null;
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } }).catch(() => null);
  if (!user || user.enabled === false || !ROLE_LEVELS.hasOwnProperty(user.role)) return null;
  return user;
}

/** No request-wide middleware is needed for local sessions. */
export function authMiddleware() {
  return (_req, _res, next) => next();
}

export function requireRole(minRole) {
  const minLevel = ROLE_LEVELS[minRole];
  if (minLevel === undefined) throw new Error(`requireRole: unknown role "${minRole}"`);

  return async (req, res, next) => {
    const bearer = bearerFrom(req);
    if (matchesServiceToken(bearer)) {
      req.user = { id: 'mcp-service', orgId: 'service', role: 'admin' };
      return next();
    }
    const user = await userForToken(bearer);
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    if (ROLE_LEVELS[user.role] < minLevel) {
      return res.status(403).json({ error: `Requires ${minRole} role or above.` });
    }
    req.user = toSessionUser(user);
    next();
  };
}

/** EventSource cannot send headers, so the SSE route passes the token in the query. */
export async function verifyQueryToken(token) {
  const user = await userForToken(token);
  return user ? { userId: user.id, orgId: 'local', role: user.role } : null;
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
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
  }
  const user = await prisma.user.findUnique({ where: { id: Number(req.user?.id) } }).catch(() => null);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(newPassword) } });
  res.json({ ok: true });
}

export default { authMiddleware, requireRole, verifyQueryToken, currentUserPayload, login, changePassword };
