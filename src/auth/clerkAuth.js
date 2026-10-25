import { resolveMcpDelegation } from './mcpPersonal.js';
/** Clerk authentication for this single-workspace installation.
 * Built-in org:admin maps to admin and org:member maps to sales agent.
 * Existing custom roles remain readable while old memberships are migrated.
 */
import { timingSafeEqual } from 'crypto';
import { clerkMiddleware, getAuth, clerkClient, verifyToken } from '@clerk/express';
import logger from '../utils/logger.js';
import { appRoleFromOrgRole as appRoleFor } from '../../shared/clerkRoles.js';
import { clerkWorkspaceIdentity, clerkSessionIdentity } from './clerkIdentity.js';

// Static bearer token for the MCP server (and any other trusted backend-to-
// backend caller) — Clerk sessions are browser-issued and short-lived, and
// an MCP client running unattended on someone's phone has no browser to hold
// one. This is the one deliberate bypass of the Clerk gate below: a single
// long random secret, compared in constant time, mapped to a fixed identity
// at admin level. Unset by default, so a deployment that never configures it
// gets no bypass at all.
const MCP_SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN || '';

function matchesServiceToken(candidate) {
  if (!MCP_SERVICE_TOKEN || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(MCP_SERVICE_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Same hierarchy as rbac.js, duplicated rather than imported: this file must
// keep working even after rbac.js is eventually deleted post-cutover.
const ROLE_LEVELS = { viewer: 0, agent: 1, manager: 2, admin: 3 };

/** Mount once, near the top of the middleware chain, before any route. */
export { clerkMiddleware };

/**
 * Same contract as rbac.js's requireRole: returns Express middleware that
 * 403s unless the caller's org role is at or above `minRole`. Call sites do
 * not change when this eventually replaces the rbac.js import.
 */
export function requireRole(minRole) {
  const minLevel = ROLE_LEVELS[minRole];
  if (!Object.hasOwn(ROLE_LEVELS, minRole)) {
    throw new Error(`requireRole: unknown role "${minRole}"`);
  }

  // Deliberately not Clerk's own requireAuth(): it is deprecated specifically
  // because it 302-redirects an unauthenticated request to a hosted sign-in
  // page. For a JSON API that is a real bug, not a style choice — fetch()
  // follows redirects silently, so the frontend's 401 handling never fires
  // and it reads the sign-in page's HTML as if it were the API response.
  // Clerk's own migration note for this exact deprecation is getAuth() plus
  // a manual 401, which is what this does.
  return async (req, res, next) => {
    if (await resolveMcpDelegation(req, res, next, minRole)) return;
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (matchesServiceToken(bearer)) {
      req.user = { id: 'mcp-service', orgId: 'service', role: 'admin' };
      return next();
    }

    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({ error: 'Not signed in.' });
    }
    if (!auth.orgId) {
      return res.status(403).json({ error: 'No active organization for this session.' });
    }
    const identity = clerkWorkspaceIdentity(auth);
    const appRole = identity?.role;
    if (!appRole) {
      logger.warn(`Clerk auth: unrecognized org role "${auth.orgRole}" for user ${auth.userId}`);
      return res.status(403).json({ error: 'Your organization or account role is not authorized for this workspace.' });
    }
    if (ROLE_LEVELS[appRole] < minLevel) {
      return res.status(403).json({ error: `Requires ${minRole} role or above.` });
    }
    req.user = { id: identity.userId, orgId: identity.orgId, role: appRole };
    next();
  };
}

/**
 * Verify a Clerk session token passed as a query string parameter, for the
 * one connection type that cannot carry an Authorization header: EventSource
 * (SSE). Everything else goes through requireRole()/requireAuth() instead.
 *
 * @param {string} token
 * @returns {Promise<{userId: string, orgId: string|null, role: string|null}|null>}
 */
export async function verifyQueryToken(token) {
  if (!token) return null;
  try {
    const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    return clerkSessionIdentity(claims);
  } catch (error) {
    logger.warn(`SSE token verification failed: ${error.message}`);
    return null;
  }
}

/** Shape matches the old GET /api/auth/me response, for a like-for-like swap. */
export async function currentUserPayload(req) {
  const auth = getAuth(req);
  if (!auth?.userId) return null;
  const user = await clerkClient.users.getUser(auth.userId);
  return {
    sub: auth.userId,
    email: user.primaryEmailAddress?.emailAddress || '',
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || '',
    role: appRoleFor(auth.orgRole),
    orgId: auth.orgId,
  };
}

export { clerkClient };
export default { clerkMiddleware, requireRole, currentUserPayload, verifyQueryToken, clerkClient };
