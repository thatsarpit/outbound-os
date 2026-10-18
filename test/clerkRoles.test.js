import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appRoleFromOrgRole, clerkInvitationRole } from '../shared/clerkRoles.js';
import { clerkWorkspaceIdentity, clerkSessionIdentity } from '../src/auth/clerkIdentity.js';
import { requireRole, verifyQueryToken } from '../src/auth/clerkAuth.js';

const identity = { userId: 'user_fixture', orgId: 'org_fixture', orgRole: 'org:member', tokenType: 'session_token' };
const env = { CLERK_SECRET_KEY: 'sk_live_fixture', CLERK_ORGANIZATION_ID: 'org_fixture' };

test('Clerk built-in roles preserve sales permissions and unknown roles fail closed', async () => {
  assert.equal(appRoleFromOrgRole('org:admin'), 'admin');
  assert.equal(appRoleFromOrgRole('org:member'), 'agent');
  for (const role of ['viewer', 'agent', 'manager']) assert.equal(appRoleFromOrgRole(`org:${role}`), role);
  for (const role of [null, undefined, '', 'admin', 'org:owner', 'toString', 'constructor', '__proto__', {}]) {
    assert.equal(appRoleFromOrgRole(role), null);
  }
  const frontend = await import('../web/src/lib/clerk-role.ts');
  assert.equal(frontend.appRoleFromOrgRole('org:member'), 'agent');
  assert.equal(frontend.appRoleFromOrgRole('constructor'), null);
  const { ROLE_PAGE_CAPABILITIES } = await import('../web/src/lib/role-shell.ts');
  assert.ok(ROLE_PAGE_CAPABILITIES.agent.includes('page.inbox'));
  for (const page of ['page.team', 'page.settings', 'page.campaigns']) assert.ok(!ROLE_PAGE_CAPABILITIES.agent.includes(page));
});

test('new Clerk invitations only use the two built-in roles without promoting old roles', () => {
  assert.equal(clerkInvitationRole('admin'), 'org:admin');
  assert.equal(clerkInvitationRole('agent'), 'org:member');
  for (const role of ['viewer', 'manager', 'member', 'org:admin', null, {}, 'constructor']) assert.equal(clerkInvitationRole(role), null);
});

test('production identities are pinned to one workspace for both session token formats', () => {
  assert.equal(clerkWorkspaceIdentity(identity, { CLERK_SECRET_KEY: 'sk_live_fixture' }), null);
  assert.equal(clerkWorkspaceIdentity({ ...identity, orgId: 'org_other' }, env), null);
  assert.equal(clerkWorkspaceIdentity({ ...identity, orgId: null }, env), null);
  assert.equal(clerkWorkspaceIdentity({ ...identity, userId: null }, env), null);
  assert.deepEqual(clerkWorkspaceIdentity(identity, env), {userId: 'user_fixture', orgId: 'org_fixture', role: 'agent'});
  assert.deepEqual(clerkSessionIdentity({ sub: 'user_fixture', org_id: 'org_fixture', org_role: 'org:member' }, env), clerkWorkspaceIdentity(identity, env));
  assert.deepEqual(clerkSessionIdentity({ v: 2, sub: 'user_fixture', o: { id: 'org_fixture', rol: 'member' } }, env), clerkWorkspaceIdentity(identity, env));
  assert.equal(clerkSessionIdentity({ v: 2, sts: 'pending', sub: 'user_fixture', o: { id: 'org_fixture', rol: 'admin' } }, env), null);
  assert.equal(clerkSessionIdentity({ v: 2, sub: 'user_fixture', org_id: 'org_fixture', org_role: 'org:admin' }, env), null);
  assert.equal(clerkSessionIdentity({ v: 2, sub: 'user_fixture', o: { id: 'org_other', rol: 'admin' } }, env), null);
});

function guard(auth, minRole) {
  const req = { headers: {}, auth: Object.assign(() => auth, { [Symbol.for('@clerk/express.auth')]: true }) };
  let status = 200, error, allowed = false;
  const res = { status(value) { status = value; return this; }, json(value) { error = value; return this; } };
  requireRole(minRole)(req, res, () => { allowed = true; });
  return { status, allowed, user: req.user, error };
}

test('the real Clerk HTTP guard rejects unsigned-out, wrong-workspace and downgraded sessions', () => {
  const before = { key: process.env.CLERK_SECRET_KEY, org: process.env.CLERK_ORGANIZATION_ID };
  process.env.CLERK_SECRET_KEY = env.CLERK_SECRET_KEY;
  process.env.CLERK_ORGANIZATION_ID = env.CLERK_ORGANIZATION_ID;
  try {
    assert.equal(guard({ ...identity, userId: null }, 'viewer').status, 401);
    assert.equal(guard({ ...identity, orgId: 'org_other', orgRole: 'org:admin' }, 'viewer').status, 403);
    for (const orgRole of ['org:member', 'org:viewer', 'toString']) assert.equal(guard({ ...identity, orgRole }, 'admin').status, 403);
    assert.equal(guard(identity, 'agent').allowed, true);
    assert.equal(guard(identity, 'manager').status, 403);
    assert.equal(guard({ ...identity, orgRole: 'org:admin' }, 'admin').allowed, true);
    assert.equal(guard(identity, 'admin').status, 403, 'each request uses the current downgraded membership');
    assert.throws(() => requireRole('constructor'), /unknown role/);
  } finally {
    if (before.key === undefined) delete process.env.CLERK_SECRET_KEY; else process.env.CLERK_SECRET_KEY = before.key;
    if (before.org === undefined) delete process.env.CLERK_ORGANIZATION_ID; else process.env.CLERK_ORGANIZATION_ID = before.org;
  }
});

test('production preflight checks the current favicon and requires a pinned production organization', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'outboundos-clerk-preflight-'));
  const file = path.join(folder, 'fixture.env');
  const base = 'DATABASE_URL=file:fixture.db\nCLERK_SECRET_KEY=sk_live_fixture\nCLERK_PUBLISHABLE_KEY=pk_live_fixture\n';
  try {
    writeFileSync(file, base);
    const denied = spawnSync(process.execPath, ['scripts/preflight.mjs', file], { encoding: 'utf8' });
    assert.equal(denied.status, 1);
    assert.match(denied.stderr, /CLERK_ORGANIZATION_ID/);
    writeFileSync(file, base + 'CLERK_ORGANIZATION_ID=org_fixture\n');
    const allowed = spawnSync(process.execPath, ['scripts/preflight.mjs', file], { encoding: 'utf8' });
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.match(allowed.stdout, /Preflight OK/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('SSE rejects missing and malformed tokens before authorizing a live-update stream', async () => {
  assert.equal(await verifyQueryToken(null), null);
  assert.equal(await verifyQueryToken('not-a-signed-session'), null);
});
