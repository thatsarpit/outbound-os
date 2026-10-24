import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import express from 'express';
import { mountPersonalOAuth, personalReadToolAllowed } from '../src/personalOAuth.js';
import { McpAuthorization, emptyMcpLedger, MCP_READ_OPERATIONS } from '../../src/services/mcpAuthorization.js';
import { registerAllTools } from '../src/registerTools.js';

async function listener(app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

function fixtureFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: options.method || 'GET', headers: options.headers }, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers: incoming.headers })));
    });
    request.on('error', reject);
    request.end(options.body);
  });
}

test('personal OAuth HTTP bridge requires explicit approval, bound cookie, canonical host and client PKCE', async () => {
  let state = emptyMcpLedger();
  const config = { issuer: 'https://mcp.example.test', resource: 'https://mcp.example.test/mcp',
    dashboard: 'https://app.example.test', workspace: 'fixture-installation', secret: 'private-fixture-control-'.repeat(2), legacyCompat: false };
  const owner = { id: '1', provider: 'local', orgId: 'local', workspace: config.workspace };
  const service = new McpAuthorization({ config,
    repository: { async mutate(fn) { const next = structuredClone(state); const result = fn(next); state = next; return result; } },
    resolvePerson: async actor => ({ ...actor, role: 'admin', name: 'Fixture admin' }) });
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  const control = (operation, body) => ({ register: () => service.register(body),
    request: () => service.createRequest(body.parameters, body.browserNonce),
    complete: () => service.complete(body.id, body.browserNonce), token: () => service.exchange(body),
  })[operation]();
  mountPersonalOAuth(app, config, control);
  const server = await listener(app);
  const headers = { Host: 'mcp.example.test', 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json' };
  const post = (path, body) => fixtureFetch(`${server.base}${path}`, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'manual' });
  try {
    const metadata = await (await fixtureFetch(`${server.base}/.well-known/oauth-authorization-server`, { headers })).json();
    assert.deepEqual(metadata.scopes_supported, ['mcp:read'], JSON.stringify(metadata));
    assert.equal(metadata.issuer, config.issuer);
    assert.equal((await fixtureFetch(`${server.base}/.well-known/oauth-authorization-server`)).status, 400, 'conflicting direct Host is rejected');
    const redirect = 'https://client.example.test/callback?fixed=1';
    const registered = await (await post('/oauth/register', { redirect_uris: [redirect], client_name: 'Fixture client' })).json();
    const verifier = 'v'.repeat(43);
    const parameters = new URLSearchParams({ response_type: 'code', client_id: registered.client_id, redirect_uri: redirect,
      code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'), resource: config.resource, state: 'opaque value+&=' });
    const duplicate = await fixtureFetch(`${server.base}/oauth/authorize?${parameters}&client_id=wrong`, { headers, redirect: 'manual' });
    assert.equal(duplicate.status, 400);
    const start = await fixtureFetch(`${server.base}/oauth/authorize?${parameters}`, { headers, redirect: 'manual' });
    assert.equal(start.status, 303);
    const consent = new URL(start.headers.get('location'));
    assert.equal(consent.origin, config.dashboard);
    const requestId = consent.searchParams.get('request_id');
    const cookie = start.headers.get('set-cookie');
    for (const property of ['__Host-mcp-', 'Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']) assert.ok(cookie.includes(property));
    assert.ok(!cookie.includes('Domain='), 'transaction cookie remains host-only');
    assert.equal(start.headers.get('referrer-policy'), 'no-referrer');
    const completionPath = `/oauth/complete?request_id=${requestId}`;
    const complete = extraHeaders => fixtureFetch(`${server.base}${completionPath}`, { headers: { ...headers, ...extraHeaders }, redirect: 'manual' });
    assert.equal((await complete({})).status, 403);
    assert.equal((await complete({ Cookie: cookie.split(';')[0] })).status, 410, 'GET cannot approve a pending request');
    const details = await service.details(requestId, owner);
    await service.decide(requestId, { decision: 'allow', decisionNonce: details.decisionNonce }, owner);
    const done = await complete({ Cookie: cookie.split(';')[0] });
    assert.equal(done.status, 303);
    const callback = new URL(done.headers.get('location'));
    assert.equal(callback.origin, new URL(redirect).origin);
    assert.equal(callback.searchParams.get('state'), 'opaque value+&=');
    const token = await post('/oauth/token', { grant_type: 'authorization_code', code: callback.searchParams.get('code'),
      code_verifier: verifier, redirect_uri: redirect, client_id: registered.client_id, resource: config.resource });
    assert.equal(token.status, 200);
    const credentials = await token.json();
    assert.match(credentials.access_token, /^mcp_personal_/);
    assert.equal(credentials.scope, 'mcp:read');
    assert.equal((await complete({ Cookie: cookie.split(';')[0] })).status, 403, 'completed requests cannot be repeated');
    assert.equal((await post('/oauth/authorize', { password: 'any' })).status, 405, 'no password-based issuance in personal mode');
  } finally { await server.close(); }
});

test('personal tool catalogue and API operation policy match every registered tool; unknown tools deny', () => {
  const names = new Set();
  registerAllTools({ tool(name) { names.add(name); } });
  for (const name of Object.keys(MCP_READ_OPERATIONS)) {
    assert.ok(names.has(name), `policy name ${name} exists in current catalogue`);
    assert.equal(personalReadToolAllowed(name), true);
  }
  for (const name of names) assert.equal(personalReadToolAllowed(name), Object.hasOwn(MCP_READ_OPERATIONS, name));
  for (const name of ['send_whatsapp', 'send_email', 'create_lead', 'create_campaign', 'start_campaign', 'system_pause_resume', '__proto__', 'not_registered']) {
    assert.equal(personalReadToolAllowed(name), false);
  }
});

test('personal OAuth retains only explicitly enabled legacy refresh compatibility', async () => {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  const config = { issuer: 'https://mcp.example.test', resource: 'https://mcp.example.test/mcp',
    dashboard: 'https://app.example.test', legacyCompat: true };
  const personalCalls = [];
  mountPersonalOAuth(app, config, async (operation, body) => {
    personalCalls.push({ operation, body });
    return { fixture: 'personal' };
  });
  let legacyCalls = 0;
  app.post('/oauth/token', (_req, res) => { legacyCalls++; res.json({ fixture: 'legacy' }); });
  const server = await listener(app);
  const headers = { Host: 'mcp.example.test', 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json' };
  const post = body => fixtureFetch(`${server.base}/oauth/token`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    const legacy = await post({ grant_type: 'refresh_token', refresh_token: 'legacy-fixture-refresh', client_id: 'old-fixture-client' });
    assert.deepEqual(await legacy.json(), { fixture: 'legacy' });
    assert.equal(legacyCalls, 1);
    assert.equal(personalCalls.length, 0);
    const personal = await post({ grant_type: 'refresh_token', refresh_token: `mcp_refresh_${'n'.repeat(43)}`, client_id: 'new-fixture-client' });
    assert.deepEqual(await personal.json(), { fixture: 'personal' });
    assert.equal(personalCalls.length, 1, 'personal refreshes never fall back to shared credentials');
    assert.equal(legacyCalls, 1);
    config.legacyCompat = false;
    await post({ grant_type: 'refresh_token', refresh_token: 'legacy-fixture-refresh', client_id: 'old-fixture-client' });
    assert.equal(personalCalls.length, 2, 'disabling compatibility removes the legacy refresh route');
    assert.equal(legacyCalls, 1);
  } finally { await server.close(); }
});
