import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCP_READ_OPERATIONS, MCP_WRITE_OPERATIONS } from '../../shared/mcpOperations.js';

const serverPath = fileURLToPath(new URL('../src/server.js', import.meta.url));

test('personal MCP filters writes and isolates concurrent clients through operation-bound backend delegation', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'outbound-mcp-personal-transport-'));
  const controlSecret = 'obviously-fake-fixture-control-'.repeat(2);
  const backend = express();
  backend.use(express.json());
  const calls = [];
  backend.post('/api/mcp-control/:operation', async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${controlSecret}`);
    if (req.params.operation === 'inspect') return res.json({ grantId: req.body.token.slice(-1), scope: req.body.token.endsWith('w') ? 'mcp:read mcp:write' : 'mcp:read' });
    if (req.params.operation === 'delegate') {
      if (req.body.token.endsWith('w')) {
        assert.equal(req.body.tool, 'create_campaign'); assert.equal(req.body.method, 'POST'); assert.equal(req.body.path, '/api/campaigns');
      } else {
        const paths = { system_status: '/api/system/status', list_inbox_threads: '/api/inbox/threads', list_follow_up_tasks: '/api/tasks' };
        assert.ok(Object.hasOwn(paths, req.body.tool));
        assert.equal(req.body.method, 'GET');
        assert.equal(req.body.path, paths[req.body.tool]);
      }
      await new Promise(resolve => setTimeout(resolve, req.body.token.endsWith('a') ? 25 : 2));
      return res.json({ assertion: `fixture-delegation-${req.body.token.slice(-1)}` });
    }
    res.sendStatus(404);
  });
  backend.get('/api/system/status', (req, res) => {
    calls.push(req.headers.authorization);
    res.json({ fixtureActor: req.headers.authorization.slice(-1) });
  });
  backend.get('/api/inbox/threads', (req, res) => {
    calls.push(req.headers.authorization);
    assert.equal(req.query.assignedToMe, 'true');
    res.json({ threads: [{ leadId: 2, leadName: 'Inbox fixture', unread: true }], page: 1, pages: 1, total: 1, unread: 1 });
  });
  backend.get('/api/tasks', (req, res) => {
    calls.push(req.headers.authorization);
    assert.equal(req.query.scope, 'mine');
    res.json({ tasks: [{ id: 3, leadId: 2, title: 'Fixture callback' }], page: 1, pages: 1, total: 1 });
  });
  backend.post('/api/campaigns', (req, res) => { calls.push(req.headers.authorization); res.json({ id: 7, name: req.body.name, status: 'draft' }); });
  const apiServer = backend.listen(0, '127.0.0.1');
  await once(apiServer, 'listening');
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [serverPath], {
    cwd: directory,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: String(port),
      MCP_AUTH_MODE: 'personal', MCP_PUBLIC_URL: 'https://mcp.example.test/mcp',
      MCP_DASHBOARD_ORIGIN: 'https://app.example.test', MCP_CONTROL_SECRET: controlSecret,
      BACKEND_URL: `http://127.0.0.1:${apiServer.address().port}`,
      OAUTH_STORE_PATH: path.join(directory, 'legacy.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', value => { logs += value; });
  child.stderr.on('data', value => { logs += value; });
  const clients = ['a', 'b', 'w'].map(id => new Client({ name: `fixture-${id}`, version: '1.0.0' }));
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { ready = (await fetch(`http://127.0.0.1:${port}/healthz`)).ok; } catch { /* Listener starts asynchronously. */ }
      if (ready) break;
      if (child.exitCode !== null) throw new Error(logs);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    await Promise.all(clients.map((client, index) => client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer mcp_personal_${['a','b','w'][index]}` } },
    }))));
    const catalogue = await clients[0].listTools();
    assert.deepEqual(catalogue.tools.map(tool => tool.name).sort(), Object.keys(MCP_READ_OPERATIONS).sort());
    assert.ok(catalogue.tools.every(tool => !['send_whatsapp', 'send_email', 'start_campaign', 'create_lead', 'system_pause_resume'].includes(tool.name)));
    const results = await Promise.all(clients.slice(0,2).map(client => client.callTool({ name: 'system_status', arguments: {} })));
    assert.deepEqual(results.map(result => JSON.parse(result.content[0].text).fixtureActor), ['a', 'b']);
    assert.deepEqual(new Set(calls), new Set(['Bearer fixture-delegation-a', 'Bearer fixture-delegation-b']));
    const inbox = catalogue.tools.find(tool => tool.name === 'list_inbox_threads');
    const tasks = catalogue.tools.find(tool => tool.name === 'list_follow_up_tasks');
    assert.equal(inbox.annotations.readOnlyHint, true);
    assert.equal(tasks.annotations.readOnlyHint, true);
    const triage = await Promise.all([
      clients[0].callTool({ name: inbox.name, arguments: { assignment: 'mine' } }),
      clients[1].callTool({ name: tasks.name, arguments: { scope: 'mine' } }),
    ]);
    assert.equal(JSON.parse(triage[0].content[0].text).threads[0].unread, true);
    assert.equal(JSON.parse(triage[1].content[0].text).tasks[0].title, 'Fixture callback');
    const writeTools = await clients[2].listTools();
    assert.deepEqual(writeTools.tools.map(tool => tool.name).sort(), [...Object.keys(MCP_READ_OPERATIONS), ...Object.keys(MCP_WRITE_OPERATIONS)].sort());
    assert.ok(writeTools.tools.some(tool => tool.name === 'schedule_campaign'));
    assert.ok(!catalogue.tools.some(tool => tool.name === 'schedule_campaign'));
    const written = await clients[2].callTool({ name: 'create_campaign', arguments: { name: 'Synthetic write test', messageTemplate: 'Synthetic message' } });
    assert.equal(JSON.parse(written.content[0].text).created, true);
    assert.equal(calls.at(-1), 'Bearer fixture-delegation-w');
    const denied = await clients[0].callTool({ name: 'send_whatsapp', arguments: { lead_id: 1, message: 'Never sent' } });
    assert.equal(denied.isError, true);
    assert.equal(calls.length, 5, 'direct calls to hidden writes cannot reach the backend');
  } finally {
    await Promise.all(clients.map(client => client.close().catch(() => {})));
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await new Promise(resolve => apiServer.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
