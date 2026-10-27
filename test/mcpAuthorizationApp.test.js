import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { McpAuthorization, personalMcpConfig, prismaMcpRepository } from '../src/services/mcpAuthorization.js';

test('real API middleware parses personal control and consent JSON before guarding delegated reads', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'outbound-mcp-app-'));
  const originalDirectory = process.cwd();
  process.chdir(directory);
  Object.assign(process.env, {
    NODE_ENV: 'test', AUTH_PROVIDER: 'local', DATABASE_URL: `file:${path.join(directory, 'fixture.db')}`,
    JWT_SECRET: 'obviously-fake-app-signing-key-'.repeat(2), MCP_SERVICE_TOKEN: 'fixture-legacy-app-token',
    MCP_AUTH_MODE: 'personal', MCP_PUBLIC_URL: 'https://mcp.example.test/mcp', MCP_DASHBOARD_ORIGIN: 'https://app.example.test',
    MCP_WORKSPACE_ID: 'fixture-app-installation', MCP_CONTROL_SECRET: 'obviously-fake-app-control-key-'.repeat(2),
    CORS_ORIGIN: 'https://app.example.test',
  });
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { signToken } = await import('../src/auth/rbac.js');
  // Real migrated schema, isolated data and no provider/scheduler execution.
  const schema = new DatabaseSync(path.join(directory, 'fixture.db'));
  const migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(migrations).sort()) {
    const file = new URL(`${name}/migration.sql`, migrations);
    if (existsSync(file)) schema.exec(readFileSync(file, 'utf8'));
  }
  schema.close();
  const user = await prisma.user.create({ data: { name: 'Fixture owner', email: 'owner@example.test', passwordHash: 'unused-fixture-hash', role: 'admin' } });
  const { default: app } = await import('../src/api.js');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const personal = signToken(user);
  const owner = { id: String(user.id), provider: 'local', orgId: 'local', workspace: process.env.MCP_WORKSPACE_ID };
  async function request(endpoint, { credential = personal, method = 'GET', body, origin } = {}) {
    return fetch(`${base}${endpoint}`, { method, headers: {
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  const control = (operation, body) => request(`/mcp-control/${operation}`, { method: 'POST', credential: process.env.MCP_CONTROL_SECRET, body });
  try {
    const redirect = 'https://client.example.test/callback';
    const registeredResponse = await control('register', { redirect_uris: [redirect], client_name: 'App fixture' });
    assert.equal(registeredResponse.status, 200, 'the private control route receives parsed JSON before the ordinary API session guard');
    const registered = await registeredResponse.json();
    const verifier = 'v'.repeat(43);
    const pendingResponse = await control('request', { parameters: {
      response_type: 'code', client_id: registered.client_id, redirect_uri: redirect,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', resource: process.env.MCP_PUBLIC_URL,
    }, browserNonce: 'n'.repeat(43) });
    assert.equal(pendingResponse.status, 200);
    const pending = await pendingResponse.json();
    const endpoint = `/integrations/mcp/authorization/${pending.id}`;
    const details = await (await request(endpoint)).json();
    const decision = { decision: 'allow', decisionNonce: details.decisionNonce };
    assert.equal((await request(endpoint, { method: 'POST', body: decision, origin: 'https://other.example.test' })).status, 403);
    assert.equal((await request(endpoint, { method: 'POST', body: decision, origin: process.env.MCP_DASHBOARD_ORIGIN })).status, 200, 'the actual app consent route receives its decision nonce');
    const completed = await (await control('complete', { id: pending.id, browserNonce: 'n'.repeat(43) })).json();
    const tokenInput = { grant_type: 'authorization_code', code: new URL(completed.redirectUrl).searchParams.get('code'), code_verifier: verifier,
      client_id: registered.client_id, redirect_uri: redirect, resource: process.env.MCP_PUBLIC_URL };
    const issued = await Promise.all([control('token', tokenInput), control('token', tokenInput)]);
    assert.deepEqual(issued.map(response => response.status).sort(), [200, 400], 'SQLite compare-and-swap consumes an authorization code once');
    const token = await issued.find(response => response.status === 200).json();
    assert.equal(token.scope, 'mcp:read mcp:write');
    const campaignDelegation = await (await control('delegate', { token: token.access_token, tool: 'create_campaign', method: 'POST', path: '/api/campaigns' })).json();
    const created = await request('/campaigns', { credential: campaignDelegation.assertion, method: 'POST',
      body: { name: 'Synthetic delegated campaign', channel: 'email', emailSubject: 'Synthetic', messageTemplate: 'Never sent' } });
    assert.equal(created.status, 200, 'an explicitly authorized write grant reaches the actual manager-only API route');
    assert.equal((await created.json()).status, 'draft');
    assert.equal((await request('/leads', { credential: campaignDelegation.assertion, method: 'POST', body: { name: 'Never created' } })).status, 403);
    const directoryDelegation = await (await control('delegate', { token: token.access_token, tool: 'list_users', method: 'GET', path: '/api/workspace/members' })).json();
    const directoryResponse = await request('/workspace/members', { credential: directoryDelegation.assertion });
    assert.equal(directoryResponse.status, 200, 'verified personal delegations retain live workspace identity');
    const directory = await directoryResponse.json();
    const member = directory.members.find(item => item.externalId === String(user.id));
    assert.ok(member);
    const lead = await prisma.lead.create({ data: { name: 'Synthetic assignment', mobile: '15557770019' } });
    const assignmentPath = `/api/leads/${lead.id}/assign`;
    const assignmentDelegation = await (await control('delegate', { token: token.access_token, tool: 'lead_assign', method: 'POST', path: assignmentPath })).json();
    const assignment = await request(`/leads/${lead.id}/assign`, { credential: assignmentDelegation.assertion, method: 'POST', body: { memberKey: member.key } });
    assert.equal(assignment.status, 200, 'MCP lead assignment checks a verified personal actor and live target');
    assert.equal((await assignment.json()).assignedMemberKey, member.key);
    const delegated = await (await control('delegate', { token: token.access_token, tool: 'list_users', method: 'GET', path: '/api/users' })).json();
    const users = await request('/users', { credential: delegated.assertion });
    assert.equal(users.status, 200, 'global API authentication accepts only the operation-bound assertion');
    assert.equal((await users.json())[0].email, 'owner@example.test');
    assert.ok(users.headers.get('x-mcp-correlation-id'));
    assert.equal((await request('/users', { credential: token.access_token })).status, 401);
    assert.equal((await request('/users', { credential: delegated.assertion, method: 'POST', body: {} })).status, 403);
    await prisma.user.update({ where: { id: user.id }, data: { role: 'agent' } });
    assert.equal((await request('/users', { credential: delegated.assertion })).status, 403, 'a live local role downgrade stops an issued delegation');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'admin', enabled: false } });
    assert.equal((await request('/users', { credential: delegated.assertion })).status, 403, 'disabling the local account stops the same delegation');
    await prisma.user.update({ where: { id: user.id }, data: { enabled: true } });

    // A newly constructed authorization service reads the same persistent
    // ledger rather than an MCP process's private memory or shared database.
    const restarted = new McpAuthorization({ config: personalMcpConfig(), repository: prismaMcpRepository(prisma),
      resolvePerson: async identity => ({ ...identity, role: 'admin' }) });
    assert.equal((await restarted.access(token.access_token)).grant.owner.id, String(user.id));
    const refreshInput = { grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: registered.client_id, resource: process.env.MCP_PUBLIC_URL };
    const rotating = await Promise.allSettled([restarted.exchange(refreshInput), restarted.exchange(refreshInput)]);
    assert.equal(rotating.filter(item => item.status === 'fulfilled').length, 1);
    const rotated = rotating.find(item => item.status === 'fulfilled').value;
    await assert.rejects(restarted.access(rotated.access_token), /revoked/, 'racing reuse commits family revocation after the successful rotation');
    assert.equal((await request('/users', { credential: delegated.assertion })).status, 401);
    assert.equal((await restarted.inventory(owner)).grants.length, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
    process.chdir(originalDirectory);
    await rm(directory, { recursive: true, force: true });
  }
});
