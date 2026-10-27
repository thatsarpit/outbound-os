import { markVerifiedMcpActor } from '../src/auth/verifiedMcpActor.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceMembers } from '../src/services/workspaceMembers.js';
import { workspaceMemberIdentity, memberAssignmentWhere, memberAssignmentData, leadAssignmentWhere, leadAssignedMember, leadHasAssignee } from '../src/utils/workspaceMember.js';

const localEnv = { AUTH_PROVIDER: 'local' };
const clerkEnv = { AUTH_PROVIDER: 'clerk', CLERK_SECRET_KEY: 'sk_test_fixture', CLERK_ORGANIZATION_ID: 'org_fixture' };
const localActor = { id: 1, orgId: 'local', role: 'admin' };
const clerkActor = { id: 'user_owner', orgId: 'org_fixture', role: 'admin' };
const serviceActor = { id: 'mcp-service', orgId: 'service', role: 'admin' };
const validLocal = (id, role = 'agent') => ({ id, role, enabled: true, name: `Fixture ${id}`, email: `member${id}@example.test` });

function fixture({ clerk = false } = {}) {
  const users = new Map([[1, validLocal(1, 'admin')], [2, validLocal(2)], [3, validLocal(3, 'viewer')]]);
  const stored = new Map();
  const calls = [];
  const db = { user: {
    findUnique: async ({ where }) => { calls.push(['local', where.id]); return users.get(where.id) || null; },
    findMany: async () => [...users.values()].filter(user => user.enabled && user.role !== 'viewer'),
    create: async () => { throw new Error('Assignments must never create authentication users.'); },
  }, workspaceMember: { upsert: async ({ where, create, update }) => {
    const next = stored.has(where.key) ? update : create;
    stored.set(where.key, { ...next });
    return { ...next };
  } } };
  const memberships = new Map(['user_owner', 'user_agent', 'user_other'].map(id => [id, { role: id === 'user_owner' ? 'org:admin' : 'org:member', publicUserData: { userId: id, firstName: id, identifier: 'same@example.test' } }]));
  const clerkUsers = new Map([...memberships.keys()].map(id => [id, { id, firstName: id, lastName: 'Fixture', primaryEmailAddress: { emailAddress: 'same@example.test' }, banned: false, locked: false }]));
  let unavailable = false;
  const client = { organizations: { getOrganizationMembershipList: async input => {
    calls.push(['clerk_memberships', input]);
    if (unavailable) throw new Error('Fixture provider offline');
    const data = input.userId ? input.userId.flatMap(id => memberships.get(id) ? [memberships.get(id)] : []) : [...memberships.values()].slice(input.offset || 0, (input.offset || 0) + 2);
    return { data, totalCount: input.userId ? data.length : memberships.size };
  } }, users: { getUser: async id => {
    calls.push(['clerk_user', id]);
    if (unavailable) throw new Error('Fixture provider offline');
    return clerkUsers.get(id) || null;
  } } };
  const service = new WorkspaceMembers({ db, client, env: clerk ? clerkEnv : localEnv, now: () => new Date('2026-10-24T01:00:00Z') });
  return { service, users, stored, calls, memberships, clerkUsers, offline: () => { unavailable = true; } };
}

test('member keys separate providers and organizations and reject service or unpinned production identities', () => {
  assert.equal(workspaceMemberIdentity(localActor, localEnv).key, 'local:local:1');
  assert.equal(workspaceMemberIdentity(clerkActor, clerkEnv).key, 'clerk:org_fixture:user_owner');
  for (const bad of [{ ...localActor, id: 'user_owner' }, { ...localActor, id: 'mcp-service' }, { ...localActor, delegated: true }, { ...localActor, id: '01' }, { ...localActor, orgId: 'org_fixture' }]) assert.equal(workspaceMemberIdentity(bad, localEnv), null);
  for (const bad of [{ ...clerkActor, orgId: 'org_other' }, { ...clerkActor, id: 'owner@example.test' }, { ...clerkActor, id: '1' }]) assert.equal(workspaceMemberIdentity(bad, clerkEnv), null);
  assert.equal(workspaceMemberIdentity(clerkActor, { AUTH_PROVIDER: 'clerk', NODE_ENV: 'production' }), null);
  assert.equal(workspaceMemberIdentity(clerkActor, { AUTH_PROVIDER: 'clerk', CLERK_SECRET_KEY: 'sk_live_fixture' }), null);
});

