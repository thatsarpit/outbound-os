import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const serverPath = fileURLToPath(new URL('../src/server.js', import.meta.url));

test('MCP transport authenticates, initializes and exposes tools without contacting providers', { timeout: 20000 }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'outbound-mcp-test-'));
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [serverPath], {
    cwd: temp,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: String(port), TRUST_PROXY: '127.0.0.2', MCP_BEARER_TOKEN: 'isolated-mcp-test-token', MCP_SERVICE_TOKEN: 'isolated-backend-test-token', BACKEND_URL: 'http://127.0.0.1:1', OAUTH_STORE_PATH: path.join(temp, 'oauth-store.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  const base = `http://127.0.0.1:${port}`;
  const client = new Client({ name: 'isolated-smoke-test', version: '1.0.0' });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { ready = (await fetch(`${base}/healthz`)).ok; } catch { /* Listener starts asynchronously. */ }
      if (ready) break;
      if (child.exitCode !== null) throw new Error(`MCP exited before listening: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'isolated MCP listener became healthy');
    const forged = { 'X-Forwarded-Host': 'untrusted.example.test', 'X-Forwarded-Proto': 'https' };
    const resource = await (await fetch(`${base}/.well-known/oauth-protected-resource`, { headers: forged })).json();
    assert.equal(resource.resource, `${base}/mcp`, 'untrusted forwarded headers cannot redirect resource discovery');
    const metadata = await (await fetch(`${base}/.well-known/oauth-authorization-server`, { headers: forged })).json();
    assert.equal(metadata.issuer, base);
    const denied = await fetch(`${base}/mcp`, { headers: forged });
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get('www-authenticate'), `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await fetch(`${base}/mcp`, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.equal((await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${name}` } })).status, 401);
      const refresh = await fetch(`${base}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: name, client_id: name }) });
      assert.equal(refresh.status, 400, 'inherited object properties are never refresh credentials');
    }
    const form = async (route, body) => fetch(`${base}${route}`, { method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const redirectUri = 'https://client.example.test/callback';
    const registration = await (await form('/oauth/register', { redirect_uris: [redirectUri] })).json();
    const verifier = 'v'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const authorize = async (pkce = challenge) => {
      const response = await form('/oauth/authorize', { password: 'isolated-mcp-test-token',
        client_id: registration.client_id, redirect_uri: redirectUri, code_challenge: pkce, state: 'fixture-state' });
      assert.equal(response.status, 302);
      const destination = new URL(response.headers.get('location'));
      assert.equal(destination.searchParams.get('state'), 'fixture-state');
      return destination.searchParams.get('code');
    };
    const grant = { grant_type: 'authorization_code', client_id: registration.client_id,
      redirect_uri: redirectUri, code_verifier: verifier };
    assert.equal((await form('/oauth/token', { ...grant, code: await authorize(), client_id: 'wrong-client' })).status, 400);
    assert.equal((await form('/oauth/token', { ...grant, code: await authorize(), code_verifier: 'short' })).status, 400);
    assert.equal((await form('/oauth/authorize', { password: 'isolated-mcp-test-token',
      client_id: registration.client_id, redirect_uri: redirectUri, code_challenge: 'bad' })).status, 400);
    const code = await authorize();
    const token = await (await form('/oauth/token', { ...grant, code })).json();
    assert.equal(typeof token.access_token, 'string');
    assert.equal((await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${token.access_token}` } })).status, 405);
    assert.equal((await form('/oauth/token', { ...grant, code })).status, 400, 'codes are single use');
    const refreshGrant = { grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: registration.client_id };
    assert.equal((await form('/oauth/token', { ...refreshGrant, client_id: 'wrong-client' })).status, 400);
    const rotated = await (await form('/oauth/token', refreshGrant)).json();
    assert.notEqual(rotated.refresh_token, token.refresh_token);
    assert.equal((await form('/oauth/token', refreshGrant)).status, 400, 'rotated refresh tokens cannot be replayed');
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: 'Bearer isolated-mcp-test-token' } } }));
    const response = await client.listTools();
    assert.ok(response.tools.length > 20, 'tool catalogue is populated');
    assert.equal(new Set(response.tools.map(tool => tool.name)).size, response.tools.length, 'tool names are unique');
    assert.ok(response.tools.every(tool => tool.inputSchema?.type === 'object'));
    for (const name of ['send_whatsapp', 'send_whatsapp_file']) {
      const tool = response.tools.find(tool => tool.name === name);
      assert.equal(tool.inputSchema.properties.client_message_id.type, 'string');
      assert.ok(!tool.inputSchema.required.includes('client_message_id'), 'existing MCP callers remain compatible');
    }
    for (const [name, args] of [['send_whatsapp', { lead_id: 1, message: 'Fixture reply' }], ['send_whatsapp_file', { lead_id: 1, media_file_id: 1 }]]) {
      const prepared = await client.callTool({ name, arguments: args });
      const data = JSON.parse(prepared.content[0].text);
      assert.equal(prepared.isError, true);
      assert.equal(data.reason, 'request_id_required', 'no-ID calls prepare an identity without contacting the unreachable backend');
      assert.match(data.client_message_id, /^[\w-]{16,100}$/);
    }
    let limited = false;
    for (let attempt = 0; attempt < 125; attempt++) {
      const response = await fetch(`${base}/mcp`, { headers: { Authorization: 'Bearer invalid' } });
      if (response.status === 429) { limited = true; break; }
    }
    assert.ok(limited, 'unauthenticated requests are rate limited');
    // Listing is read-only: the backend at port 1 was never needed.
  } finally {
    await client.close().catch(() => {});
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await rm(temp, { recursive: true, force: true });
  }
});
