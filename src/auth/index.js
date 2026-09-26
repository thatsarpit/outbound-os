/**
 * Which sign-in system this install uses.
 *
 *   local  (default) email + password stored in this database. Nothing to
 *          sign up for; the first admin is created on first boot.
 *   clerk  Clerk-hosted sign-in with Organizations for roles. Needs
 *          CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY.
 *
 * AUTH_PROVIDER picks one explicitly. When it is unset, an install that
 * already has CLERK_SECRET_KEY keeps using Clerk, so upgrading never
 * silently changes how people sign in.
 *
 * Both implementations expose the same functions, and both accept the
 * MCP_SERVICE_TOKEN bearer for trusted backend callers.
 */

export const AUTH_PROVIDER = (
  process.env.AUTH_PROVIDER || (process.env.CLERK_SECRET_KEY ? 'clerk' : 'local')
).toLowerCase() === 'clerk' ? 'clerk' : 'local';

const impl = AUTH_PROVIDER === 'clerk'
  ? await import('./clerkAuth.js')
  : await import('./localAuth.js');

export const authMiddleware = AUTH_PROVIDER === 'clerk' ? impl.clerkMiddleware : impl.authMiddleware;
export const requireRole = impl.requireRole;
export const verifyQueryToken = impl.verifyQueryToken;
export const currentUserPayload = impl.currentUserPayload;
/** Clerk's backend client, or null on local auth. */
export const clerkClient = AUTH_PROVIDER === 'clerk' ? impl.clerkClient : null;
/** Local-only route handlers; undefined on Clerk. */
export const localLogin = AUTH_PROVIDER === 'local' ? impl.login : undefined;
export const localChangePassword = AUTH_PROVIDER === 'local' ? impl.changePassword : undefined;

/** Public, unauthenticated: what the dashboard needs to render its sign-in. */
export function publicAuthConfig() {
  return AUTH_PROVIDER === 'clerk'
    ? { provider: 'clerk', clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || '' }
    : { provider: 'local' };
}
