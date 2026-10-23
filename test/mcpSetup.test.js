import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mcpReferenceConfiguration, mcpSetupCommand } from '../web/src/lib/mcp-setup.ts';

test('copied MCP commands preserve the URL as one inert shell argument', () => {
  for (const url of [
    'https://mcp.example.test/mcp',
    'https://mcp.example.test/mcp?x=$(printf substituted)&y=`printf substituted`',
    "https://mcp.example.test/a'quote/mcp?x=one two",
  ]) {
    const command = mcpSetupCommand('claude-code', url);
    const printed = execFileSync('/bin/sh', ['-c', command.replace('claude mcp add --transport http outbound-os', 'printf %s')], { encoding: 'utf8' });
    assert.equal(printed, url);
  }
});

test('Codex setup prepares an HTTP server then starts OAuth, without embedding a token', () => {
  const command = mcpSetupCommand('codex', 'https://mcp.example.test/mcp');
  assert.equal(command, "codex mcp add outbound-os --url 'https://mcp.example.test/mcp'\ncodex mcp login outbound-os");
  assert.doesNotMatch(command, /Bearer|MCP_SERVICE_TOKEN|MCP_BEARER_TOKEN|OAUTH_PASSWORD/);
});

test('reference configuration uses a client-side placeholder and preserves an escaped URL', () => {
  const url = 'https://mcp.example.test/mcp?name="quoted"';
  const config = JSON.parse(mcpReferenceConfiguration(url));
  assert.equal(config.mcpServers['outbound-os'].url, url);
  assert.equal(config.mcpServers['outbound-os'].type, 'http');
  assert.equal(config.mcpServers['outbound-os'].headers.Authorization, 'Bearer <MCP_CLIENT_TOKEN>');
  assert.doesNotMatch(JSON.stringify(config), /MCP_SERVICE_TOKEN|MCP_BEARER_TOKEN|OAUTH_PASSWORD/);
});
