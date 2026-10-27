import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { McpAuthorization, emptyMcpLedger, mcpHash, parseMcpAuthorization, mcpReadOperationAllowed, personalMcpConfig } from '../src/services/mcpAuthorization.js';

function fixture(scope = 'mcp:read') {
  let now = 1_000_000;
  let role = 'admin';
  let exists = true;
  let failPersistence = false;
  let state = emptyMcpLedger();
  const config = { issuer: 'https://mcp.example.test', resource: 'https://mcp.example.test/mcp', dashboard: 'https://app.example.test', workspace: 'installation-fixture', secret: 'fixture-control-secret-'.repeat(3) };
  const owner = { id: '1', provider: 'local', orgId: 'local', workspace: config.workspace };
  const repository = { async mutate(fn) {
    const next = structuredClone(state);
    const result = fn(next);
    if (failPersistence) throw new Error('Fixture disk unavailable');
    state = next;
    return result;
  } };
  const service = new McpAuthorization({ config, repository, now: () => now,
    resolvePerson: async supplied => exists ? { ...supplied, role, name: 'Fixture owner', email: 'owner@example.test' } : null });
  const verifier = 'v'.repeat(43);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirect = 'http://127.0.0.1:34567/callback?client=fixture';
  const browserNonce = 'n'.repeat(43);
  async function request() {
    const client = await service.register({ redirect_uris: [redirect], client_name: '<Fixture client>' });
    const parameters = { response_type: 'code', client_id: client.client_id, redirect_uri: redirect,
      code_challenge: challenge, code_challenge_method: 'S256', resource: config.resource, ...(scope ? { scope } : {}), state: 'opaque state+&=' };
    const pending = await service.createRequest(parameters, browserNonce);
    return { client, parameters, pending };
  }
  async function authorizedCode() {
    const result = await request();
    const details = await service.details(result.pending.id, owner);
    await service.decide(result.pending.id, { decision: 'allow', decisionNonce: details.decisionNonce }, owner);
    const done = await service.complete(result.pending.id, browserNonce);
    const callback = new URL(done.redirectUrl);
    assert.equal(callback.searchParams.get('state'), 'opaque state+&=');
    assert.equal(callback.searchParams.get('iss'), config.issuer);
    return { ...result, code: callback.searchParams.get('code') };
  }
  const tokenInput = code => ({ grant_type: 'authorization_code', code: code.code, code_verifier: verifier,
    redirect_uri: redirect, client_id: code.client.client_id, resource: config.resource });
  return { service, owner, config, request, authorizedCode, tokenInput, browserNonce,
    state: () => state, setRole: value => { role = value; }, remove: () => { exists = false; },
    advance: ms => { now += ms; }, failDisk: () => { failPersistence = true; } };
}

test('personal configuration is opt-in and requires pinned HTTPS origins, installation and independent secret', () => {
  assert.equal(personalMcpConfig({}), null);
  const env = { MCP_AUTH_MODE: 'personal', MCP_PUBLIC_URL: 'https://mcp.example.test/mcp', MCP_DASHBOARD_ORIGIN: 'https://app.example.test', MCP_WORKSPACE_ID: 'fixture', MCP_CONTROL_SECRET: 'f'.repeat(32) };
  assert.equal(personalMcpConfig(env).resource, env.MCP_PUBLIC_URL);
  for (const patch of [{ MCP_PUBLIC_URL: 'https://mcp.example.test/elsewhere' }, { MCP_DASHBOARD_ORIGIN: 'http://app.example.test' }, { MCP_WORKSPACE_ID: '' }, { MCP_CONTROL_SECRET: 'short' }]) {
    assert.throws(() => personalMcpConfig({ ...env, ...patch }));
  }
});

test('strict OAuth parser rejects arrays, unsupported response, resource, permissions and malformed PKCE', async () => {
  const f = fixture();
  const { parameters } = await f.request();
  for (const changed of [{ client_id: [parameters.client_id] }, { response_type: 'token' }, { resource: 'https://other.example.test/mcp' }, { scope: 'mcp:send' }, { code_challenge_method: 'plain' }, { code_challenge: 'short' }, { state: 'x'.repeat(5000) }, { unknown: 'value' }]) {
    assert.throws(() => parseMcpAuthorization({ ...parameters, ...changed }, f.config.resource));
  }
  for (const changed of ['https://claude.ai/callback', 'http://127.0.0.1:9/callback?client=fixture', 'http://127.0.0.1:34567/other']) {
    await assert.rejects(f.service.createRequest({ ...parameters, redirect_uri: changed }, f.browserNonce), /not registered/);
  }
});

