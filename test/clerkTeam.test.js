import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createClerkTeamRouter } from '../src/routes/clerkTeam.js';

const levels = { viewer: 0, agent: 1, manager: 2, admin: 3 };
const fixtureInvite = (role = 'org:member') => ({ id: 'inv_fixture', emailAddress: 'sales@example.test', role, createdAt: 1792320000000, expiresAt: 1792924800000 });
async function withServer(client, run) {
  const app = express();
  app.use(express.json());
  app.use(createClerkTeamRouter({ client, requireRole: minimum => (req, res, next) => {
    const role = req.headers['x-fixture-role'];
    if (!Object.hasOwn(levels, role)) return res.status(401).json({error: 'not signed in'});
    if (levels[role] < levels[minimum]) return res.status(403).json({error: 'forbidden'});
    req.user = { id: 'user_fixture', orgId: 'org_fixture', role };
    next();
  } }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const request = async (path, {method = 'GET', role = 'admin', body} = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {method, headers: {'content-type': 'application/json', ...(role ? {'x-fixture-role': role}: {})}, body: body === undefined ? undefined : JSON.stringify(body)});
    return {status: response.status, body: await response.json()};
  };
  try { await run(request); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('team invitation HTTP validation fails before provider calls and maps both built-in roles', async () => {
  const calls = [];
  const client = {organizations: {async createOrganizationInvitation(payload) { calls.push(payload); return fixtureInvite(payload.role); }}};
  await withServer(client, async request => {
    for (const role of [null, 'agent', 'viewer', 'manager']) {
      assert.ok([401,403].includes((await request('/invitations', {method: 'POST', role, body: {email: 'sales@example.test'}})).status));
    }
    for (const role of ['manager', 'viewer', 'org:admin', {}, 12]) assert.equal((await request('/invitations', {method: 'POST', body: {email: 'sales@example.test', role}})).status, 400);
    for (const email of [null, {}, 'invalid', 'a@b']) assert.equal((await request('/invitations', {method: 'POST', body: {email}})).status, 400);
    assert.equal(calls.length, 0);
    const agent = await request('/invitations', {method: 'POST', body: {email: ' SALES@example.test '}});
    assert.equal(agent.status, 201);
    assert.equal(agent.body.invitation.role, 'agent');
    assert.equal(agent.body.invitation.expiresAt, '2026-10-25T10:40:00.000Z');
    assert.deepEqual(calls[0], {organizationId: 'org_fixture', emailAddress: 'sales@example.test', role: 'org:member', inviterUserId: 'user_fixture'});
    assert.equal((await request('/invitations', {method: 'POST', body: {email: 'admin@example.test', role: 'admin'}})).body.invitation.role, 'admin');
    assert.equal(calls[1].role, 'org:admin');
  });
});

test('membership and pending-invitation reads paginate and never expose provider metadata', async () => {
  const calls = [];
  const member = id => ({publicUserData: {userId: `user_${id}`, identifier: `sales${id}@example.test`, firstName: 'Sales', lastName: String(id)}, role: id ? 'org:unknown' : 'org:member', privateMetadata: {secret: 'fixture'}});
  const client = {organizations: {
    async getOrganizationMembershipList(query) {calls.push(query); return {data: query.offset ? [member(1)] : [member(0)], totalCount: 2};},
    async getOrganizationInvitationList(query) {calls.push(query); return {data: query.offset ? [fixtureInvite('org:admin')] : [fixtureInvite()], totalCount: 2};},
  }};
  await withServer(client, async request => {
    assert.equal((await request('/members', {role: 'agent'})).status, 403);
    const members = await request('/members');
    assert.equal(members.status, 200);
    assert.equal(members.body.length, 2);
    assert.deepEqual(members.body[0], {id: 'user_0', name: 'Sales 0', email: 'sales0@example.test', role: 'agent'});
    assert.equal(members.body[1].role, null);
    const invitations = await request('/invitations');
    assert.deepEqual(invitations.body.map(x => x.role), ['agent', 'admin']);
    assert.ok(calls.every(x => x.organizationId === 'org_fixture' && x.limit === 100));
    assert.deepEqual(calls.map(x => x.offset), [0,1,0,1]);
  });
});

test('provider errors, revocations and local-auth behavior are explicit', async () => {
  await withServer(null, async request => {
    assert.equal((await request('/members')).status, 409);
    assert.deepEqual((await request('/invitations')).body, []);
    assert.equal((await request('/invitations', {method: 'POST', body: {email: 'sales@example.test'}})).status, 409);
  });
  const calls = [];
  await withServer({organizations: {
    async revokeOrganizationInvitation(payload) { calls.push(payload); },
    async getOrganizationMembershipList() {throw {status: 429, errors: [{longMessage: 'Fixture rate limit'}]};},
  }}, async request => {
    assert.equal((await request('/invitations/inv_fixture', {method: 'DELETE', role: 'agent'})).status, 403);
    assert.equal(calls.length, 0);
    assert.equal((await request('/invitations/inv_fixture', {method: 'DELETE'})).status, 200);
    assert.deepEqual(calls[0], {organizationId: 'org_fixture', invitationId: 'inv_fixture', requestingUserId: 'user_fixture'});
    const failed = await request('/members');
    assert.equal(failed.status, 429);
    assert.equal(failed.body.error, 'Fixture rate limit');
  });
});
