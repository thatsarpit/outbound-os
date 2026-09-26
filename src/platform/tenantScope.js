import { PLATFORM_SCOPE, getContext } from './tenantContext.js';

/**
 * Prisma extension that scopes every query to the ambient tenant.
 *
 * This is the mechanism that makes multi-tenancy tractable. Rather than editing
 * ~750 call sites — and getting one wrong — scoping happens once, here, at the
 * client boundary. Service code keeps calling `prisma.lead.findMany({ where })`
 * and gets only its own tenant's rows.
 *
 * Two rules it enforces:
 *   1. Reads and writes on tenant-owned models are filtered by tenantId.
 *   2. A missing tenant context is an error, never "return everything".
 *
 * The second rule is why this is safe to adopt incrementally: any code path not
 * yet wrapped in withTenant() fails loudly in development instead of quietly
 * serving cross-tenant data in production.
 */

/**
 * Models that belong to exactly one tenant.
 *
 * NOT listed here, deliberately:
 *   - Tenant, Plan, PlanPrice — the platform registry and catalogue
 *   - User — a person may eventually belong to several tenants, so membership
 *     is modelled by a join rather than a column on User
 *   - SystemConfig — instance-level configuration
 * Anything absent from this list is left unscoped, so additions to the schema
 * must be added here consciously.
 */
export const TENANT_OWNED_MODELS = new Set([
  'Lead', 'Message', 'Campaign', 'CampaignLead', 'MediaFile',
  'WhatsAppAccount', 'EmailAccount', 'IMessageAccount',
  'EmailTemplate', 'LeadNote', 'LeadTask',
  'LeadPool', 'UserPool', 'LeadPoolWhatsApp', 'LeadPoolEmail',
  'ActivityLog', 'ImportBatch', 'WebhookSubscription', 'WebhookSource',
  'Invitation', 'AccessRequest', 'WhatsAppNumberCheck',
  'Subscription', 'Invoice', 'UsageRecord', 'ProvisioningJob',
]);

/** Operations whose `where` must be narrowed to the tenant. */
const READ_OPS = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy',
]);

/** Operations that mutate and therefore need both a filter and a stamp. */
const WRITE_OPS = new Set([
  'update', 'updateMany', 'delete', 'deleteMany', 'upsert',
]);

const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);

/**
 * `findUnique` accepts only unique fields in `where`, so a tenantId cannot be
 * added to it. Rewriting to `findFirst` keeps the caller's semantics (one row
 * or null) while allowing the extra predicate.
 */
const UNIQUE_TO_FIRST = {
  findUnique: 'findFirst',
  findUniqueOrThrow: 'findFirstOrThrow',
};

function scopeWhere(where, tenantId) {
  // AND-ing rather than merging a key avoids silently overriding a caller's own
  // tenantId filter, and behaves correctly when `where` already uses AND/OR.
  return where ? { AND: [where, { tenantId }] } : { tenantId };
}

export function tenantScopeExtension() {
  return {
    name: 'tenantScope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_OWNED_MODELS.has(model)) return query(args);

          const ctx = getContext();

          if (!ctx) {
            throw new Error(
              `Unscoped ${model}.${operation}: no tenant context. Wrap the call in ` +
                'withTenant(id, fn), or withPlatformScope(fn) if it is deliberately cross-tenant.',
            );
          }

          const { tenantId } = ctx;
          if (tenantId === PLATFORM_SCOPE) return query(args);

          if (READ_OPS.has(operation) || WRITE_OPS.has(operation)) {
            const next = { ...args, where: scopeWhere(args?.where, tenantId) };

            if (operation === 'upsert') {
              // upsert may insert, so the new row needs stamping too.
              next.create = { ...next.create, tenantId };
            }

            const rewritten = UNIQUE_TO_FIRST[operation];
            if (rewritten) {
              // __internalParams carries the operation Prisma actually runs.
              return query(next, { operation: rewritten });
            }
            return query(next);
          }

          if (CREATE_OPS.has(operation)) {
            if (Array.isArray(args?.data)) {
              return query({ ...args, data: args.data.map((d) => ({ ...d, tenantId })) });
            }
            return query({ ...args, data: { ...args?.data, tenantId } });
          }

          return query(args);
        },
      },
    },
  };
}
