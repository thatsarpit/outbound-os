import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('the real Clerk API route authenticates EventSource query sessions without granting query auth elsewhere', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'outbound-clerk-events-'));
  const originalDirectory = process.cwd();
  process.chdir(directory);
  const config = {
    NODE_ENV: 'test', AUTH_PROVIDER: 'clerk', DATABASE_URL: `file:${path.join(directory, 'fixture.db')}`,
    CLERK_SECRET_KEY: 'sk_live_obviously_fake_event_fixture',
    CLERK_PUBLISHABLE_KEY: `pk_live_${Buffer.from('clerk.example.test$').toString('base64')}`,
    CLERK_JWT_KEY: '', CLERK_API_URL: 'https://api.clerk.com',
    CLERK_ORGANIZATION_ID: 'org_event_fixture', MCP_SERVICE_TOKEN: 'obviously-fake-event-service-token',
    MCP_AUTH_MODE: 'legacy', CLERK_TELEMETRY_DISABLED: 'true',
  };
  const previous = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
  Object.assign(process.env, config);
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'event-fixture-key', alg: 'RS256', use: 'sig' };
  let verificationKeyRequests = 0;
  // Only signing-key discovery is mocked. The Clerk SDK verifies real RSA
  // signatures and expiry, and the app applies its actual workspace/role gate.
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://api.clerk.com/v1/jwks', 'no external provider request can escape this fixture');
    assert.equal(options.headers.Authorization, `Bearer ${config.CLERK_SECRET_KEY}`);
    verificationKeyRequests++;
    return Response.json({ keys: [jwk] });
  });
  const token = (claims = {}, signingKey = privateKey) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      v: 2, iss: 'https://clerk.example.test', sub: 'user_event_owner', sid: 'sess_event_fixture',
      iat: now - 10, nbf: now - 10, exp: now + 120, sts: 'active',
      o: { id: config.CLERK_ORGANIZATION_ID, rol: 'admin', slg: 'event-fixture' }, ...claims,
    })).toString('base64url');
    const content = `${header}.${payload}`;
    return `${content}.${sign('RSA-SHA256', Buffer.from(content), signingKey).toString('base64url')}`;
  };
  const { default: app } = await import('../src/api.js');
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const request = (route, { method = 'GET', bearer } = {}) => new Promise((resolve, reject) => {
    const call = http.request({
      hostname: '127.0.0.1', port: server.address().port, path: route, method,
      headers: { Accept: 'text/event-stream', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    }, response => {
      let body = '';
      response.on('data', chunk => {
        body += chunk;
        if (response.headers['content-type']?.startsWith('text/event-stream') && body.includes('\n\n')) {
          resolve({ status: response.statusCode, headers: response.headers, body });
          response.destroy();
        }
      });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    call.setTimeout(5000, () => call.destroy(new Error('Fixture API request timed out.')));
    call.on('error', reject);
    call.end();
  });
  const stream = value => request(`/api/events?token=${encodeURIComponent(value)}`);
  try {
    const owner = token();
    const allowed = await stream(owner);
    assert.equal(allowed.status, 200, 'query sessions reach SSE without the header-only API guard rejecting them first');
    assert.match(allowed.headers['content-type'], /^text\/event-stream/);
    assert.equal(JSON.parse(allowed.body.slice(6)).type, 'connected');
    for (const role of ['member', 'viewer']) {
      assert.equal((await stream(token({ o: { id: config.CLERK_ORGANIZATION_ID, rol: role } }))).status, 200);
    }
    assert.equal((await stream(token({ v: 1, o: undefined, org_id: config.CLERK_ORGANIZATION_ID, org_role: 'org:member' }))).status, 200);
    const rogue = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    for (const rejected of [
      'not-a-session', config.MCP_SERVICE_TOKEN, token({}, rogue), token({ exp: Math.floor(Date.now() / 1000) - 60 }),
      token({ o: { id: 'org_other', rol: 'admin' } }), token({ o: { id: config.CLERK_ORGANIZATION_ID, rol: 'owner' } }),
      token({ o: null }), token({ sts: 'pending' }),
    ]) assert.equal((await stream(rejected)).status, 401);
    assert.equal((await request('/api/events')).status, 401);
    for (const query of [`token=${encodeURIComponent(owner)}&token=${encodeURIComponent(owner)}`, `token[]=${encodeURIComponent(owner)}`]) {
      assert.equal((await request(`/api/events?${query}`)).status, 401, 'ambiguous query parameters are not scalar credentials');
    }
    assert.equal((await request(`/api/events?token=${encodeURIComponent(owner)}`, { method: 'HEAD' })).status, 405);
    assert.equal((await request(`/api/events?token=${encodeURIComponent(owner)}`, { method: 'POST' })).status, 401);
    for (const route of ['/api/auth/me', '/api/leads', '/api/events/other']) {
      assert.equal((await request(`${route}?token=${encodeURIComponent(owner)}`)).status, 401);
    }
    assert.equal((await request('/api/auth/me', { bearer: owner })).status, 200, 'ordinary authenticated API requests retain their header contract');
    const pinned = process.env.CLERK_ORGANIZATION_ID;
    delete process.env.CLERK_ORGANIZATION_ID;
    assert.equal((await stream(owner)).status, 401, 'production identities require the workspace pin');
    process.env.CLERK_ORGANIZATION_ID = pinned;
    assert.ok(verificationKeyRequests > 0, 'the actual SDK signature verifier loaded the fixture public key');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
    process.chdir(originalDirectory);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
