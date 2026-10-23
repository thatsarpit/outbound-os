import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mcpConnectionStatus } from '../src/services/mcpStatus.js';

test('MCP setup rejects unsafe URLs without network requests or secret exposure', async () => {
  for (const url of ['', 'http://localhost:3010/mcp', 'https://user:password@example.test/mcp', 'https://example.test/mcp?token=private', 'https://example.test/mcp#private', 'https://example.test/other']) {
    const result = await mcpConnectionStatus({ MCP_PUBLIC_URL: url, MCP_SERVICE_TOKEN: 'private' }, () => { throw new Error('Must not fetch'); });
    assert.equal(result.serverUrl, null);
    assert.equal(result.health.status, 'not_configured');
    assert.equal(result.backendConfigured, true);
    assert.ok(!JSON.stringify(result).includes('private'));
  }
});

test('MCP setup separates public reachability from authorization and checks discovery origin', async () => {
  const calls = [];
  const env = { MCP_PUBLIC_URL: 'https://mcp.example.test/mcp', MCP_SERVICE_TOKEN: 'private' };
  const result = await mcpConnectionStatus(env, async (url, options) => {
    calls.push({ url: url.href, options });
    return Response.json(url.pathname.endsWith('healthz') ? { ok: true } : {
      issuer: 'https://mcp.example.test', authorization_endpoint: 'https://mcp.example.test/oauth/authorize', token_endpoint: 'https://mcp.example.test/oauth/token', code_challenge_methods_supported: ['S256'], secret: 'private',
    });
  });
  assert.equal(result.health.status, 'reachable');
  assert.equal(result.oauth.available, true);
  assert.match(result.health.message, /does not prove an agent is connected/);
  assert.deepEqual(calls.map(c => c.url), ['https://mcp.example.test/healthz', 'https://mcp.example.test/.well-known/oauth-authorization-server']);
  assert.ok(calls.every(c => c.options.redirect === 'manual' && !c.options.headers.Authorization));
  assert.ok(!JSON.stringify(result).includes('private'));
  const foreign = await mcpConnectionStatus(env, async (url) => Response.json(url.pathname.endsWith('healthz') ? { ok: true } : { issuer: 'https://other.test', authorization_endpoint: 'https://other.test/a', token_endpoint: 'https://other.test/t' }));
  assert.equal(foreign.oauth.available, false);
});

test('MCP setup aborts an unfinished sibling when the other probe fails', async () => {
  let siblingSignal;
  const result = await mcpConnectionStatus({ MCP_PUBLIC_URL: 'https://mcp.example.test/mcp' }, async (url, options) => {
    if (url.pathname.endsWith('healthz')) return new Response(null, { status: 503 });
    siblingSignal = options.signal;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  });
  assert.equal(result.health.status, 'unreachable');
  assert.equal(siblingSignal.aborted, true);
});

test('MCP setup fails closed on redirects, oversized metadata and network failures', async () => {
  const env = { MCP_PUBLIC_URL: 'https://mcp.example.test/mcp' };
  for (const fetcher of [async () => new Response(null, { status: 302, headers: { Location: 'https://other.test' } }), async () => Response.json({ large: 'x'.repeat(17000) }), async () => { throw new Error('private upstream credentials'); }]) {
    const result = await mcpConnectionStatus(env, fetcher);
    assert.equal(result.health.status, 'unreachable');
    assert.ok(!JSON.stringify(result).includes('private'));
  }
});
