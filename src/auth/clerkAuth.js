/**
 * Clerk-backed replacement for rbac.js's requireRole().
 *
 * Deliberately not wired into src/api.js yet. The 169 existing call sites
 * — requireRole('viewer'|'agent'|'manager'|'admin') across api.js and every
 * route file — all import from ./rbac.js. Cutover is a single import-line
 * change in src/api.js once a real Clerk app exists and a real login has
 * been verified end to end; until then rbac.js keeps running the live
 * system untouched, so there is a working login for every commit in between.
 *
 * Role model: Clerk Organizations. Each company is one Clerk Organization;
 * each person's org membership carries one of four custom roles created in
 * the Clerk dashboard (Organization settings -> Roles), matching the
 * existing hierarchy exactly so nothing downstream has to change:
 *
 *   org:viewer | org:agent | org:manager | org:admin
 *
 * Custom organization roles are a paid-plan feature on some Clerk tiers —
 * confirm current pricing when creating the app, before assuming this is
 * free. If the plan does not support renaming/adding roles, Clerk still
 * ships two built-in ones (org:admin, org:member); ROLE_MAP below is the
 * only place that would need to change to fall back to a 2-tier mapping.
 */
import { timingSafeEqual } from 'crypto';
import { clerkMiddleware, getAuth, clerkClient, verifyToken } from '@clerk/express';
import logger from '../utils/logger.js';

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

// Clerk's org role slug -> this app's role vocabulary. Update the left side
// if the roles get created under different slugs in the Clerk dashboard.
const ORG_ROLE_TO_APP_ROLE = {
  'org:viewer': 'viewer',
  'org:agent': 'agent',
  'org:manager': 'manager',
  'org:admin': 'admin',
  // Fallback so an org that only has Clerk's two built-in roles (on plans
  // without custom roles) still resolves to something rather than 403ing
  // everyone. Admin here is deliberately the safer-to-audit direction:
  // an under-provisioned org:member reads as full access rather than none,
  // which is loud and gets noticed, vs. silently locking everyone out.
  'org:member': 'agent',
};

function appRoleFor(clerkOrgRole) {
  return ORG_ROLE_TO_APP_ROLE[clerkOrgRole] || null;
}

/** Mount once, near the top of the middleware chain, before any route. */
export { clerkMiddleware };

/**
 * Same contract as rbac.js's requireRole: returns Express middleware that
 * 403s unless the caller's org role is at or above `minRole`. Call sites do
 * not change when this eventually replaces the rbac.js import.
 */
export function requireRole(minRole) {
  const minLevel = ROLE_LEVELS[minRole];
  if (minLevel === undefined) {
    throw new Error(`requireRole: unknown role "${minRole}"`);
  }

  // Deliberately not Clerk's own requireAuth(): it is deprecated specifically
  // because it 302-redirects an unauthenticated request to a hosted sign-in
  // page. For a JSON API that is a real bug, not a style choice — fetch()
  // follows redirects silently, so the frontend's 401 handling never fires
  // and it reads the sign-in page's HTML as if it were the API response.
  // Clerk's own migration note for this exact deprecation is getAuth() plus
  // a manual 401, which is what this does.
  return (req, res, next) => {
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
    const appRole = appRoleFor(auth.orgRole);
    if (!appRole) {
      logger.warn(`Clerk auth: unrecognized org role "${auth.orgRole}" for user ${auth.userId}`);
      return res.status(403).json({ error: 'Your account role is not recognized.' });
    }
    if (ROLE_LEVELS[appRole] < minLevel) {
      return res.status(403).json({ error: `Requires ${minRole} role or above.` });
    }
    req.user = { id: auth.userId, orgId: auth.orgId, role: appRole };
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
    return {
      userId: claims.sub,
      orgId: claims.org_id || null,
      role: appRoleFor(claims.org_role),
    };
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
