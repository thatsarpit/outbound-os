import assert from 'node:assert/strict';
import { once } from 'node:events';
import { generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { clerkMiddleware, getAuth } from '@clerk/express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { workspaceHome } from '../web/src/lib/workspace-path.ts';
import { clerkWorkspaceIdentity } from '../src/auth/clerkIdentity.js';
import { createWorkspaceRouter, workspaceConfig, workspaceRuntime } from '../src/routes/workspaces.js';

const primary = { AUTH_PROVIDER: 'clerk', CLERK_ORGANIZATION_ID: 'org_pharma', OUTBOUNDOS_PRIMARY_WORKSPACE_NAME: 'Pharma Sales' };
const member = { id: 'voyd', name: 'Voyd Media', organizationId: 'org_voyd', origin: 'http://workspace-voyd:3001' };
const registry = entries => workspaceConfig({ ...primary, OUTBOUNDOS_WORKSPACES: JSON.stringify(entries) });

test('workspace configuration requires distinct private tenant mappings', () => {
  assert.deepEqual(workspaceConfig(primary), []);
  assert.equal(registry([member]).length, 2);
  for (const entry of [
    { ...member, id: 'primary' },
    { ...member, organizationId: primary.CLERK_ORGANIZATION_ID },
    { ...member, origin: 'http://workspace-voyd:3001/leads' },
    { ...member, origin: 'https://example.test' },
    { ...member, origin: 'http://169.254.169.254:80' },
  ]) {
    assert.throws(() => registry([entry]));
  }
  assert.throws(() => registry([member, { ...member, id: 'other', organizationId: 'org_other' }]));
  assert.throws(() => workspaceConfig({ ...primary, AUTH_PROVIDER: 'local', OUTBOUNDOS_WORKSPACES: '[]' }));
  assert.throws(() => workspaceRuntime({ ...primary, OUTBOUNDOS_WORKSPACE_ID: '../invalid' }));
});

test('mobile workspace switches keep the top-level tab and discard record-specific paths', () => {
  assert.equal(workspaceHome('voyd', true), '/w/voyd/m/inbox');
  assert.equal(workspaceHome('voyd', true, '/m/tasks'), '/w/voyd/m/tasks');
  assert.equal(workspaceHome('storefronts', true, '/m/account'), '/w/storefronts/m/account');
  assert.equal(workspaceHome('primary', true, '/m/leads'), '/m/leads');
  for (const path of ['/m/inbox?leadId=42', '/m/leads/42', '/m/delivery', '/m/account#security']) {
    assert.equal(workspaceHome('voyd', true, path), '/w/voyd/m/inbox');
  }
  assert.equal(workspaceHome('voyd', false, '/m/tasks'), '/w/voyd/');
});

async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}

