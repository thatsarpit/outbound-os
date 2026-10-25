import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createWorkspaceMemberRouter } from '../src/routes/workspaceMembers.js';

test('assignment directory has an agent boundary and reports real provider unavailability', async () => {
  const app = express();
  let calls = 0;
  let unavailable = false;
  app.use((req, _res, next) => { req.user = req.headers['x-fixture-role'] ? { role: req.headers['x-fixture-role'], id: 1 } : null; next(); });
  app.use('/api', createWorkspaceMemberRouter({
    roleGuard: role => {
      assert.equal(role, 'agent');
      return (req, res, next) => !req.user ? res.sendStatus(401) : req.user.role === 'viewer' ? res.sendStatus(403) : next();
    },
    service: { list: async () => {
      calls++;
      if (unavailable) throw Object.assign(new Error('Membership could not be verified. Try again.'), { statusCode: 503, code: 'member_directory_unavailable' });
      return [{ key: 'local:local:1', name: 'Fixture member' }];
    } },
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/workspace/members`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { 'x-fixture-role': 'viewer' } })).status, 403);
    assert.equal(calls, 0, 'unauthorized requests never query the provider or directory');
    const allowed = await fetch(url, { headers: { 'x-fixture-role': 'agent' } });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { members: [{ key: 'local:local:1', name: 'Fixture member' }] });
    unavailable = true;
    const failure = await fetch(url, { headers: { 'x-fixture-role': 'admin' } });
    assert.equal(failure.status, 503);
    assert.equal((await failure.json()).code, 'member_directory_unavailable');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
