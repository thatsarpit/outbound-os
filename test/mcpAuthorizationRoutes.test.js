import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import express from 'express';

test('personal MCP API requires separate control credentials, a real personal session and same-origin explicit consent', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'outbound-mcp-personal-'));
  Object.assign(process.env, {
    NODE_ENV: 'test', AUTH_PROVIDER: 'local', DATABASE_URL: `file:${path.join(directory, 'fixture.db')}`,
    JWT_SECRET: 'obviously-fake-fixture-signing-key-'.repeat(2), MCP_SERVICE_TOKEN: 'fixture-legacy-service-token',
    MCP_AUTH_MODE: 'personal', MCP_PUBLIC_URL: 'https://mcp.example.test/mcp', MCP_DASHBOARD_ORIGIN: 'https://app.example.test',
    MCP_WORKSPACE_ID: 'fixture-installation', MCP_CONTROL_SECRET: 'obviously-fake-control-key-'.repeat(2),
  });
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { signToken } = await import('../src/auth/rbac.js');
  const { requireRole } = await import('../src/auth/index.js');
  const { default: router } = await import('../src/routes/mcpAuthorization.js');
  await prisma.$executeRawUnsafe('CREATE TABLE User (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, passwordHash TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'agent\', phone TEXT, enabled BOOLEAN NOT NULL DEFAULT true, lastLoginAt DATETIME, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL)');
  await prisma.$executeRawUnsafe('CREATE TABLE McpAuthorizationStore (id TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL DEFAULT 0, value TEXT NOT NULL, updatedAt DATETIME NOT NULL)');
  const user = await prisma.user.create({ data: { name: 'Fixture owner', email: 'owner@example.test', passwordHash: 'unused-fixture-hash', role: 'admin' } });
  const personal = signToken(user);
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  app.use('/api', requireRole('viewer'));
  app.get('/api/system/status', requireRole('viewer'), (req, res) => res.json({ actor: req.user.id, delegated: req.user.delegated || false }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(endpoint, { credential = personal, method = 'GET', body, origin } = {}) {
    return fetch(`${base}${endpoint}`, { method, headers: {
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  const control = (operation, body) => request(`/mcp-control/${operation}`, { method: 'POST', credential: process.env.MCP_CONTROL_SECRET, body });
  try {
    const registration = { redirect_uris: ['https://client.example.test/callback'], client_name: 'Fixture client' };
    for (const credential of [personal, process.env.MCP_SERVICE_TOKEN, null]) {
      assert.equal((await request('/mcp-control/register', { method: 'POST', credential, body: registration })).status, 401);
    }
    const registered = await (await control('register', registration)).json();
    const verifier = 'v'.repeat(43);
    const parameters = { response_type: 'code', client_id: registered.client_id, redirect_uri: registration.redirect_uris[0],
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', resource: process.env.MCP_PUBLIC_URL };
    const pending = await (await control('request', { parameters, browserNonce: 'n'.repeat(43) })).json();
    const endpoint = `/integrations/mcp/authorization/${pending.id}`;
    assert.equal((await request(endpoint, { credential: process.env.MCP_SERVICE_TOKEN })).status, 403, 'legacy service credential cannot approve');
    assert.equal((await request(endpoint, { credential: null })).status, 401);
    const detailsResponse = await request(endpoint);
    assert.equal(detailsResponse.headers.get('cache-control'), 'no-store');
    const details = await detailsResponse.json();
    const decision = { decision: 'allow', decisionNonce: details.decisionNonce };
    for (const origin of [undefined, 'https://attacker.example.test']) {
      assert.equal((await request(endpoint, { method: 'POST', body: decision, origin })).status, 403);
    }
    assert.equal((await request(endpoint, { method: 'POST', body: decision, origin: process.env.MCP_DASHBOARD_ORIGIN })).status, 200);
    assert.equal((await request(endpoint, { method: 'POST', body: decision, origin: process.env.MCP_DASHBOARD_ORIGIN })).status, 409, 'decisions are one-use');
    const completed = await (await control('complete', { id: pending.id, browserNonce: 'n'.repeat(43) })).json();
    const code = new URL(completed.redirectUrl).searchParams.get('code');
    const token = await (await control('token', { grant_type: 'authorization_code', code, code_verifier: verifier,
      client_id: registered.client_id, redirect_uri: registration.redirect_uris[0], resource: process.env.MCP_PUBLIC_URL })).json();
    assert.equal((await request('/system/status', { credential: token.access_token })).status, 401, 'resource token cannot act as a dashboard/API session');
    const delegated = await (await control('delegate', { token: token.access_token, tool: 'system_status', method: 'GET', path: '/api/system/status' })).json();
    const response = await request('/system/status', { credential: delegated.assertion });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { actor: String(user.id), delegated: true });
    assert.ok(response.headers.get('x-mcp-correlation-id'));
    assert.equal((await request('/integrations/mcp/grants', { credential: delegated.assertion })).status, 403, 'delegation cannot be repurposed for approval or grant inventory');
    const grants = await (await request('/integrations/mcp/grants')).json();
    assert.equal(grants.grants.length, 1);
    assert.equal((await request(`/integrations/mcp/grants/${grants.grants[0].id}`, { method: 'DELETE', origin: process.env.MCP_DASHBOARD_ORIGIN })).status, 200);
    assert.equal((await request('/system/status', { credential: delegated.assertion })).status, 401, 'revocation stops an already-issued API assertion');
    const records = await prisma.mcpAuthorizationStore.findUnique({ where: { id: 'mcp-v1' } });
    assert.ok(!records.value.includes(token.access_token));
    assert.ok(!records.value.includes(token.refresh_token));
    assert.ok(!records.value.includes(process.env.MCP_CONTROL_SECRET));
  } finally {
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
