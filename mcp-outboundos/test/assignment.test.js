import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { mcpRequestContext } from '../src/client.js';
import { registerLeadTools } from '../src/tools/leads.js';
import { registerSystemTools } from '../src/tools/system.js';

const tools = new Map();
const registry = { tool(name, _description, schema, handler) { tools.set(name, { schema: z.object(schema), handler }); } };
registerLeadTools(registry);
registerSystemTools(registry);
const invoke = (name, args) => tools.get(name).handler(tools.get(name).schema.parse(args));
const payload = result => JSON.parse(result.content[0].text);

test('legacy member discovery returns provider-scoped assignment keys and local numeric compatibility', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(new URL(url).pathname, '/api/workspace/members');
    return Response.json({ members: [
      { key: 'clerk:org_fixture:user_agent', provider: 'clerk', externalId: 'user_agent', orgId: 'org_fixture', name: 'Clerk fixture', role: 'agent' },
      { key: 'local:local:2', provider: 'local', externalId: '2', orgId: 'local', name: 'Local fixture', role: 'agent' },
    ] });
  });
  const members = payload(await invoke('list_users', {}));
  assert.equal(members[0].memberKey, 'clerk:org_fixture:user_agent');
  assert.equal(members[0].id, 'user_agent');
  assert.equal(members[1].memberKey, 'local:local:2');
  assert.equal(members[1].id, 2);
});

test('directory permissions and provider failures cannot fall back to unrelated local users', async t => {
  for (const status of [403, 503]) {
    const calls = [];
    const mock = t.mock.method(globalThis, 'fetch', async url => {
      calls.push(new URL(url).pathname);
      return Response.json({ error: 'Fixture directory unavailable' }, { status });
    });
    assert.equal((await invoke('list_users', {})).isError, true);
    assert.deepEqual(calls, ['/api/workspace/members']);
    mock.mock.restore();
  }
});

test('lead assignment forwards an explicit key, clear or legacy local ID and rejects ambiguous inputs', async t => {
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/leads/12/assign');
    bodies.push(JSON.parse(options.body));
    return Response.json({ id: 12 });
  });
  for (const target of [{ member_key: 'clerk:org_fixture:user_agent' }, { member_key: null }, { user_id: 2 }, { user_id: null }]) {
    assert.equal((await invoke('lead_assign', { lead_id: 12, ...target })).isError, undefined);
  }
  assert.deepEqual(bodies, [{ memberKey: 'clerk:org_fixture:user_agent' }, { memberKey: null }, { userId: 2 }, { userId: null }]);
  for (const target of [{}, { member_key: null, user_id: 2 }]) {
    const result = await invoke('lead_assign', { lead_id: 12, ...target });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /exactly one/);
  }
  assert.equal(bodies.length, 4, 'missing or ambiguous targets never contact the API');
  assert.throws(() => invoke('lead_assign', { lead_id: 12, user_id: 0 }));
});

test('personal read-only member listing retains its authorized API operation', async t => {
  const config = { MCP_AUTH_MODE: 'personal', MCP_PUBLIC_URL: 'https://mcp.example.test/mcp', MCP_DASHBOARD_ORIGIN: 'https://app.example.test', MCP_CONTROL_SECRET: 'obviously-fake-control-fixture-'.repeat(2) };
  const previous = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
  Object.assign(process.env, config);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const paths = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname;
    paths.push(path);
    if (path === '/api/mcp-control/delegate') {
      assert.equal(JSON.parse(options.body).path, '/api/users');
      return Response.json({ assertion: 'fixture-operation-assertion' });
    }
    assert.equal(path, '/api/users');
    return Response.json([{ id: 1, name: 'Fixture owner', enabled: true }]);
  });
  const result = await mcpRequestContext.run({ personalToken: 'mcp_personal_fixture', tool: 'list_users' }, () => invoke('list_users', {}));
  assert.equal(payload(result)[0].id, 1);
  assert.deepEqual(paths, ['/api/mcp-control/delegate', '/api/users']);
});