test('normal signed-in approval, same-browser completion, PKCE issuance and hashed credential storage', async () => {
  const f = fixture();
  const code = await f.authorizedCode();
  const token = await f.service.exchange(f.tokenInput(code));
  const serialized = JSON.stringify(f.state());
  for (const secret of [code.code, token.access_token, token.refresh_token, f.browserNonce]) assert.ok(!serialized.includes(secret));
  assert.equal((await f.service.access(token.access_token)).person.id, '1');
  const inventory = await f.service.inventory(f.owner);
  assert.equal(inventory.grants.length, 1);
  assert.equal(inventory.grants[0].scope, 'mcp:read');
  assert.equal(inventory.grants[0].lastToolAt, null);
  await assert.rejects(f.service.exchange(f.tokenInput(code)), /expired or invalid/);
});

test('requests cannot be approved by service/delegated identities, other workspaces, roles or stale account views', async () => {
  const f = fixture();
  const { pending } = await f.request();
  const details = await f.service.details(pending.id, f.owner);
  for (const bad of [{ ...f.owner, id: 'mcp-service' }, { ...f.owner, delegated: true }, { ...f.owner, workspace: 'other' }]) {
    await assert.rejects(f.service.details(pending.id, bad), /personal workspace administrator/);
  }
  await assert.rejects(f.service.decide(pending.id, { decision: 'allow', decisionNonce: details.decisionNonce }, { ...f.owner, id: '2' }), /no longer valid/);
  f.setRole('manager');
  await assert.rejects(f.service.decide(pending.id, { decision: 'allow', decisionNonce: details.decisionNonce }, f.owner), /membership/);
  assert.equal(Object.keys(f.state().grants).length, 0);
});

test('request IDs alone, wrong browser cookies, denial and expired transactions cannot issue access', async () => {
  const f = fixture();
  const { pending } = await f.request();
  await assert.rejects(f.service.complete(pending.id, f.browserNonce), /already completed/);
  const details = await f.service.details(pending.id, f.owner);
  await f.service.decide(pending.id, { decision: 'deny', decisionNonce: details.decisionNonce }, f.owner);
  await assert.rejects(f.service.complete(pending.id, 'wrong'), /same browser/);
  const completed = await f.service.complete(pending.id, f.browserNonce);
  assert.equal(new URL(completed.redirectUrl).searchParams.get('error'), 'access_denied');
  assert.equal(Object.keys(f.state().codes).length, 0);
  const next = await f.request();
  f.advance(5 * 60_000);
  await assert.rejects(f.service.details(next.pending.id, f.owner), /expired/);
});

test('code exchange binds exact client, callback, resource and PKCE, and concurrent exchange issues one grant', async () => {
  const f = fixture();
  const code = await f.authorizedCode();
  for (const patch of [{ client_id: 'wrong' }, { redirect_uri: 'https://client.example.test/cb' }, { resource: 'https://other.example.test/mcp' }, { code_verifier: 'bad' }]) {
    await assert.rejects(f.service.exchange({ ...f.tokenInput(code), ...patch }));
  }
  const attempts = await Promise.allSettled([f.service.exchange(f.tokenInput(code)), f.service.exchange(f.tokenInput(code))]);
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(Object.keys(f.state().grants).length, 1);
});

test('storage failure never returns a usable credential or partially consumes a code', async () => {
  const f = fixture();
  const code = await f.authorizedCode();
  f.failDisk();
  await assert.rejects(f.service.exchange(f.tokenInput(code)), /disk unavailable/);
  assert.equal(Object.keys(f.state().access).length, 0);
  assert.equal(Object.keys(f.state().grants).length, 0);
  assert.ok(f.state().codes[mcpHash(code.code)]);
});

test('refresh rotation detects reuse and revokes its family without affecting another connection', async () => {
  const f = fixture();
  const firstCode = await f.authorizedCode();
  const first = await f.service.exchange(f.tokenInput(firstCode));
  const other = await f.service.exchange(f.tokenInput(await f.authorizedCode()));
  const refresh = { grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: firstCode.client.client_id, resource: f.config.resource };
  await assert.rejects(f.service.exchange({ ...refresh, client_id: 'wrong' }));
  const rotated = await f.service.exchange(refresh);
  await assert.rejects(f.service.exchange(refresh), /reused/);
  await assert.rejects(f.service.access(rotated.access_token), /revoked/);
  await assert.rejects(f.service.access(first.access_token), /revoked/);
  assert.ok(await f.service.access(other.access_token));
});

