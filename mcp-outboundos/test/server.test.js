import { test } from 'node:test';
import assert from 'node:assert/strict';
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
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: 'Bearer isolated-mcp-test-token' } } }));
    const response = await client.listTools();
    assert.ok(response.tools.length > 20, 'tool catalogue is populated');
    assert.equal(new Set(response.tools.map(tool => tool.name)).size, response.tools.length, 'tool names are unique');
    assert.ok(response.tools.every(tool => tool.inputSchema?.type === 'object'));
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
