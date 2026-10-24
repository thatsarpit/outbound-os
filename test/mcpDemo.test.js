import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDemoMcpRequest } from '../web/src/demo/mcp.ts';

test('sample MCP screens have a complete fictional contract and cannot approve real access', async () => {
  const info = await handleDemoMcpRequest('/api/integrations/mcp').json();
  assert.equal(new URL(info.serverUrl).hostname, 'mcp.example.test');
  assert.equal(info.authorizationMode, 'personal');
  assert.match(info.health.message, /Sample/);
  const inventory = await handleDemoMcpRequest('/api/integrations/mcp/grants').json();
  assert.equal(inventory.mode, 'personal');
  assert.equal(inventory.grants[0].scope, 'mcp:read');
  assert.equal((await handleDemoMcpRequest('/api/integrations/mcp/grants/sample-codex-grant', { method: 'DELETE' })).status, 200);
  const revoked = await handleDemoMcpRequest('/api/integrations/mcp/grants').json();
  assert.ok(revoked.grants[0].revokedAt);
  assert.equal(handleDemoMcpRequest('/api/integrations/mcp/authorization/sample', { method: 'POST' }).status, 409);
  assert.equal(handleDemoMcpRequest('/api/leads'), null);
});
