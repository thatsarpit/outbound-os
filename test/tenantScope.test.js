/**
 * Tenant scoping — the safety net for multi-tenancy.
 *
 * These assertions are the difference between "customers are isolated" and
 * "customers are probably isolated". The failure mode being guarded against is
 * silent: an unscoped query returns every tenant's rows and looks like a
 * working feature.
 *
 * Run: node --test test/tenantScope.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tenantScopeExtension } from '../src/platform/tenantScope.js';
import {
  withTenant,
  withPlatformScope,
  requireTenantId,
} from '../src/platform/tenantContext.js';

const handler = tenantScopeExtension().query.$allModels.$allOperations;

/** Invoke the extension with a stub executor and capture what it produced. */
async function run(model, operation, args) {
  let captured = null;
  const query = (a, internal) => {
    captured = { args: a, internal };
    return Promise.resolve('ok');
  };
  await handler({ model, operation, args, query });
  return captured;
}

describe('tenant context', () => {
  test('survives await boundaries', async () => {
    const id = await withTenant(7, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return requireTenantId();
    });
    assert.equal(id, 7);
  });

  test('throws outside any context rather than defaulting', () => {
    assert.throws(() => requireTenantId(), /No tenant context/);
  });

  test('rejects a non-positive tenant id', () => {
    assert.throws(() => withTenant(0, () => {}), TypeError);
    assert.throws(() => withTenant('1', () => {}), TypeError);
  });
});

describe('query scoping', () => {
  test('AND-s tenantId onto an existing where', async () => {
    await withTenant(42, async () => {
      const { args } = await run('Lead', 'findMany', { where: { status: 'new' } });
      assert.deepEqual(args.where, { AND: [{ status: 'new' }, { tenantId: 42 }] });
    });
  });

  test('preserves OR semantics', async () => {
    // Merging a tenantId key into a where containing OR would widen the match
    // and leak rows. AND-ing is what keeps this correct.
    await withTenant(42, async () => {
      const { args } = await run('Lead', 'findMany', { where: { OR: [{ a: 1 }, { b: 2 }] } });
      assert.deepEqual(args.where, { AND: [{ OR: [{ a: 1 }, { b: 2 }] }, { tenantId: 42 }] });
    });
  });

  test('rewrites findUnique to findFirst', async () => {
    // findUnique only accepts unique fields, so tenantId cannot be added to it.
    await withTenant(42, async () => {
      const { internal } = await run('Lead', 'findUnique', { where: { id: 5 } });
      assert.equal(internal.operation, 'findFirst');
    });
  });

  test('stamps tenantId on create and createMany', async () => {
    await withTenant(42, async () => {
      const one = await run('Lead', 'create', { data: { name: 'x' } });
      assert.equal(one.args.data.tenantId, 42);
      const many = await run('Lead', 'createMany', { data: [{ n: 1 }, { n: 2 }] });
      assert.ok(many.args.data.every((d) => d.tenantId === 42));
    });
  });

  test('stamps the create branch of an upsert', async () => {
    await withTenant(42, async () => {
      const { args } = await run('Lead', 'upsert', { where: { id: 1 }, create: {}, update: {} });
      assert.equal(args.create.tenantId, 42);
    });
  });

  test('leaves platform-owned models alone', async () => {
    await withTenant(42, async () => {
      const { args } = await run('Plan', 'findMany', { where: { code: 'pro' } });
      assert.deepEqual(args.where, { code: 'pro' });
    });
  });

  test('platform scope passes through unfiltered', async () => {
    await withPlatformScope(async () => {
      const { args } = await run('Lead', 'findMany', { where: { status: 'new' } });
      assert.deepEqual(args.where, { status: 'new' });
    });
  });

  test('FAILS CLOSED with no context — never returns every tenant', async () => {
    await assert.rejects(() => run('Lead', 'findMany', {}), /no tenant context/i);
  });
});