test('Mine, assignment states and labels preserve old local ownership without confusing a Clerk identity', () => {
  assert.deepEqual(memberAssignmentWhere(localActor, localEnv), { OR: [{ assignedMemberKey: 'local:local:1' }, { assignedMemberKey: null, assignedToId: 1 }] });
  assert.deepEqual(memberAssignmentWhere(clerkActor, clerkEnv), { assignedMemberKey: 'clerk:org_fixture:user_owner' });
  assert.throws(() => memberAssignmentWhere({ id: 'mcp-service' }, localEnv), /personally/);
  assert.deepEqual(leadAssignmentWhere(false), { assignedMemberKey: null, assignedToId: null });
  assert.equal(leadAssignmentWhere(true).OR.length, 2);
  assert.equal(leadHasAssignee({ assignedMemberKey: 'clerk:org_fixture:user_owner' }), true);
  assert.equal(leadHasAssignee({ assignedToId: 1 }), true);
  assert.deepEqual(memberAssignmentData(workspaceMemberIdentity(clerkActor, clerkEnv)), { assignedMemberKey: 'clerk:org_fixture:user_owner', assignedToId: null });
  assert.deepEqual(memberAssignmentData(workspaceMemberIdentity(localActor, localEnv)), { assignedMemberKey: 'local:local:1', assignedToId: 1 });
  assert.deepEqual(memberAssignmentData(null), { assignedMemberKey: null, assignedToId: null });
  assert.equal(leadAssignedMember({ assignedToId: 1, assignedTo: { name: 'Legacy fixture' } }).name, 'Legacy fixture');
  assert.ok(!JSON.stringify(leadAssignedMember({ assignedMember: { key: 'key', name: 'Fixture', email: 'private@example.test' } })).includes('private@example.test'), 'ordinary assignee labels do not expose the member directory email');
});

test('local assignments validate live users and retain the legacy numeric field without creating users', async () => {
  const f = fixture();
  const target = await f.service.resolve(localActor, 'local:local:2');
  assert.equal(target.externalId, '2');
  assert.equal(target.key, 'local:local:2');
  assert.equal(f.stored.size, 1);
  assert.equal(Object.hasOwn(target, 'localUserId'), false);
  f.users.get(2).enabled = false;
  await assert.rejects(f.service.resolve(localActor, 'local:local:2'), /not available/);
  await assert.rejects(f.service.resolve(localActor, 'local:local:3'), /not available/);
  await assert.rejects(f.service.resolve(localActor, 'local:local:999'), /not available/);
  assert.equal(f.stored.size, 1, 'failed lookups never create snapshots or auth users');
});

test('sales agents may assign themselves but a stale manager claim cannot assign someone else', async () => {
  const f = fixture();
  f.users.get(1).role = 'agent';
  await assert.rejects(f.service.resolve(localActor, 'local:local:2'), error => error.statusCode === 403 && error.code === 'assignment_forbidden');
  assert.equal((await f.service.self(localActor)).key, 'local:local:1');
  f.users.get(1).enabled = false;
  await assert.rejects(f.service.self(localActor), /not available/);
  assert.equal(f.stored.size, 1);
});

test('Clerk targets require live membership and user status in the current pinned organization', async () => {
  const f = fixture({ clerk: true });
  const target = await f.service.resolve(clerkActor, 'clerk:org_fixture:user_agent');
  assert.equal(target.name, 'user_agent Fixture');
  assert.equal(target.externalId, 'user_agent');
  assert.ok(f.calls.filter(item => item[0] === 'clerk_memberships').every(item => item[1].organizationId === 'org_fixture'));
  assert.ok(f.calls.every(item => item[0] !== 'local'), 'matching emails never link Clerk members to local authentication users');
  await assert.rejects(f.service.resolve(clerkActor, 'clerk:org_other:user_agent'), /this workspace/);
  f.clerkUsers.get('user_agent').banned = true;
  await assert.rejects(f.service.resolve(clerkActor, 'clerk:org_fixture:user_agent'), /not available/);
  f.clerkUsers.get('user_agent').banned = false;
  f.clerkUsers.get('user_agent').locked = true;
  await assert.rejects(f.service.resolve(clerkActor, 'clerk:org_fixture:user_agent'), /not available/);
  f.clerkUsers.get('user_agent').locked = false;
  f.memberships.delete('user_agent');
  await assert.rejects(f.service.resolve(clerkActor, 'clerk:org_fixture:user_agent'), /not available/);
});