test('consumed refresh hashes remain available for replay detection beyond their former idle deadline', async () => {
  const f = fixture();
  const code = await f.authorizedCode();
  const first = await f.service.exchange(f.tokenInput(code));
  const refresh = { grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: code.client.client_id, resource: f.config.resource };
  const second = await f.service.exchange(refresh);
  f.advance(6 * 24 * 60 * 60_000);
  const third = await f.service.exchange({ ...refresh, refresh_token: second.refresh_token });
  f.advance(2 * 24 * 60 * 60_000);
  await assert.rejects(f.service.exchange(refresh), /reused/);
  await assert.rejects(f.service.exchange({ ...refresh, refresh_token: third.refresh_token }), /Invalid refresh token/);
});

test('live downgrade, removal, explicit revoke and access expiry stop existing tokens and delegated assertions', async () => {
  const f = fixture();
  const token = await f.service.exchange(f.tokenInput(await f.authorizedCode()));
  const { assertion } = await f.service.delegate({ token: token.access_token, tool: 'system_status', method: 'GET', path: '/api/system/status' });
  const actor = await f.service.verifyDelegation(assertion, 'GET', '/api/system/status');
  assert.equal(actor.delegated, true);
  f.setRole('agent');
  await assert.rejects(f.service.access(token.access_token), /membership/);
  await assert.rejects(f.service.verifyDelegation(assertion, 'GET', '/api/system/status'), /membership/);
  f.setRole('admin');
  const inventory = await f.service.inventory(f.owner);
  await f.service.revoke(inventory.grants[0].id, f.owner);
  await assert.rejects(f.service.verifyDelegation(assertion, 'GET', '/api/system/status'), /revoked/);
  const second = await f.service.exchange(f.tokenInput(await f.authorizedCode()));
  f.advance(15 * 60_000);
  await assert.rejects(f.service.access(second.access_token), /revoked/);
  f.remove();
  await assert.rejects(f.service.inventory(f.owner), /membership/);
});

test('scope policy denies unknown tools, writes, path substitution and signed-assertion tampering at API boundary', async () => {
  const f = fixture();
  const token = await f.service.exchange(f.tokenInput(await f.authorizedCode()));
  for (const operation of [{ tool: 'send_whatsapp', method: 'POST', path: '/api/leads/1/send' }, { tool: 'system_status', method: 'GET', path: '/api/users' }, { tool: 'unknown', method: 'GET', path: '/api/system/status' }]) {
    await assert.rejects(f.service.delegate({ token: token.access_token, ...operation }), /read-only/);
  }
  const { assertion } = await f.service.delegate({ token: token.access_token, tool: 'get_lead', method: 'GET', path: '/api/leads/1' });
  for (const [method, path] of [['POST', '/api/leads/1'], ['GET', '/api/leads/2']]) await assert.rejects(f.service.verifyDelegation(assertion, method, path));
  await assert.rejects(f.service.verifyDelegation(`${assertion}tampered`, 'GET', '/api/leads/1'));
  assert.equal(mcpReadOperationAllowed('get_lead', 'GET', '/api/leads/1/../2'), false);
  f.advance(30_001);
  await assert.rejects(f.service.verifyDelegation(assertion, 'GET', '/api/leads/1'), /not permitted/);
});

test('refresh absolute/idle expiry and audited tool success are independent of transport health', async () => {
  const f = fixture();
  const code = await f.authorizedCode();
  const token = await f.service.exchange(f.tokenInput(code));
  const { assertion } = await f.service.delegate({ token: token.access_token, tool: 'system_status', method: 'GET', path: '/api/system/status' });
  const actor = await f.service.verifyDelegation(assertion, 'GET', '/api/system/status');
  await f.service.recordTool(actor, 200, 'fixture-correlation');
  assert.equal((await f.service.inventory(f.owner)).grants[0].lastToolAt, 1_000_000);
  assert.equal(f.state().events.at(-1).tool, 'system_status');
  f.advance(7 * 24 * 60 * 60_000);
  await assert.rejects(f.service.exchange({ grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: code.client.client_id, resource: f.config.resource }), /expired or invalid/);
});

