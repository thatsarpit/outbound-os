import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Ambient tenant context.
 *
 * The platform has ~750 Prisma call sites across 32 files, none of which take a
 * tenant argument. Threading one through every signature would be a months-long
 * change with a mistake in it — and a single missed call site leaks one
 * customer's data to another.
 *
 * So the tenant travels out-of-band. An Express middleware opens a context per
 * request; `tenantScope` (the Prisma extension) reads it and scopes every query
 * automatically. Services stay unaware, which is the point: code that cannot
 * see the tenant cannot forget to filter by it.
 *
 * AsyncLocalStorage survives await boundaries, so the context holds across the
 * async chains these services are built from.
 */

const storage = new AsyncLocalStorage();

/** Marker for work that is deliberately not tenant-scoped. */
export const PLATFORM_SCOPE = Symbol('platform-scope');

/**
 * Run `fn` with `tenantId` as the ambient tenant.
 * Nested calls override, which is what a platform job iterating tenants needs.
 */
export function withTenant(tenantId, fn) {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new TypeError(`withTenant requires a positive integer tenantId, got ${tenantId}`);
  }
  return storage.run({ tenantId }, fn);
}

/**
 * Run `fn` with tenant scoping disabled.
 *
 * For genuine cross-tenant work only: platform admin screens, billing runs,
 * migrations, the tenant registry itself. Every use is a place where a bug
 * becomes a data leak, so it is deliberately noisy to write and easy to grep.
 */
export function withPlatformScope(fn) {
  return storage.run({ tenantId: PLATFORM_SCOPE }, fn);
}

/** The current context, or undefined outside any. */
export function getContext() {
  return storage.getStore();
}

/**
 * The current tenant id.
 *
 * Throws when there is no context. Failing closed is the whole design: an
 * unscoped query in a multi-tenant system returns every customer's rows, and
 * that failure is silent. A thrown error is a bug report; a silent leak is a
 * breach.
 */
export function requireTenantId() {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      'No tenant context. Wrap this work in withTenant(id, fn), or withPlatformScope(fn) if it is deliberately cross-tenant.',
    );
  }
  return ctx.tenantId;
}

export function isPlatformScope() {
  return storage.getStore()?.tenantId === PLATFORM_SCOPE;
}