test('Clerk removal, live role downgrade and provider failure cannot reuse a cached assignment snapshot', async () => {
  const f = fixture({ clerk: true });
  await f.service.self(clerkActor);
  f.memberships.get('user_owner').role = 'org:member';
  await assert.rejects(f.service.resolve(clerkActor, 'clerk:org_fixture:user_agent'), error => error.statusCode === 403);
  f.offline();
  await assert.rejects(f.service.self(clerkActor), error => error.statusCode === 503);
  assert.equal(f.stored.size, 1);
  const removed = fixture({ clerk: true });
  removed.memberships.delete('user_owner');
  await assert.rejects(removed.service.list(clerkActor), /not available/);
  assert.equal(removed.stored.size, 0);
});

test('the assignment directory paginates the current Clerk organization and excludes unknown or viewer roles', async () => {
  const f = fixture({ clerk: true });
  f.memberships.set('user_viewer', { role: 'org:viewer', publicUserData: { userId: 'user_viewer', firstName: 'Viewer' } });
  f.memberships.set('user_unknown', { role: 'org:owner', publicUserData: { userId: 'user_unknown' } });
  const listed = await f.service.list(clerkActor);
  assert.deepEqual(new Set(listed.map(member => member.externalId)), new Set(['user_owner', 'user_agent', 'user_other']));
  assert.deepEqual(f.calls.filter(item => item[0] === 'clerk_memberships' && !item[1].userId).map(item => item[1].offset), [0, 2, 4]);
  assert.equal(f.stored.size, 0, 'browsing the directory does not populate authorization or membership caches');
});

test('legacy service administrators discover and assign explicit local targets without a personal identity', async () => {
  const f = fixture();
  assert.equal(workspaceMemberIdentity(serviceActor, localEnv), null);
  assert.equal((await f.service.list(serviceActor)).length, 2);
  assert.equal((await f.service.resolve(serviceActor, 'local:local:2')).key, 'local:local:2');
  assert.deepEqual(f.calls, [['local', 2]], 'a service actor never becomes a local authentication user');
  await assert.rejects(async () => f.service.self(serviceActor), error => error.statusCode === 403);
  for (const bad of [{ ...serviceActor, role: 'manager' }, { ...serviceActor, orgId: 'local' }, { ...serviceActor, delegated: true }]) {
    await assert.rejects(f.service.list(bad), error => error.statusCode === 403);
    await assert.rejects(f.service.resolve(bad, 'local:local:2'), error => error.statusCode === 403);
  }
  for (const key of ['clerk:org_fixture:user_agent', 'local:local:999', 'local:local:3', 'local:local:02']) {
    await assert.rejects(f.service.resolve(serviceActor, key));
  }
  f.users.get(2).enabled = false;
  await assert.rejects(f.service.resolve(serviceActor, 'local:local:2'), error => error.statusCode === 409);
  assert.equal(f.stored.size, 1);
});

test('legacy Clerk service assignments require the pinned workspace and recheck the target provider', async () => {
  const f = fixture({ clerk: true });
  assert.equal((await f.service.list(serviceActor)).length, 3);
  const member = await f.service.resolve(serviceActor, 'clerk:org_fixture:user_agent');
  assert.equal(member.provider, 'clerk');
  assert.equal(memberAssignmentData(member).assignedToId, null);
  assert.ok(f.calls.every(call => call[0] !== 'local'), 'matching emails never substitute local users');
  await assert.rejects(f.service.resolve(serviceActor, 'clerk:org_other:user_agent'), error => error.statusCode === 403);
  f.memberships.delete('user_agent');
  await assert.rejects(f.service.resolve(serviceActor, member.key), error => error.statusCode === 409);
  f.service.env = { AUTH_PROVIDER: 'clerk', NODE_ENV: 'production' };
  await assert.rejects(f.service.list(serviceActor), error => error.statusCode === 503 && error.code === 'member_workspace_unconfigured');
  assert.equal(f.stored.size, 1);
});

test('personal delegated workspace identity requires an in-process verification proof', () => {
  const actor = { id: '1', orgId: 'local', role: 'admin', delegated: true, mcpGrantId: 'synthetic-grant' };
  assert.equal(workspaceMemberIdentity(actor, localEnv), null);
  markVerifiedMcpActor(actor);
  assert.equal(workspaceMemberIdentity(actor, localEnv).key, 'local:local:1');
  assert.equal(workspaceMemberIdentity({ ...actor }, localEnv), null, 'serialized lookalikes cannot claim verification');
});