test('regular refreshes cannot extend the absolute grant lifetime and final access expires with the family', async () => {
  const f = fixture();
  const code = await f.authorizedCode();
  let token = await f.service.exchange(f.tokenInput(code));
  const refresh = () => f.service.exchange({ grant_type: 'refresh_token', refresh_token: token.refresh_token,
    client_id: code.client.client_id, resource: f.config.resource });
  for (let rotation = 0; rotation < 4; rotation++) {
    f.advance(6 * 24 * 60 * 60_000);
    token = await refresh();
  }
  f.advance((6 * 24 * 60 - 5) * 60_000);
  token = await refresh();
  assert.equal(token.expires_in, 5 * 60, 'an access credential cannot outlive its grant');
  assert.ok(await f.service.access(token.access_token));
  f.advance(5 * 60_000);
  await assert.rejects(f.service.access(token.access_token), /expired or revoked/);
  await assert.rejects(refresh(), /expired or invalid/);
  assert.equal((await f.service.inventory(f.owner)).grants.length, 0);
  assert.equal(Object.keys(f.state().refresh).length, 0, 'expired family replay records prune together');
});


test('authorization handles cannot address inherited object properties', async () => {
  const f = fixture();
  const { pending, parameters } = await f.request();
  await assert.rejects(f.service.createRequest({ ...parameters, client_id: 'constructor' }, f.browserNonce), /not registered/);
  for (const id of ['__proto__', 'constructor', 'prototype', 'toString', ['request'], null]) {
    await assert.rejects(f.service.details(id, f.owner), /Invalid connection request/);
    await assert.rejects(f.service.complete(id, f.browserNonce), /Invalid connection request/);
    await assert.rejects(f.service.revoke(id, f.owner), /Connection not found/);
  }
  assert.equal(Object.hasOwn(f.state().requests, pending.id), false, 'public handles are hashed before record lookup');
  assert.equal(Object.hasOwn(f.state().requests, mcpHash(pending.id)), true);
  assert.equal((await f.service.details(pending.id, f.owner)).id, pending.id);
  assert.equal(Object.prototype.status, undefined);
});

test('explicitly consented write grants authorize operations and remain bound to their tool, path and current owner', async () => {
  const f = fixture('mcp:read mcp:write');
  const code = await f.authorizedCode();
  const token = await f.service.exchange(f.tokenInput(code));
  assert.equal(token.scope, 'mcp:read mcp:write');
  for (const [tool, method, path] of [
    ['create_campaign', 'POST', '/api/campaigns'], ['populate_campaign', 'POST', '/api/campaigns/1/populate'],
    ['start_campaign', 'POST', '/api/campaigns/1/start'], ['send_whatsapp', 'POST', '/api/leads/1/send'],
    ['send_email', 'POST', '/api/leads/1/email/send'], ['update_lead', 'PATCH', '/api/leads/1'],
    ['delete_lead', 'DELETE', '/api/leads/1'], ['bulk_lead_action', 'POST', '/api/leads/bulk'],
    ['system_pause_resume', 'POST', '/api/system/resume'],
  ]) {
    const { assertion } = await f.service.delegate({ token: token.access_token, tool, method, path });
    const actor = await f.service.verifyDelegation(assertion, method, path);
    assert.equal(actor.mcpTool, tool);
    await assert.rejects(f.service.verifyDelegation(assertion, method, path + '/other'));
  }
  await assert.rejects(f.service.delegate({ token: token.access_token, tool: 'start_campaign', method: 'POST', path: '/api/system/resume' }));
  await assert.rejects(f.service.delegate({ token: token.access_token, tool: 'unknown_admin', method: 'POST', path: '/api/config/env' }));
  const refreshed = await f.service.exchange({ grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: code.client.client_id, resource: f.config.resource });
  assert.equal(refreshed.scope, token.scope);
  f.setRole('agent');
  await assert.rejects(f.service.delegate({ token: refreshed.access_token, tool: 'start_campaign', method: 'POST', path: '/api/campaigns/1/start' }), /membership/);
});

test('existing read grants cannot gain writes through code exchange, refresh or delegation', async () => {
  const f = fixture();
  const code = await f.authorizedCode();
  await assert.rejects(f.service.exchange({ ...f.tokenInput(code), scope: 'mcp:read mcp:write' }), /change permissions/);
  const token = await f.service.exchange(f.tokenInput(code));
  await assert.rejects(f.service.exchange({ grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: code.client.client_id,
    resource: f.config.resource, scope: 'mcp:read mcp:write' }), /change permissions/);
  const refreshed = await f.service.exchange({ grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: code.client.client_id, resource: f.config.resource });
  assert.equal(refreshed.scope, 'mcp:read');
  await assert.rejects(f.service.delegate({ token: refreshed.access_token, tool: 'send_email', method: 'POST', path: '/api/leads/1/email/send' }), /read-only/);
  const next = fixture(null);
  const request = await next.request();
  assert.equal((await next.service.details(request.pending.id, next.owner)).scope, 'mcp:read mcp:write', 'new unspecified-scope requests disclose full operations before consent');
});