test('signed Clerk sessions and source keys isolate reads, writes and lead intake', async t => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const issuer = 'https://clerk.example.test';
  const clerk = () => clerkMiddleware({
    secretKey: 'sk_test_synthetic-workspace-fixture',
    publishableKey: 'pk_test_' + Buffer.from('clerk.example.test$').toString('base64'),
    jwtKey: publicKey.export({ type: 'spki', format: 'pem' }),
  });
  const sign = (orgId, role = 'org:admin') => jwt.sign({
    sid: 'sess_fixture', org_id: orgId, org_role: role, iss: issuer, sub: 'user_fixture',
  }, privateKey, { algorithm: 'RS256', keyid: 'key_fixture', expiresIn: '5m' });
  const authenticate = r => getAuth(r);
  const voydToken = sign('org_voyd');
  const pharmaToken = sign('org_pharma');
  const strangerToken = sign('org_other');

  function crm(env, label, sourceKey) {
    const db = new DatabaseSync(':memory:');
    t.after(() => db.close());
    db.exec('CREATE TABLE lead (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    const insert = db.prepare('INSERT INTO lead (name) VALUES (?)');
    insert.run(label);
    const app = express();
    app.use(rateLimit({ windowMs: 60_000, limit: 100 }));
    app.use('/api', workspaceRuntime(env));
    app.use(clerk());
    function guard(req, res, next) {
      if (!clerkWorkspaceIdentity(authenticate(req), env)) return res.status(403).end();
      next();
    }
    app.use(express.json());
    app.get('/api/leads', guard, (_req, res) => res.json(db.prepare('SELECT name FROM lead ORDER BY id').all()));
    app.post('/api/leads', guard, (req, res) => {
      insert.run(req.body.name);
      res.sendStatus(201);
    });
    app.post('/api/webhooks/inbound/website', (req, res) => {
      if (req.get('x-api-key') !== sourceKey) return res.sendStatus(401);
      insert.run(req.body.name);
      res.sendStatus(201);
    });
    return app;
  }

  const voyd = crm({ ...primary, CLERK_ORGANIZATION_ID: 'org_voyd', OUTBOUNDOS_WORKSPACE_ID: 'voyd' }, 'Studio Lead', 'agency-fixture-key');
  const voydOrigin = await listen(t, voyd);
  const crmPrimary = crm(primary, 'Pharma Lead', 'pharma-fixture-key');
  const gateway = express();
  gateway.use('/api', workspaceRuntime(primary));
  gateway.use(clerk());
  gateway.use('/api/workspaces', createWorkspaceRouter({
    workspaces: registry([{ ...member, origin: voydOrigin }]),
    getSession: authenticate,
    getMemberships: async ({ userId, offset }) => {
      assert.equal(userId, 'user_fixture');
      return {
        totalCount: 3,
        data: [[
          { role: 'org:admin', organization: { id: 'org_pharma' } },
          { role: 'org:admin', organization: { id: 'org_voyd' } },
          { role: 'org:admin', organization: { id: 'org_other' } },
        ][offset]],
      };
    },
  }));
  gateway.use(crmPrimary);
  const origin = await listen(t, gateway);
  const tokenHeaders = token => token ? { Authorization: 'Bearer ' + token } : {};
  const get = (path, token) => fetch(origin + path, { headers: tokenHeaders(token) });
  const post = (path, name, token, sourceKey) => fetch(origin + path, {
    method: 'POST',
    headers: { ...tokenHeaders(token), 'Content-Type': 'application/json', ...(sourceKey ? { 'x-api-key': sourceKey } : {}) },
    body: JSON.stringify({ name }),
  });
  const scoped = '/api/workspaces/voyd';

  assert.equal((await get('/api/workspaces')).status, 401);
  const directory = await get('/api/workspaces', sign(undefined));
  assert.equal(directory.status, 200);
  assert.equal(directory.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual((await directory.json()).workspaces.map(item => Object.keys(item)), [
    ['id', 'name', 'organizationId'], ['id', 'name', 'organizationId'],
  ]);
  assert.equal((await get(scoped + '/leads')).status, 401);
  assert.equal((await get(scoped + '/leads', strangerToken)).status, 403);
  assert.equal((await get(scoped + '/leads', pharmaToken)).status, 403);
  assert.equal((await get(scoped + '/leads', sign('org_voyd', 'org:unknown'))).status, 403);
  assert.equal((await get('/api/leads', voydToken)).status, 403);
  assert.equal((await get(scoped + '/workspaces', voydToken)).status, 404);
  assert.equal((await get(scoped + '/%2Fleads', voydToken)).status, 404);
  assert.equal((await get('/api/workspaces/does-not-exist/leads', voydToken)).status, 404);
  assert.equal((await fetch(voydOrigin + '/api/leads', { headers: tokenHeaders(voydToken) })).status, 404);
  assert.equal((await post(scoped + '/leads', 'Rejected', pharmaToken)).status, 403);
  assert.equal((await post(scoped + '/leads', 'New Studio Lead', voydToken)).status, 201);
  const webhook = scoped + '/webhooks/inbound/website';
  assert.equal((await post(webhook, 'Wrong source', null, 'pharma-fixture-key')).status, 401);
  assert.equal((await post(webhook, 'No source', voydToken)).status, 401);
  assert.equal((await post(webhook, 'Agency Enquiry', null, 'agency-fixture-key')).status, 201);
  assert.deepEqual(await (await get('/api/leads', pharmaToken)).json(), [{ name: 'Pharma Lead' }]);
  assert.deepEqual(await (await get(scoped + '/leads', voydToken)).json(), [
    { name: 'Studio Lead' }, { name: 'New Studio Lead' }, { name: 'Agency Enquiry' },
  ]);
});
