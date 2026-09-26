import { withTenant, withPlatformScope } from './tenantContext.js';

/**
 * Express middleware that opens a tenant context for the request.
 *
 * This is the bridge between "who is calling" and "what data they may touch".
 * It must run AFTER authentication (it reads `req.user`) and BEFORE any route
 * that queries tenant-owned data.
 *
 * The whole request continues inside `withTenant`, so every query the handler
 * makes — however deep in the service layer — is scoped without the handler
 * knowing anything about tenancy.
 *
 * A note on `next()` inside AsyncLocalStorage: `storage.run()` returns when the
 * synchronous part of `next()` returns, but the context persists for anything
 * awaited inside it, which is what Express handlers do. Calling `next()` as the
 * callback (rather than awaiting the whole chain) is the documented pattern.
 */

/**
 * Paths that legitimately run without a tenant.
 *
 * Auth happens before a tenant is known. Health checks must answer when the
 * database is unreachable. Platform admin spans tenants by definition.
 */
const TENANTLESS_PREFIXES = [
  '/api/auth/',
  '/api/platform/',
  '/healthz',
  '/api/system/health',
];

function isTenantless(path) {
  return TENANTLESS_PREFIXES.some((p) => path === p || path.startsWith(p));
}

/**
 * @param {object} [options]
 * @param {(req: any) => number|null} [options.resolveTenantId]
 *   How to find the tenant for a request. Defaults to the JWT claim. Override
 *   to support subdomain routing or platform staff impersonating a tenant.
 */
export function tenantContextMiddleware(options = {}) {
  const resolve = options.resolveTenantId ?? ((req) => req.user?.tenantId ?? null);

  return function tenantContext(req, res, next) {
    if (req.method === 'OPTIONS') return next();

    if (isTenantless(req.path)) {
      // Deliberately unscoped rather than merely absent: platform routes should
      // read across tenants, and doing so explicitly keeps the scoping
      // extension from throwing on them.
      return withPlatformScope(() => next());
    }

    const tenantId = resolve(req);

    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      // Fail closed. Without a tenant the request cannot be answered safely,
      // and continuing would either throw deeper in the stack (confusing) or
      // — if scoping were ever disabled — leak across tenants.
      return res.status(403).json({
        error: 'No workspace resolved for this request.',
        detail:
          'The signed-in user is not associated with a workspace. Sign out and back in, or contact support.',
      });
    }

    return withTenant(tenantId, () => next());
  };
}
