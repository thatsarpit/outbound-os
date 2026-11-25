/**
 * Integration Tests — HTTP endpoint testing with a separate test SQLite DB
 * Run: node --test test/integration.test.js
 *
 * Uses a throwaway SQLite DB so production data is never touched.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile, execFileSync, execSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// A fresh filename avoids a macOS/SQLite race where recreating a just-unlinked
// database can make Prisma's schema engine fail before the test server starts.
const TEST_DB_PATH = process.env.INTEGRATION_TEST_DB_PATH ||
  path.join(__dirname, '..', 'data', `test-integration-${process.pid}.db`);
const TEST_DB_URL = `file:${TEST_DB_PATH}`;

// Set env vars BEFORE any app code imports
process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';
process.env.IMESSAGE_WEBHOOK_SECRET = 'test-imessage-webhook-secret';
// The default, built-in sign-in. Clerk is covered by its own provider module.
process.env.AUTH_PROVIDER = 'local';
process.env.JWT_SECRET = 'integration-jwt-secret-integration-jwt-secret';
process.env.MCP_SERVICE_TOKEN = 'integration-service-token';
process.env.META_APP_SECRET = 'test-meta-app-secret';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'test-meta-verify-token';

// ── Helpers ──────────────────────────────────────────────────────────────────

let server;
let baseUrl;
const authHeader = () => ({
  Authorization: 'Bearer integration-service-token',
});

function request(method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json', ...headers },
    };

    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let json;
        try { json = JSON.parse(raw); } catch { json = raw; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
});
}

// ── Setup & Teardown ─────────────────────────────────────────────────────────

before(async () => {
  if (process.env.INTEGRATION_DB_READY !== '1') {
    // Remove old test DB if it exists
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

    // Apply committed migrations. The package script performs this outside the
    // Node test runner on macOS, where Prisma's schema engine is more reliable.
    execSync('npx prisma migrate deploy', {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      stdio: 'pipe',
    });
  }

  // Import app after env is set
  const { default: app } = await import('../src/api.js');

  // Start on random port
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  // Clean up test DB
  try { if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH); } catch {}
  try { if (fs.existsSync(TEST_DB_PATH + '-journal')) fs.unlinkSync(TEST_DB_PATH + '-journal'); } catch {}
  // Force exit — imported services (cron, timers) keep the process alive
  setTimeout(() => process.exit(0), 500);
  });

// ── Leads Tests ──────────────────────────────────────────────────────────────

test('compiled assets, dashboard navigation and service endpoints keep separate budgets', async () => {
  const directory = path.join(__dirname, '..', 'web', 'dist');
  const index = path.join(directory, 'index.html');
  const asset = path.join(directory, '__rate-limit-fixture.svg');
  const bundle = path.join(directory, 'assets', '__rate-limit-fixture-a12b34c5.js');
  let temporaryIndex = false;
  fs.mkdirSync(path.dirname(bundle), { recursive: true });
  try {
    fs.writeFileSync(index, '<!doctype html><title>Isolated dashboard fixture</title>', { flag: 'wx' });
    temporaryIndex = true;
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  fs.writeFileSync(asset, '<svg xmlns="http://www.w3.org/2000/svg"/>', { flag: 'wx' });
  fs.writeFileSync(bundle, 'export {};', { flag: 'wx' });
  const headers = { 'X-Forwarded-For': '192.0.2.199' };
  try {
    for (let count = 0; count < 300; count++) {
      const result = await request('GET', count % 2 ? '/m/inbox' : '/__rate-limit-fixture.svg', { headers });
      assert.equal(result.status, 200, `Dashboard request ${count + 1}`);
      assert.equal(result.headers['ratelimit-limit'], '300');
      assert.equal(Number(result.headers['ratelimit-remaining']), 299 - count, 'each static hit or fallback is charged exactly once');
    }
    for (const route of ['/m/inbox', '/__rate-limit-fixture.svg']) {
      const blocked = await request('GET', route, { headers });
      assert.equal(blocked.status, 429);
      assert.match(blocked.body.error, /Too many dashboard requests/);
      assert.ok(Number(blocked.headers['retry-after']) > 0);
      assert.equal(blocked.headers['x-ratelimit-limit'], undefined);
    }
    const compiled = await request('GET', '/assets/__rate-limit-fixture-a12b34c5.js', { headers });
    assert.equal(compiled.status, 200, 'compiled files still load after the navigation budget is used');
    assert.equal(compiled.headers['ratelimit-limit'], '1200');
    assert.equal(compiled.headers['cache-control'], 'public, max-age=31536000, immutable');
    const missingAsset = await request('GET', '/assets/__rate-limit-missing-fixture.js', { headers });
    assert.equal(missingAsset.status, 404, 'missing bundles never serve dashboard HTML');
    assert.equal(missingAsset.headers['ratelimit-remaining'], '1198');
    const api = await request('GET', '/api/auth/config', { headers });
    assert.equal(api.status, 200);
    assert.equal(api.headers['ratelimit-limit'], '100', 'existing API budget is unchanged');
    assert.equal(api.headers['ratelimit-remaining'], '99', 'dashboard files never consume API capacity');
    for (const route of ['/health', '/healthz', '/HEALTHZ/']) {
      const probe = await request('GET', route, { headers });
      assert.equal(probe.status, 200, route);
      assert.equal(probe.headers['ratelimit-limit'], undefined, route);
    }
    const webhook = await request('GET', '/webhook/meta?hub.mode=subscribe&hub.verify_token=test-meta-verify-token&hub.challenge=fixture-challenge', { headers });
    assert.equal(webhook.status, 200);
    assert.equal(webhook.body, 'fixture-challenge');
    assert.equal(webhook.headers['ratelimit-limit'], undefined);
    for (const route of ['/webhook', '/webhook/not-a-provider']) {
      const missing = await request('GET', route, { headers });
      assert.equal(missing.status, 404, 'reserved callbacks never serve dashboard HTML');
      assert.equal(missing.headers['ratelimit-limit'], undefined);
    }
  } finally {
    fs.unlinkSync(bundle);
    fs.unlinkSync(asset);
    if (temporaryIndex) fs.unlinkSync(index);
  }
});

test('the signed-in version endpoint returns the running server build', async () => {
  const endpoint = '/api/system/version';
  const ip = { 'X-Forwarded-For': '198.51.100.244' };
  assert.equal((await request('GET', endpoint, { headers: ip })).status, 401);
  const version = await request('GET', endpoint, { headers: { ...authHeader(), ...ip } });
  assert.equal(version.status, 200);
  assert.equal(version.headers['cache-control'], 'private, no-store');
  const { readBuildInfo } = await import('../shared/buildInfo.js');
  assert.deepEqual(version.body, readBuildInfo());
});

test('delivery review is manager-only and separates queue state from delivery', async () => {
  const { default: db } = await import('../src/utils/prismaClient.js');
  const { hashPassword } = await import('../src/auth/rbac.js');
  const { default: followup } = await import('../src/services/followup.js');
  const { default: emailWorker } = await import('../src/services/emailService.js');
  const { default: imessage } = await import('../src/services/imessage.js');
  const { default: campaignScheduler } = await import('../src/services/campaignScheduler.js');
  const { QUEUE_SCAN_INTERVALS } = await import('../src/services/queueHealth.js');
  const scanKey = worker => 'runtime.queue.' + worker + '.last_scan_at';
  const scanKeys = Object.keys(QUEUE_SCAN_INTERVALS).map(scanKey);
  const now = Date.now();
  const at = minutes => new Date(now + minutes * 60_000);
  const endpoint = '/api/messages/review';
  const password = 'delivery review fixture password';
  const lead = await db.lead.create({ data: { name: 'Delivery review fixture', mobile: '12025550167' } });
  const users = [];
  try {
    const headersByRole = {};
    for (const role of ['manager', 'viewer']) {
      const email = 'delivery-review-' + role + '@example.test';
      const user = await db.user.create({ data: { email, name: role, role, passwordHash: hashPassword(password) } });
      users.push(user.id);
      const ip = role === 'manager' ? '192.0.2.245' : '192.0.2.246';
      const auth = await request('POST', '/api/auth/login', {
        headers: { 'X-Forwarded-For': ip }, body: { email, password },
      });
      assert.equal(auth.status, 200);
      headersByRole[role] = { Authorization: 'Bearer ' + auth.body.token, 'X-Forwarded-For': ip };
    }

    await emailWorker.processEmailQueue({ messageIds: [] });
    assert.equal(await db.systemConfig.count({ where: { key: scanKey('email') } }), 0);
    await followup.processQueue();
    await emailWorker.processEmailQueue();
    await imessage.processQueue();
    await campaignScheduler.processDue();
    assert.equal(await db.systemConfig.count({ where: { key: { in: scanKeys } } }), 4, 'empty queues still record a successful scan');
    await db.systemConfig.update({ where: { key: scanKey('email') }, data: { value: at(-30).toISOString() } });
    await db.systemConfig.delete({ where: { key: scanKey('imessage') } });

    const common = {
      leadId: lead.id, direction: 'outbound', content: 'private fixture body',
      updatedAt: new Date('2026-11-21T00:00:00Z'),
    };
    await db.message.createMany({ data: [
      ...Array.from({ length: 26 }, () => ({
        ...common, channel: 'whatsapp', status: 'failed', providerStatusReason: 'payment_issue',
        providerErrorCode: '131042', providerErrorMessage: 'private synthetic provider response',
      })),
      { ...common, channel: 'email', status: 'unconfirmed', providerStatusReason: 'private synthetic provider response' },
      { ...common, channel: 'email', status: 'bounced' },
      { ...common, channel: 'email', status: 'queued', scheduledAt: at(60) },
      { ...common, channel: 'email', status: 'queued', scheduledAt: at(-10) },
      { ...common, channel: 'whatsapp', status: 'queued', scheduledAt: at(-20) },
      { ...common, channel: 'email', status: 'queued', scheduledAt: at(-1) },
      { ...common, channel: 'email', status: 'queued' },
      { ...common, channel: 'imessage', status: 'sending' },
      { ...common, channel: 'whatsapp', status: 'sent' },
      { ...common, channel: 'email', status: 'delivered' },
      { ...common, channel: 'email', direction: 'inbound', status: 'failed' },
    ] });

    assert.equal((await request('GET', endpoint, { headers: { 'X-Forwarded-For': '198.51.100.245' } })).status, 401);
    assert.equal((await request('GET', endpoint, { headers: headersByRole.viewer })).status, 403);
    const headers = headersByRole.manager;
    const attention = await request('GET', endpoint, { headers });
    assert.equal(attention.status, 200, JSON.stringify(attention.body));
    assert.deepEqual(attention.body.counts, { attention: 28, failed: 27, unconfirmed: 1, queued: 5, overdue: 2, sending: 1 });
    assert.equal(attention.body.total, 28);
    const workers = Object.fromEntries(attention.body.workers.map(row => [row.worker, row]));
    assert.equal(workers.whatsapp.state, 'recent');
    assert.equal(workers.whatsapp.intervalMinutes, 2);
    assert.equal(workers.campaigns.state, 'recent');
    assert.equal(workers.email.state, 'stale');
    assert.equal(workers.email.lastScanAt, at(-30).toISOString());
    assert.deepEqual(workers.imessage, { worker: 'imessage', intervalMinutes: 1, lastScanAt: null, state: 'not_recorded' });
    assert.deepEqual(attention.body.receiptActivity, [
      { source: 'whatsapp', lastReceivedAt: null, unmatched: 0 },
      { source: 'brevo', lastReceivedAt: null, unmatched: 0 },
    ]);
    assert.equal(attention.body.pages, 2);
    assert.ok(attention.body.items.every(item => ['failed', 'bounced', 'unconfirmed'].includes(item.status)));
    assert.doesNotMatch(JSON.stringify(attention.body), /private fixture body|private synthetic provider response/);

    const waReceipt = {
      accountId: 1234, waMessageId: 'wamid.delivery-review-fixture', status: 'delivered',
    };
    await db.whatsAppReceipt.createMany({ data: [
      { ...waReceipt, eventKey: 'review-wa-unmatched', receivedAt: at(-16) },
      { ...waReceipt, eventKey: 'review-wa-applied', receivedAt: at(-15), appliedAt: at(-15) },
    ] });
    const emailReceipt = {
      event: 'delivered', recipient: 'review-receipt@example.test',
    };
    await db.emailDeliveryEvent.createMany({ data: [
      { ...emailReceipt, eventKey: 'review-brevo-older', occurredAt: at(-10), receivedAt: at(-9), outcome: 'recorded' },
      { ...emailReceipt, eventKey: 'review-brevo-unmatched', occurredAt: at(-40), receivedAt: at(-8), outcome: 'unmatched', lastAttemptAt: at(0) },
      { ...emailReceipt, eventKey: 'review-other-provider', provider: 'fixture-other', receivedAt: at(-1), outcome: 'unmatched' },
    ] });

    const query = endpoint + '?status=failed&channel=whatsapp';
    const [{ body: first }, { body: last }] = await Promise.all([
      request('GET', query, { headers }),
      request('GET', query + '&page=900', { headers }),
    ]);
    assert.equal(first.total, 26);
    assert.equal(first.items.length, 25);
    assert.equal(last.page, 2);
    assert.equal(last.items.length, 1);
    assert.ok(first.items[24].id > last.items[0].id, 'rows with matching timestamps paginate in ID order');
    assert.equal(first.items[0].providerCode, '131042');
    assert.match(first.items[0].detail, /billing/);
    assert.deepEqual(first.receiptActivity, [
      { source: 'whatsapp', lastReceivedAt: at(-15).toISOString(), unmatched: 1 },
      { source: 'brevo', lastReceivedAt: at(-8).toISOString(), unmatched: 1 },
    ], 'instance receipt activity stays visible when filtering messages by channel');

    const queued = await request('GET', endpoint + '?status=queued&channel=email', { headers });
    const dueAt = queued.body.items.find(row => row.scheduledAt === at(60).toISOString());
    assert.equal(dueAt.overdue, false);
    assert.equal(queued.body.counts.overdue, 1, 'counts follow the selected channel');
    assert.equal(queued.body.overdueGraceMinutes, 5);
    const overdue = await request('GET', endpoint + '?status=overdue', { headers });
    assert.deepEqual(overdue.body.items.map(row => [row.scheduledAt, row.overdue]), [
      [at(-20).toISOString(), true],
      [at(-10).toISOString(), true],
    ]);
    const overdueEmail = await request('GET', endpoint + '?status=overdue&channel=email', { headers });
    assert.equal(overdueEmail.body.total, 1);
    const uncertain = await request('GET', endpoint + '?status=unconfirmed&channel=email', { headers });
    assert.match(uncertain.body.items[0].detail, /check the sending provider/i);

    for (const invalid of ['status=sent', 'channel=sms', 'page=-1', 'page=1&page=2']) {
      assert.equal((await request('GET', endpoint + '?' + invalid, { headers })).status, 400);
    }
    assert.equal(await db.message.count({ where: { leadId: lead.id } }), 37);
    const requeue = id => request('POST', '/api/messages/' + id + '/requeue', { headers });
    const rejectedCases = [
      { direction: 'inbound' },
      { sentAt: new Date(), providerErrorCode: '131042' },
      { providerStatusReason: 'confirmation_unknown' },
      { manualSendKey: 'scheduled-email:review-test-fixture' },
      { campaignId: 91203 },
    ];
    for (const patch of rejectedCases) {
      const message = await db.message.create({ data: { ...common, status: 'permanently_failed', channel: 'email', ...patch } });
      assert.equal((await requeue(message.id)).status, 409);
      assert.equal((await db.message.findUnique({ where: { id: message.id } })).status, 'permanently_failed');
    }

    const safe = await db.message.create({ data: {
      ...common, status: 'permanently_failed', channel: 'email', providerStatusReason: 'auth_failed',
    } });
    const retries = await Promise.all([requeue(safe.id), requeue(safe.id)]);
    assert.deepEqual(retries.map(result => result.status).sort(), [200, 409]);
    assert.equal((await db.message.findUnique({ where: { id: safe.id } })).status, 'queued');
  } finally {
    await db.whatsAppReceipt.deleteMany({ where: { waMessageId: 'wamid.delivery-review-fixture' } });
    await db.emailDeliveryEvent.deleteMany({ where: { recipient: 'review-receipt@example.test' } });
    await db.lead.delete({ where: { id: lead.id } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.systemConfig.deleteMany({ where: { key: { in: scanKeys } } });
  }
});

describe('GET /api/leads', () => {
  test('returns empty leads list initially', async () => {
    const res = await request('GET', '/api/leads', { headers: authHeader() });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.leads), 'should return leads array');
    assert.equal(res.body.leads.length, 0);
  });

  test('rejects unauthenticated request', async () => {
    const res = await request('GET', '/api/leads');
    assert.equal(res.status, 401);
  });
});

describe('POST /webhook/imessage', () => {
  test('rejects requests without the configured webhook secret', async () => {
    const res = await request('POST', '/webhook/imessage', {
      body: { type: 'hello-world', data: {} },
    });
    assert.equal(res.status, 401);
  });

  test('accepts authenticated BlueBubbles webhook events', async () => {
    const res = await request(
      'POST',
      '/webhook/imessage?token=test-imessage-webhook-secret&accountId=1',
      { body: { type: 'hello-world', data: {} } },
    );
    assert.equal(res.status, 200);
  });

  test('uses an outbound BlueBubbles webhook as a delivery receipt', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const lead = await prisma.lead.create({
      data: { name: 'Outbound Receipt', mobile: '14185550199' },
    });
    const queued = await prisma.message.create({
      data: {
        leadId: lead.id,
        direction: 'outbound',
        channel: 'imessage',
        content: 'Receipt test body',
        status: 'sending',
      },
    });

    const res = await request(
      'POST',
      '/webhook/imessage?token=test-imessage-webhook-secret',
      {
        body: {
          type: 'new-message',
          data: {
            guid: 'bluebubbles-outbound-guid',
            text: 'Receipt test body',
            isFromMe: true,
            handle: { address: '+14185550199' },
            dateCreated: Date.now(),
          },
        },
      },
    );
    assert.equal(res.status, 200);

    let stored;
    for (let i = 0; i < 20; i += 1) {
      stored = await prisma.message.findUnique({ where: { id: queued.id } });
      if (stored.status === 'sent') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(stored.status, 'sent');
    assert.equal(stored.imessageMessageId, 'bluebubbles-outbound-guid');
    assert.equal(stored.providerStatusReason, 'bluebubbles_outbound_webhook');

    const second = await prisma.message.create({
      data: {
        leadId: lead.id,
        direction: 'outbound',
        channel: 'imessage',
        content: 'Receipt test body',
        status: 'sending',
      },
    });
    await request(
      'POST',
      '/webhook/imessage?token=test-imessage-webhook-secret',
      {
        body: {
          type: 'new-message',
          data: {
            guid: 'bluebubbles-outbound-guid',
            text: 'Receipt test body',
            isFromMe: true,
            handle: { address: '+14185550199' },
            dateCreated: Date.now(),
          },
        },
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const duplicateTarget = await prisma.message.findUnique({ where: { id: second.id } });
    assert.equal(duplicateTarget.status, 'sending');
  });
});

test('iMessage bridge updates are admin-only and require a credential for a new origin', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { signToken } = await import('../src/auth/rbac.js');
  const users = await Promise.all(['manager', 'admin'].map(role => prisma.user.create({
    data: { name: 'Bridge Fixture', email: `bridge-${role}@example.test`, passwordHash: 'fixture-only', role },
  })));
  const account = await prisma.iMessageAccount.create({
    data: { name: 'Bridge Fixture', serverUrl: 'https://bridge.example.test', password: 'fixture-only' },
  });
  const headers = index => ({
    Authorization: `Bearer ${signToken(users[index])}`,
    'X-Forwarded-For': `198.51.100.${210 + index}`,
  });
  const path = `/api/imessage/accounts/${account.id}`;
  try {
    const body = { serverUrl: 'https://other-bridge.example.test' };
    assert.equal((await request('POST', '/api/imessage/accounts', { headers: headers(0), body })).status, 403);
    assert.equal((await request('PUT', path, { headers: headers(0), body })).status, 403);
    assert.equal((await request('PUT', path, { headers: headers(1), body })).status, 400);
    assert.equal((await prisma.iMessageAccount.findUnique({ where: { id: account.id } })).serverUrl, account.serverUrl);
    assert.equal((await request('PUT', path, { headers: headers(1), body: { serverUrl: account.serverUrl + '/' } })).status, 200);
    const updated = await request('PUT', path, { headers: headers(1), body: { ...body, password: 'new-fixture-password' } });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.serverUrl, body.serverUrl);
    assert.equal(Object.hasOwn(updated.body, 'password'), false);
  } finally {
    await prisma.iMessageAccount.delete({ where: { id: account.id } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
  }
});

describe('POST /api/leads', () => {
  test('creates a lead with required fields', async () => {
    const res = await request('POST', '/api/leads', {
      headers: authHeader(),
      body: { name: 'John Doe', mobile: '9876543210' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.id, 'should return created lead with id');
    assert.equal(res.body.name, 'John Doe');
  });

  test('rejects lead without name', async () => {
    const res = await request('POST', '/api/leads', {
      headers: authHeader(),
      body: { mobile: '1234567890' },
    });
    assert.equal(res.status, 400);
  });

  test('rejects lead without mobile', async () => {
    const res = await request('POST', '/api/leads', {
      headers: authHeader(),
      body: { name: 'Jane' },
    });
    assert.equal(res.status, 400);
  });

  test('rejects duplicate mobile number', async () => {
    // First create should succeed
    await request('POST', '/api/leads', {
      headers: authHeader(),
      body: { name: 'First', mobile: '5555555555' },
    });
    // Duplicate should fail
    const res = await request('POST', '/api/leads', {
      headers: authHeader(),
      body: { name: 'Second', mobile: '5555555555' },
    });
    // Should be 409 or 400 depending on implementation
    assert.ok([400, 409].includes(res.status), `expected 400 or 409, got ${res.status}`);
  });

  test('leads list includes created lead', async () => {
    const res = await request('GET', '/api/leads', { headers: authHeader() });
    assert.equal(res.status, 200);
    assert.ok(res.body.leads.length >= 1, 'should have at least 1 lead');
    const john = res.body.leads.find((l) => l.name === 'John Doe');
    assert.ok(john, 'John Doe should be in the list');
  });
});

describe("Overview reporting provenance", () => {
  test("reports equal-length periods and channel buckets from delivered messages", async () => {
    const { default: prisma } = await import("../src/utils/prismaClient.js");
    const url = "/api/stats/overview?days=7&tzOffset=-330";
    const chartUrl = "/api/stats/charts?days=7&tzOffset=-330";
    const before = await request("GET", url, { headers: authHeader() });
    const chartBefore = await request("GET", chartUrl, { headers: authHeader() });
    assert.equal(before.status, 200);
    assert.equal(chartBefore.status, 200);
    const lead = await prisma.lead.create({ data: { name: "Period sample", mobile: "919999991041", source: "manual" } });
    await prisma.message.createMany({ data: [
      { leadId: lead.id, direction: "outbound", channel: "email", content: "Current", status: "sent", sentAt: new Date() },
      { leadId: lead.id, direction: "outbound", channel: "telegram", content: "Previous", status: "sent", sentAt: new Date(Date.now() - 8 * 86400000) },
    ] });
    const after = await request("GET", url, { headers: authHeader() });
    const chartAfter = await request("GET", chartUrl, { headers: authHeader() });
    assert.equal(after.body.period.days, 7);
    assert.equal(after.body.period.current.newLeads, before.body.period.current.newLeads + 1);
    assert.equal(after.body.period.current.messagesSent, before.body.period.current.messagesSent + 1);
    assert.equal(after.body.period.previous.messagesSent, before.body.period.previous.messagesSent + 1);
    assert.equal(chartAfter.body.msgsByDay.length, 7);
    assert.equal(chartAfter.body.msgsByDay.reduce((sum, row) => sum + row.newLeads, 0), chartBefore.body.msgsByDay.reduce((sum, row) => sum + row.newLeads, 0) + 1);
    assert.equal(chartAfter.body.msgsByDay.reduce((sum, row) => sum + row.contactedLeads, 0), chartBefore.body.msgsByDay.reduce((sum, row) => sum + row.contactedLeads, 0) + 1);
    assert.equal(chartAfter.body.msgsByDay.reduce((sum, row) => sum + row.email, 0), chartBefore.body.msgsByDay.reduce((sum, row) => sum + row.email, 0) + 1);
    assert.equal(chartAfter.body.msgsByDay.reduce((sum, row) => sum + row.previousTotal, 0), chartBefore.body.msgsByDay.reduce((sum, row) => sum + row.previousTotal, 0) + 1);
    for (const row of chartAfter.body.msgsByDay) assert.equal(row.count, row.whatsapp + row.email + row.imessage + row.telegram + row.other);
  });
  test("does not report a historical import as a new lead today", async () => {
    const { default: prisma } = await import("../src/utils/prismaClient.js");
    const before = await request("GET", "/api/stats/overview?tzOffset=-330", {
      headers: authHeader(),
    });
    assert.equal(before.status, 200);
    const analyticsBefore = await request("GET", "/api/analytics?days=7&tzOffset=-330", {
      headers: authHeader(),
    });
    assert.equal(analyticsBefore.status, 200);

    await prisma.lead.create({
      data: {
        name: "Historical import",
        mobile: "919999991001",
        source: "local_import",
        consumedAt: new Date("2025-01-10T10:00:00.000Z"),
      },
    });
    await prisma.lead.create({
      data: {
        name: "Current source lead",
        mobile: "919999991002",
        source: "marketplace",
        consumedAt: new Date(),
      },
    });
    await prisma.lead.create({
      data: {
        name: "Current manual lead",
        mobile: "919999991003",
        source: "manual",
      },
    });

    const after = await request("GET", "/api/stats/overview?tzOffset=-330", {
      headers: authHeader(),
    });
    assert.equal(after.status, 200);
    assert.equal(after.body.totalLeads, before.body.totalLeads + 3);
    assert.equal(after.body.newToday, before.body.newToday + 2);

    const analyticsAfter = await request("GET", "/api/analytics?days=7&tzOffset=-330", {
      headers: authHeader(),
    });
    assert.equal(analyticsAfter.status, 200);
    assert.equal(analyticsAfter.body.dailyLeads.length, 7);
    assert.equal(
      analyticsAfter.body.dailyLeads.at(-1).count,
      analyticsBefore.body.dailyLeads.at(-1).count + 2,
    );
    const invalidDays = await request("GET", "/api/analytics?days=invalid", {
      headers: authHeader(),
    });
    assert.equal(invalidDays.status, 200);
    assert.equal(invalidDays.body.period, 30);
  });

  test("counts contacted and replied leads from message evidence, not status labels", async () => {
    const { default: prisma } = await import("../src/utils/prismaClient.js");
    const before = await request("GET", "/api/stats/overview?tzOffset=-330", {
      headers: authHeader(),
    });
    assert.equal(before.status, 200);

    const lead = await prisma.lead.create({
      data: {
        name: "Message evidence lead",
        mobile: "919999991004",
        source: "manual",
        status: "new",
      },
    });
    await prisma.message.createMany({
      data: [
        {
          leadId: lead.id,
          direction: "outbound",
          channel: "email",
          content: "First",
          status: "sent",
          sentAt: new Date(),
        },
        {
          leadId: lead.id,
          direction: "outbound",
          channel: "email",
          content: "Follow-up",
          status: "delivered",
          sentAt: new Date(),
        },
        {
          leadId: lead.id,
          direction: "inbound",
          channel: "email",
          content: "Reply",
          status: "delivered",
          sentAt: new Date(),
        },
      ],
    });

    const after = await request("GET", "/api/stats/overview?tzOffset=-330", {
      headers: authHeader(),
    });
    assert.equal(after.status, 200);
    assert.equal(after.body.contacted, before.body.contacted + 1);
    assert.equal(after.body.replied, before.body.replied + 1);
  });
});

describe('Reply attribution', () => {
  test('credits the latest sent campaign once and preserves provider time', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const { default: replyDetector } = await import('../src/services/replyDetector.js');
    const providerCreatedAt = new Date(Date.now() - 30_000);
    const lead = await prisma.lead.create({
      data: {
        name: 'Campaign reply lead',
        mobile: '919999991005',
        source: 'manual',
        status: 'contacted',
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        name: 'Attribution test campaign',
        channel: 'whatsapp',
        messageTemplate: 'Hello {{name}}',
        status: 'running',
        sentCount: 1,
        variantBCount: 1,
      },
    });
    const campaignLead = await prisma.campaignLead.create({
      data: {
        campaignId: campaign.id,
        leadId: lead.id,
        status: 'sent',
        variant: 'B',
        sentAt: new Date(providerCreatedAt.getTime() - 60_000),
      },
    });

    const meta = {
      channel: 'whatsapp',
      messageId: 'reply-attribution-provider-id',
      providerCreatedAt: providerCreatedAt.toISOString(),
    };
    await replyDetector.handleReply(lead.mobile, 'Please send the current price', 1, meta);
    await replyDetector.handleReply(lead.mobile, 'Please send the current price', 1, meta);

    const [updatedCampaign, updatedCampaignLead, inboundMessages] = await Promise.all([
      prisma.campaign.findUnique({ where: { id: campaign.id } }),
      prisma.campaignLead.findUnique({ where: { id: campaignLead.id } }),
      prisma.message.findMany({
        where: { leadId: lead.id, direction: 'inbound' },
        select: { providerCreatedAt: true, sentAt: true },
      }),
    ]);

    assert.equal(updatedCampaignLead.status, 'replied');
    assert.equal(updatedCampaign.replyCount, 1);
    assert.equal(updatedCampaign.variantBReplies, 1);
    assert.equal(inboundMessages.length, 1);
    assert.equal(inboundMessages[0].providerCreatedAt.toISOString(), providerCreatedAt.toISOString());
    assert.equal(inboundMessages[0].sentAt.toISOString(), providerCreatedAt.toISOString());
  });

  test('does not credit an older campaign on a second reply, but credits a later send', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const { default: replyDetector } = await import('../src/services/replyDetector.js');
    const firstReplyAt = new Date(Date.now() - 60_000);
    const lead = await prisma.lead.create({
      data: { name: 'Reactivation lead', mobile: '919999991006', source: 'manual', status: 'contacted' },
    });
    const makeCampaign = async (name, sentAt) => {
      const campaign = await prisma.campaign.create({
        data: { name, channel: 'whatsapp', messageTemplate: 'Hello', status: 'running', sentCount: 1 },
      });
      const campaignLead = await prisma.campaignLead.create({
        data: { campaignId: campaign.id, leadId: lead.id, status: 'sent', variant: 'A', sentAt },
      });
      return { campaign, campaignLead };
    };
    const older = await makeCampaign('Older attribution', new Date(firstReplyAt.getTime() - 120_000));
    const latest = await makeCampaign('Latest attribution', new Date(firstReplyAt.getTime() - 30_000));

    const reply = (body, messageId, at) => replyDetector.handleReply(lead.mobile, body, 1, {
      channel: 'whatsapp', messageId, providerCreatedAt: at.toISOString(),
    });
    await reply('First reply', 'attribution-first', firstReplyAt);
    await reply('Second reply', 'attribution-second', new Date(firstReplyAt.getTime() + 5_000));

    const [olderAfter, latestAfter] = await Promise.all([
      prisma.campaignLead.findUnique({ where: { id: older.campaignLead.id } }),
      prisma.campaignLead.findUnique({ where: { id: latest.campaignLead.id } }),
    ]);
    assert.equal(olderAfter.status, 'sent');
    assert.equal(latestAfter.status, 'replied');

    const later = await makeCampaign('Later attribution', new Date(firstReplyAt.getTime() + 10_000));
    await reply('Third reply', 'attribution-third', new Date(firstReplyAt.getTime() + 20_000));
    const laterAfter = await prisma.campaignLead.findUnique({ where: { id: later.campaignLead.id } });
    const laterCampaign = await prisma.campaign.findUnique({ where: { id: later.campaign.id } });
    assert.equal(laterAfter.status, 'replied');
    assert.equal(laterCampaign.replyCount, 1);
  });
});

describe('Email performance attribution', () => {
  test('requires an inbound email and credits its thread rather than a cross-channel reply', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const lead = await prisma.lead.create({
      data: {
        name: 'Email variant lead', mobile: '919999991007', source: 'manual',
        status: 'replied', repliedAt: new Date(),
      },
    });
    const olderSentAt = new Date(Date.now() - 120_000);
    const newerSentAt = new Date(Date.now() - 60_000);
    await prisma.message.createMany({ data: [
      {
        leadId: lead.id, direction: 'outbound', channel: 'email', content: 'A',
        status: 'sent', templateVariant: 'variant-A', emailMessageId: '<variant-a>', sentAt: olderSentAt,
      },
      {
        leadId: lead.id, direction: 'outbound', channel: 'email', content: 'B',
        status: 'delivered', templateVariant: 'variant-B', emailMessageId: '<variant-b>', sentAt: newerSentAt,
      },
      {
        leadId: lead.id, direction: 'inbound', channel: 'whatsapp', content: 'WhatsApp reply',
        status: 'delivered', sentAt: new Date(),
      },
    ] });

    const performance = () => request('GET', '/api/analytics/email-performance?range=7d', {
      headers: authHeader(),
    });
    const before = await performance();
    assert.equal(before.status, 200);
    assert.equal(before.body.variants.find((v) => v.variant === 'variant-A').replied, 0);
    assert.equal(before.body.variants.find((v) => v.variant === 'variant-B').replied, 0);

    await prisma.message.create({ data: {
      leadId: lead.id, direction: 'inbound', channel: 'email', content: 'Threaded email reply',
      status: 'delivered', emailInReplyTo: '<variant-a>',
    } });
    const afterThreaded = await performance();
    assert.equal(afterThreaded.body.variants.find((v) => v.variant === 'variant-A').replied, 1);
    assert.equal(afterThreaded.body.variants.find((v) => v.variant === 'variant-B').replied, 0);

    await prisma.message.create({ data: {
      leadId: lead.id, direction: 'inbound', channel: 'email', content: 'Unthreaded email reply',
      status: 'delivered',
    } });
    const afterUnthreaded = await performance();
    assert.equal(afterUnthreaded.body.variants.find((v) => v.variant === 'variant-B').replied, 1);
    assert.equal(afterUnthreaded.body.totals.replied, 2);

    const manualLead = await prisma.lead.create({
      data: { name: 'Manual follow-up lead', mobile: '919999991008', source: 'manual' },
    });
    await prisma.message.createMany({ data: [
      {
        leadId: manualLead.id, direction: 'outbound', channel: 'email', content: 'Variant',
        status: 'sent', templateVariant: 'variant-C', sentAt: olderSentAt,
      },
      {
        leadId: manualLead.id, direction: 'outbound', channel: 'email', content: 'Manual follow-up',
        status: 'sent', sentAt: newerSentAt,
      },
      {
        leadId: manualLead.id, direction: 'inbound', channel: 'email', content: 'Reply to manual send',
        status: 'delivered',
      },
    ] });
    const afterManual = await performance();
    assert.equal(afterManual.body.variants.find((v) => v.variant === 'variant-C').sent, 1);
    assert.equal(afterManual.body.variants.find((v) => v.variant === 'variant-C').replied, 0);
  });
});

// ── Campaign Tests ───────────────────────────────────────────────────────────

describe("Campaign CRUD", () => {
  let campaignId;

  test('creates a campaign', async () => {
    const res = await request('POST', '/api/campaigns', {
      headers: authHeader(),
      body: {
        name: 'Test Campaign',
        messageTemplate: 'Hello {{name}}, interested in {{product}}?',
        channel: 'whatsapp',
      },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.id);
    assert.equal(res.body.name, 'Test Campaign');
    assert.equal(res.body.status, 'draft');
    campaignId = res.body.id;
  });

  test('lists campaigns', async () => {
    const res = await request('GET', '/api/campaigns', { headers: authHeader() });
    assert.equal(res.status, 200);
    // /api/campaigns returns { campaigns, total, page, pages } — paginated
    assert.ok(Array.isArray(res.body.campaigns), 'response.campaigns should be an array');
    assert.ok(res.body.campaigns.length >= 1);
    assert.equal(typeof res.body.total, 'number');
  });

  test('gets single campaign with stats', async () => {
    const res = await request('GET', `/api/campaigns/${campaignId}`, { headers: authHeader() });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, campaignId);
    assert.ok(res.body.stats !== undefined, 'should include stats');
  });

  test('campaign audience reads include current destinations and personalized-content fields for owner approval', async () => {
    const lead = await prisma.lead.create({ data: { name: 'Synthetic approval recipient', mobile: '15557778899',
      email: 'approval@example.test', company: 'Synthetic company', product: 'Synthetic product', country: 'US', quantity: '2' } });
    const membership = await prisma.campaignLead.create({ data: { campaignId, leadId: lead.id, status: 'pending' } });
    try {
      const read = () => request('GET', `/api/campaigns/${campaignId}/leads`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.71' } });
      let response = await read();
      assert.equal(response.status, 200);
      let row = response.body.leads.find(item => item.id === membership.id).lead;
      for (const key of ['id', 'name', 'mobile', 'email', 'waUserId', 'company', 'product', 'country', 'quantity',
        'status', 'score', 'repliedAt', 'poolId', 'emailOptOut', 'emailStatus', 'isOnWhatsApp', 'assignedAccount', 'assignedEmailAccountId']) {
        assert.ok(Object.hasOwn(row, key), key);
      }
      assert.equal(row.email, 'approval@example.test');
      await prisma.lead.update({ where: { id: lead.id }, data: { email: 'changed@example.test', product: 'Changed product' } });
      response = await read();
      row = response.body.leads.find(item => item.id === membership.id).lead;
      assert.equal(row.email, 'changed@example.test');
      assert.equal(row.product, 'Changed product');
    } finally {
      await prisma.campaignLead.delete({ where: { id: membership.id } });
      await prisma.lead.delete({ where: { id: lead.id } });
    }
  });
});

// ── System Health ────────────────────────────────────────────────────────────

describe('System endpoints', () => {
  test('GET /api/system/health returns health info', async () => {
    const res = await request('GET', '/api/system/health', { headers: authHeader() });
    assert.equal(res.status, 200);
    assert.ok(res.body.cpu !== undefined || res.body.status !== undefined);
    assert.equal(res.body.disk.available, true);
    assert.ok(res.body.disk.total > 0);
    assert.ok(res.body.disk.percent >= 0 && res.body.disk.percent <= 100);
  });

  test("GET /api/system/status returns live connection counts", async () => {
    const res = await request('GET', '/api/system/status', { headers: authHeader() });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.connectedAccounts, "number");
    assert.equal(typeof res.body.enabledAccounts, "number");
    assert.equal(typeof res.body.dashboardConnections, "number");
  });
});

// ── Daily Brevo Marketing Campaign launch gates ─────────────────────────────

describe('Daily Brevo marketing campaign gates', () => {
  test('does not expose campaign settings without manager access', async () => {
    const res = await request('GET', '/api/email/daily/status');
    assert.equal(res.status, 401);
  });

  test('reports Brevo marketing as the only daily delivery route', async () => {
    const res = await request('GET', '/api/email/daily/status', { headers: authHeader() });
    assert.equal(res.status, 200);
    assert.equal(res.body.deliveryMode, 'brevo_marketing');
    assert.equal(res.body.marketing.folderConfigured, false);
    assert.equal(res.body.marketing.webhookConfigured, false);
  });

  test('rejects malformed Brevo recipient-list folder IDs', async () => {
    const res = await request('PATCH', '/api/email/daily/settings', {
      headers: authHeader(),
      body: { brevoFolderId: '12abc' },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /brevoFolderId/i);
  });

  test('stores and clears a valid Brevo recipient-list folder ID without sending', async () => {
    const set = await request('PATCH', '/api/email/daily/settings', {
      headers: authHeader(),
      body: { brevoFolderId: 12345 },
    });
    assert.equal(set.status, 200);
    assert.equal(set.body.marketing.folderId, 12345);
    assert.equal(set.body.marketing.folderConfigured, true);

    const clear = await request('PATCH', '/api/email/daily/settings', {
      headers: authHeader(),
      body: { brevoFolderId: null },
    });
    assert.equal(clear.status, 200);
    assert.equal(clear.body.marketing.folderId, null);
    assert.equal(clear.body.marketing.folderConfigured, false);
  });

  test('does not mutate legacy settings or launch without a reviewed preview', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    await prisma.systemConfig.upsert({
      where: { key: 'email.daily.delivery_mode' },
      update: { value: 'transactional' },
      create: { key: 'email.daily.delivery_mode', value: 'transactional' },
    });
    const messagesBefore = await prisma.message.count({ where: { channel: 'email' } });

    const res = await request('POST', '/api/email/daily/queue', {
      headers: authHeader(),
      body: { force: true },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.skipped, true);
    assert.equal(res.body.reason, 'reviewed_preview_required');

    const mode = await prisma.systemConfig.findUnique({ where: { key: 'email.daily.delivery_mode' } });
    const messagesAfter = await prisma.message.count({ where: { channel: 'email' } });
    assert.equal(mode.value, 'transactional', 'an invalid launch must not repair or mutate settings');
    assert.equal(messagesAfter, messagesBefore);
  });
});

// ── Meta WhatsApp Cloud API webhook ──────────────────────────────────────────

describe('Meta WhatsApp webhook', () => {
  const sign = (payload) => `sha256=${crypto.createHmac('sha256', 'test-meta-app-secret')
    .update(JSON.stringify(payload)).digest('hex')}`;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

  test('answers the subscription handshake only with the right verify token', async () => {
    const ok = await request('GET', '/webhook/meta?hub.mode=subscribe&hub.verify_token=test-meta-verify-token&hub.challenge=12345');
    assert.equal(ok.status, 200);
    assert.equal(String(ok.body), '12345');
    assert.match(ok.headers['content-type'], /^text\/plain/);
    const challenge = '<img src=x onerror=alert(1)>';
    const escaped = await request('GET', '/webhook/meta?hub.mode=subscribe&hub.verify_token=test-meta-verify-token&hub.challenge=' + encodeURIComponent(challenge));
    assert.equal(escaped.body, challenge);
    assert.match(escaped.headers['content-type'], /^text\/plain/);
    const bad = await request('GET', '/webhook/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345');
    assert.equal(bad.status, 403);
  });

  test('rejects an unsigned or wrongly signed delivery', async () => {
    const payload = { object: 'whatsapp_business_account', entry: [] };
    const unsigned = await request('POST', '/webhook/meta', { body: payload });
    assert.equal(unsigned.status, 401);
    const forged = await request('POST', '/webhook/meta', {
      body: payload,
      headers: { 'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64) },
    });
    assert.equal(forged.status, 401);
  });

  test('records an inbound reply and a read receipt', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const account = await prisma.whatsAppAccount.create({
      data: { name: 'Meta number', provider: 'meta', cloudApiPhoneId: 'PNID-TEST-1', enabled: true },
    });
    const lead = await prisma.lead.create({
      data: { name: 'Meta Buyer', mobile: '15551230001', source: 'manual' },
    });
    const outbound = await prisma.message.create({
      data: {
        leadId: lead.id, direction: 'outbound', channel: 'whatsapp', content: 'Hello',
        status: 'sent', waAccount: account.id, waMessageId: 'wamid.OUTBOUND-1',
      },
    });

    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'WABA-1',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15550000000', phone_number_id: 'PNID-TEST-1' },
            messages: [{
              from: '15551230001', id: 'wamid.INBOUND-1', timestamp: '1790000000',
              type: 'text', text: { body: 'Yes, still interested' },
            }],
            statuses: [{ id: 'wamid.OUTBOUND-1', status: 'read', recipient_id: '15551230001' }],
          },
        }],
      }],
    };
    const res = await request('POST', '/webhook/meta', {
      body: payload,
      headers: { 'X-Hub-Signature-256': sign(payload) },
    });
    assert.equal(res.status, 200);
    await settle();

    const inbound = await prisma.message.findFirst({ where: { waMessageId: 'wamid.INBOUND-1', direction: 'inbound' } });
    assert.ok(inbound, 'inbound reply was stored');
    assert.equal(inbound.leadId, lead.id);
    assert.equal(inbound.content, 'Yes, still interested');

    const receipt = await prisma.message.findUnique({ where: { id: outbound.id } });
    assert.equal(receipt.ackStatus, 3);
    assert.equal(receipt.status, 'read');
  });

  test('both inbox endpoints order delayed webhook/media events by their original timestamp', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const lead = await prisma.lead.create({ data: { name: 'Timeline fixture', mobile: '15551239881', status: 'paused' } });
    const records = [];
    for (const [offset, arrival] of [[10, 11], [5, 12], [20, 4]]) {
      records.push(await prisma.message.create({ data: {
        leadId: lead.id, direction: offset === 20 ? 'outbound' : 'inbound', channel: 'whatsapp', status: 'delivered',
        content: offset === 5 ? '[unsupported]' : `Fixture event ${offset}`,
        providerCreatedAt: new Date(Date.UTC(2026, 9, 24, 10, 0, offset)),
        sentAt: new Date(Date.UTC(2026, 9, 24, 10, 0, offset)),
        createdAt: new Date(Date.UTC(2026, 9, 24, 10, 0, arrival)),
      } }));
    }
    const expected = [records[1].id, records[0].id, records[2].id];
    const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.77' };
    const detail = await request('GET', `/api/inbox/threads/${lead.id}`, { headers });
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.messages.map(row => row.id), expected);
    assert.equal(detail.body.lastMessage, records[2].content);
    assert.equal(detail.body.replyNeeded, false);
    assert.match(detail.body.messages[0].content, /could not provide/);
    const messages = await request('GET', `/api/inbox/threads/${lead.id}/messages`, { headers });
    assert.equal(messages.status, 200);
    assert.deepEqual(messages.body.map(row => row.id), expected);
    const queue = await request('GET', `/api/inbox/threads?leadId=${lead.id}&state=waiting`, { headers });
    assert.equal(queue.status, 200);
    assert.equal(queue.body.threads.length, 1);
    assert.equal(queue.body.threads[0].lastMessage, records[2].content);
    assert.equal(queue.body.threads[0].replyNeeded, false);
  });

  test('a newly imported customer reply reopens a resolved conversation despite an older provider timestamp', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const lead = await prisma.lead.create({ data: { name: 'Delayed reply fixture', mobile: 'no-phone:delayed-reply-fixture', status: 'closed', inboxResolvedAt: new Date('2026-10-24T10:10:00Z') } });
    await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'inbound', status: 'delivered', content: 'Delayed customer reply',
      providerCreatedAt: new Date('2026-10-24T10:00:00Z'), createdAt: new Date('2026-10-24T10:20:00Z') } });
    const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.77' };
    const queue = await request('GET', `/api/inbox/threads?leadId=${lead.id}&state=needs_reply`, { headers });
    assert.equal(queue.status, 200);
    assert.equal(queue.body.threads.length, 1);
    assert.equal(queue.body.threads[0].replyNeeded, true);
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'closed');
  });

  const metaDelivery = (value) => ({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA-1',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15550000000', phone_number_id: 'PNID-TEST-1' },
          ...value,
        },
      }],
    }],
  });
  const deliver = async (payload) => {
    const res = await request('POST', '/webhook/meta', { body: payload, headers: { 'X-Hub-Signature-256': sign(payload) } });
    assert.equal(res.status, 200);
    await settle();
  };

  test('keeps a message from a username user Meta sends without a phone number', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    await deliver(metaDelivery({
      contacts: [{ profile: { name: 'Priya Shah', username: 'priya.imports' }, user_id: 'IN.84629173550129' }],
      messages: [{
        from_user_id: 'IN.84629173550129', id: 'wamid.BSUID-1', timestamp: '1790000100',
        type: 'text', text: { body: 'Do you ship to Pune?' },
      }],
    }));

    const lead = await prisma.lead.findUnique({ where: { waUserId: 'IN.84629173550129' } });
    assert.ok(lead, 'a lead was created for the username user');
    assert.equal(lead.waUsername, 'priya.imports');
    assert.equal(lead.name, 'Priya Shah');
    assert.equal(lead.mobile, 'no-phone:IN.84629173550129');
    const first = await prisma.message.findFirst({ where: { waMessageId: 'wamid.BSUID-1', direction: 'inbound' } });
    assert.equal(first?.leadId, lead.id);

    // A second message with only the user id lands on the same lead.
    await deliver(metaDelivery({
      contacts: [{ profile: { name: 'Priya Shah' }, user_id: 'IN.84629173550129' }],
      messages: [{
        from_user_id: 'IN.84629173550129', id: 'wamid.BSUID-2', timestamp: '1790000200',
        type: 'text', text: { body: '200 units please' },
      }],
    }));
    const second = await prisma.message.findFirst({ where: { waMessageId: 'wamid.BSUID-2', direction: 'inbound' } });
    assert.equal(second?.leadId, lead.id);
    assert.equal(await prisma.lead.count({ where: { waUserId: 'IN.84629173550129' } }), 1);
  });

  test('learns a known lead\'s user id, then matches it when the number is withheld', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const lead = await prisma.lead.create({ data: { name: 'Known Buyer', mobile: '15551230077', source: 'manual' } });

    await deliver(metaDelivery({
      contacts: [{ profile: { name: 'Known Buyer' }, wa_id: '15551230077', user_id: 'US.55512300770001' }],
      messages: [{
        from: '15551230077', from_user_id: 'US.55512300770001', id: 'wamid.BOTH-1', timestamp: '1790000300',
        type: 'text', text: { body: 'Hi again' },
      }],
    }));
    const learnt = await prisma.lead.findUnique({ where: { id: lead.id } });
    assert.equal(learnt.waUserId, 'US.55512300770001');

    await deliver(metaDelivery({
      contacts: [{ profile: { name: 'Known Buyer' }, user_id: 'US.55512300770001' }],
      messages: [{
        from_user_id: 'US.55512300770001', id: 'wamid.IDONLY-1', timestamp: '1790000400',
        type: 'text', text: { body: 'Any update?' },
      }],
    }));
    const matched = await prisma.message.findFirst({ where: { waMessageId: 'wamid.IDONLY-1', direction: 'inbound' } });
    assert.equal(matched?.leadId, lead.id, 'the phone-less message found the existing lead');
  });

  test('stores a photo a lead sends and serves it only to signed-in users; sends a file back', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const photo = Buffer.from('\xff\xd8\xff\xe0fake-jpeg-bytes', 'binary');
    const seen = { downloads: 0, uploads: 0, messages: [] };
    let windowClosed = false;

    // A stand-in for graph.facebook.com.
    const graph = http.createServer((req, res) => {
      const auth = req.headers.authorization === 'Bearer test-meta-token';
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        if (!auth) return json(401, { error: { message: 'bad token' } });
        if (req.method === 'GET' && req.url === '/media-photo-1') {
          return json(200, { url: `http://127.0.0.1:${graph.address().port}/files/photo-1`, mime_type: 'image/jpeg', file_size: photo.length });
        }
        if (req.method === 'GET' && req.url === '/files/photo-1') {
          seen.downloads += 1;
          res.writeHead(200, { 'Content-Type': 'image/jpeg' });
          return res.end(photo);
        }
        if (req.method === 'POST' && req.url === '/PNID-MEDIA/media') {
          seen.uploads += 1;
          assert.match(String(req.headers['content-type']), /multipart\/form-data/);
          return json(200, { id: 'uploaded-media-1' });
        }
        if (req.method === 'POST' && req.url === '/PNID-MEDIA/messages') {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          seen.messages.push(body);
          if (windowClosed) return json(400, { error: { code: 131047, message: 'Re-engagement message' } });
          return json(200, { messages: [{ id: `wamid.MEDIA-OUT-${seen.messages.length}` }], contacts: [{ wa_id: '15551230099' }] });
        }
        json(404, { error: { message: 'not found' } });
      });
    });
    await new Promise((resolve) => graph.listen(0, '127.0.0.1', resolve));
    const previousBase = process.env.META_GRAPH_API_BASE;
    const previousToken = process.env.META_ACCESS_TOKEN;
    process.env.META_GRAPH_API_BASE = `http://127.0.0.1:${graph.address().port}`;
    process.env.META_ACCESS_TOKEN = 'test-meta-token';
    const createdFiles = [];

    try {
      const account = await prisma.whatsAppAccount.create({
        data: { name: 'Media number', provider: 'meta', cloudApiPhoneId: 'PNID-MEDIA', cloudApiToken: 'test-meta-token', enabled: true },
      });
      const lead = await prisma.lead.create({
        data: { name: 'Photo Buyer', mobile: '15551230099', source: 'manual', assignedAccount: account.id },
      });

      // 1. The lead sends a photo.
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{ id: 'WABA-1', changes: [{ field: 'messages', value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15550000000', phone_number_id: 'PNID-MEDIA' },
          contacts: [{ profile: { name: 'Photo Buyer' }, wa_id: '15551230099', user_id: 'US.55512300990001' }],
          messages: [{
            from: '15551230099', from_user_id: 'US.55512300990001', id: 'wamid.PHOTO-IN-1', timestamp: String(Math.floor(Date.now() / 1000)),
            type: 'image', image: { id: 'media-photo-1', mime_type: 'image/jpeg' },
          }],
        } }] }],
      };
      await deliver(payload);
      // Meta is acknowledged after the inbound message is durably recorded.
      // Keep this lookup bounded so a failed write gives a useful assertion.
      const deadline = Date.now() + 3000;
      let inbound;
      do {
        inbound = await prisma.message.findFirst({ where: { waMessageId: 'wamid.PHOTO-IN-1', direction: 'inbound' } });
        if (inbound) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      } while (Date.now() < deadline);
      assert.ok(inbound, 'the photo message was recorded');
      assert.equal(inbound.leadId, lead.id);
      assert.equal(inbound.mediaType, 'image');
      assert.match(inbound.mediaUrl, /^data\/media\/.+\.jpg$/);
      assert.equal(inbound.content, '[Photo]');
      createdFiles.push(path.join(__dirname, '..', inbound.mediaUrl));

      // A retry of the same delivery does not store the file again.
      await deliver(payload);
      assert.equal(seen.downloads, 1);

      // 2. Only signed-in users can open it, and it cannot run as a page.
      const anonymous = await request('GET', `/api/messages/${inbound.id}/media`);
      assert.equal(anonymous.status, 401);
      const file = await new Promise((resolve, reject) => {
        http.get(new URL(`/api/messages/${inbound.id}/media`, baseUrl), { headers: authHeader() }, (res) => {
          const parts = [];
          res.on('data', (c) => parts.push(c));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
        }).on('error', reject);
      });
      assert.equal(file.status, 200);
      assert.ok(file.body.equals(photo), 'the stored bytes are served');
      assert.match(String(file.headers['content-security-policy']), /sandbox/);
      assert.equal(file.headers['x-content-type-options'], 'nosniff');

      // 3. The team sends a file back with a caption.
      const storedName = `test-${process.pid}.pdf`;
      const storedPath = path.join(__dirname, '..', 'data', 'media', storedName);
      fs.mkdirSync(path.dirname(storedPath), { recursive: true });
      fs.writeFileSync(storedPath, '%PDF-1.4 test');
      createdFiles.push(storedPath);
      const library = await prisma.mediaFile.create({
        data: { filename: storedName, originalName: 'price-list.pdf', mimeType: 'application/pdf', size: 13, path: `data/media/${storedName}` },
      });
      const sent = await request('POST', `/api/leads/${lead.id}/send-media`, {
        body: { mediaFileId: library.id, caption: 'Our price list' },
        headers: authHeader(),
      });
      assert.equal(sent.status, 200, JSON.stringify(sent.body));
      assert.equal(seen.uploads, 1);
      const outBody = seen.messages.at(-1);
      assert.equal(outBody.type, 'document');
      assert.deepEqual(outBody.document, { id: 'uploaded-media-1', caption: 'Our price list', filename: 'price-list.pdf' });
      assert.equal(outBody.to, '15551230099');
      const outbound = await prisma.message.findFirst({ where: { leadId: lead.id, direction: 'outbound', mediaFilename: 'price-list.pdf' } });
      assert.equal(outbound.waMessageId, 'wamid.MEDIA-OUT-1');
      assert.equal(outbound.mediaType, 'pdf');
      assert.ok(outbound.manualSendKey, 'files use the same durable manual attempt path');

      // 4. The first file reaches the provider and the second waits for capacity.
      const second = await prisma.mediaFile.create({
        data: { filename: `second-${storedName}`, originalName: 'second-list.pdf', mimeType: 'application/pdf', size: 13, path: `data/media/${storedName}` },
      });
      const batch = { mediaFileIds: [library.id, second.id], clientMessageId: 'fixture-media-quota-batch-01' };
      const sendBatch = () => request('POST', `/api/leads/${lead.id}/send-media`, {
        body: batch, headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.243' },
      });
      const held = await sendBatch();
      assert.equal(held.status, 429, JSON.stringify(held.body));
      assert.equal(held.body.code, 'manual_send_quota');
      assert.equal(seen.uploads, 2);
      await prisma.whatsAppAccount.update({ where: { id: account.id }, data: { hourlyLimit: 4 } });
      assert.equal((await sendBatch()).status, 200);
      assert.equal(seen.uploads, 3, 'retry sends only the file that did not reach the provider');

      // 5. Outside the 24-hour window the error says what to do.
      windowClosed = true;
      const late = await request('POST', `/api/leads/${lead.id}/send-media`, {
        body: { mediaFileId: library.id },
        headers: authHeader(),
      });
      assert.equal(late.status, 502);
      assert.match(late.body.error, /24 hours/);
    } finally {
      await new Promise((resolve) => graph.close(resolve));
      if (previousBase === undefined) delete process.env.META_GRAPH_API_BASE; else process.env.META_GRAPH_API_BASE = previousBase;
      if (previousToken === undefined) delete process.env.META_ACCESS_TOKEN; else process.env.META_ACCESS_TOKEN = previousToken;
      for (const f of createdFiles) fs.rmSync(f, { force: true });
    }
  });

  test('records Meta\'s pricing from a status update', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const lead = await prisma.lead.create({ data: { name: 'Priced Buyer', mobile: '15551230088', source: 'manual' } });
    const outbound = await prisma.message.create({
      data: {
        leadId: lead.id, direction: 'outbound', channel: 'whatsapp', content: 'Template',
        status: 'sent', waAccount: (await prisma.whatsAppAccount.findFirst({ where: { cloudApiPhoneId: 'PNID-TEST-1' } })).id, waMessageId: 'wamid.PRICED-1',
      },
    });
    await deliver(metaDelivery({
      statuses: [{
        id: 'wamid.PRICED-1', status: 'delivered', recipient_id: '15551230088', recipient_user_id: 'US.55512300880001',
        pricing: { billable: true, pricing_model: 'PMP', category: 'marketing', type: 'regular' },
      }],
    }));
    const priced = await prisma.message.findUnique({ where: { id: outbound.id } });
    assert.equal(priced.pricingCategory, 'marketing');
    assert.equal(priced.pricingType, 'regular');
    assert.equal(priced.billable, true);
    assert.equal(priced.status, 'delivered');
  });
});

// ── Built-in sign-in ─────────────────────────────────────────────────────────

describe('Built-in email and password sign-in', () => {
  const email = 'owner@example.test';
  const password = 'correct horse battery staple';

  test('tells the dashboard to render the built-in form', async () => {
    const res = await request('GET', '/api/auth/config');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { provider: 'local' });
  });

  test('signs in with the right password and not with the wrong one', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const { hashPassword } = await import('../src/auth/rbac.js');
    await prisma.user.create({
      data: { name: 'Owner', email, passwordHash: hashPassword(password), role: 'admin' },
    });

    const wrong = await request('POST', '/api/auth/login', { body: { email, password: 'nope' } });
    assert.equal(wrong.status, 401);
    const unknown = await request('POST', '/api/auth/login', { body: { email: 'nobody@example.test', password } });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error, wrong.body.error, 'same message whether or not the email exists');

    const ok = await request('POST', '/api/auth/login', { body: { email: email.toUpperCase(), password } });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);
    assert.equal(ok.body.user.role, 'admin');

    const me = await request('GET', '/api/auth/me', { headers: { Authorization: `Bearer ${ok.body.token}` } });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, email);
  });

  test('initializes a blank admin password once from a trusted terminal', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const email = 'initial-admin@example.test';
    const password = 'first admin fixture password';
    const reset = path.join(__dirname, '..', 'scripts', 'reset-password.mjs');
    await prisma.user.create({
      data: { name: 'Initial admin', email, passwordHash: '', role: 'admin' },
    });
    const command = (mode, input) => execFileSync(process.execPath, [reset, email, mode], {
      input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    try {
      assert.equal(command('--status'), 'needs-password');
      assert.ok(!command('--initial', `${password}\n`).includes(password));
      assert.equal(command('--status'), 'configured');
      assert.throws(() => command('--initial', 'replacement fixture password\n'),
        error => error.stderr.includes('The first password is already set'));
      const result = await request('POST', '/api/auth/login', {
        headers: { 'X-Forwarded-For': '198.51.100.215' }, body: { email, password },
      });
      assert.equal(result.status, 200);
    } finally {
      await prisma.user.delete({ where: { email } });
    }
  });

  test('a disabled user is locked out even with a valid token', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const ok = await request('POST', '/api/auth/login', { body: { email, password } });
    await prisma.user.update({ where: { email }, data: { enabled: false } });
    const me = await request('GET', '/api/auth/me', { headers: { Authorization: `Bearer ${ok.body.token}` } });
    assert.equal(me.status, 401);
    await prisma.user.update({ where: { email }, data: { enabled: true } });
  });

  test('password change requires the current password and replaces the local session', async () => {
    const ok = await request('POST', '/api/auth/login', { body: { email, password } });
    const headers = { Authorization: `Bearer ${ok.body.token}` };
    const bad = await request('POST', '/api/auth/change-password', {
      headers, body: { currentPassword: 'nope', newPassword: 'a much longer new password' },
    });
    assert.equal(bad.status, 403);
    const good = await request('POST', '/api/auth/change-password', {
      headers, body: { currentPassword: password, newPassword: 'a much longer new password' },
    });
    assert.equal(good.status, 200);
    assert.notEqual(good.body.token, ok.body.token);
    assert.equal((await request('GET', '/api/auth/me', { headers })).status, 401);
    assert.equal((await request('GET', '/api/events', { headers })).status, 401);
    assert.equal((await request('GET', '/api/auth/me', {
      headers: { Authorization: `Bearer ${good.body.token}` },
    })).status, 200);
    const relogin = await request('POST', '/api/auth/login', { body: { email, password: 'a much longer new password' } });
    assert.equal(relogin.status, 200);
  });

  test('the live-updates stream accepts a session header and rejects URL credentials', async () => {
    const headers = { 'X-Forwarded-For': '198.51.100.212' };
    const ok = await request('POST', '/api/auth/login', { headers, body: { email, password: 'a much longer new password' } });
    const token = ok.body.token;
    const stream = await new Promise((resolve, reject) => {
      const req = http.get(new URL('/api/events', baseUrl), { headers: { ...headers, Authorization: `Bearer ${token}` } }, (res) => {
        resolve(res.statusCode);
        res.destroy();
      });
      req.on('error', reject);
    });
    assert.equal(stream, 200);
    for (const path of ['/api/events', '/api/leads']) {
      const query = await request('GET', `${path}?token=${encodeURIComponent(token)}`, { headers });
      assert.equal(query.status, 401);
    }
  });

  test('terminal reset revokes an already-open stream before the next event', async () => {
    const source = { 'X-Forwarded-For': '192.0.2.218' };
    const old = await request('POST', '/api/auth/login', {
      headers: source, body: { email, password: 'a much longer new password' },
    });
    assert.equal(old.status, 200);
    const oldHeaders = { ...source, Authorization: `Bearer ${old.body.token}` };

    let connection;
    let received = '';
    let streamEnded;
    try {
      await new Promise((resolve, reject) => {
        connection = http.get(new URL('/api/events', baseUrl), { headers: oldHeaders }, res => {
          if (res.statusCode !== 200) return reject(new Error(`Stream returned ${res.statusCode}`));
          streamEnded = new Promise((done, fail) => {
            res.on('end', done);
            res.on('error', fail);
          });
          res.setEncoding('utf8').on('data', chunk => { received += chunk; });
          resolve();
        });
        connection.setTimeout(8000, () => connection.destroy(new Error('Stream reset timed out')));
        connection.on('error', reject);
      });

      const reset = path.join(__dirname, '..', 'scripts', 'reset-password.mjs');
      const replacement = '  CLI fixture password  ';
      assert.throws(() => execFileSync(process.execPath, [reset, email], {
        env: process.env, input: 'short\n', stdio: ['pipe', 'pipe', 'pipe'],
      }), error => String(error.stderr).includes('Use at least 10 characters.'));
      assert.equal((await request('GET', '/api/auth/me', { headers: oldHeaders })).status, 200);
      const output = execFileSync(process.execPath, [reset, email.toUpperCase()], {
        env: process.env, input: `${replacement}\n`, encoding: 'utf8',
      });
      assert.ok(!output.includes(replacement));
      const { broadcastEvent } = await import('../src/api.js');
      broadcastEvent('credential-reset-fixture', {});
      await streamEnded;
      assert.ok(!received.includes('credential-reset-fixture'));
      assert.equal((await request('GET', '/api/auth/me', { headers: oldHeaders })).status, 401);
      const current = await request('POST', '/api/auth/login', {
        headers: source, body: { email, password: replacement },
      });
      assert.equal(current.status, 200);
    } finally {
      connection?.destroy();
    }
  });

  test('rejects requests with no session', async () => {
    const res = await request('GET', '/api/leads');
    assert.equal(res.status, 401);
  });
});

// ── Website form submissions ─────────────────────────────────────────────────

describe('Lead webhook from a plain HTML form', () => {
  test('returns the configured public origin and accepts a form-encoded lead', async () => {
    const previous = process.env.PUBLIC_URL;
    process.env.PUBLIC_URL = 'https://crm.example.test';
    let source;
    try {
      source = await request('POST', '/api/webhooks/sources/from-preset', {
        headers: authHeader(),
        body: { presetId: 'website', name: 'Contact form' },
      });
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_URL;
      else process.env.PUBLIC_URL = previous;
    }
    assert.equal(source.status, 200);
    assert.equal(source.body.webhookOrigin, 'https://crm.example.test');
    const { webhookUrl, apiKey } = source.body;

    const form = new URLSearchParams({
      name: 'Form Visitor',
      phone: '+44 7700 900123',
      email: 'visitor@example.test',
      message: 'Need 500 units',
    }).toString();
    const status = await new Promise((resolve, reject) => {
      const url = new URL(`${webhookUrl}?apiKey=${apiKey}`, baseUrl);
      const req = http.request({
        method: 'POST', hostname: url.hostname, port: url.port, path: url.pathname + url.search,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) },
      }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject);
      req.end(form);
    });
    assert.equal(status, 200);

    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const lead = await prisma.lead.findFirst({ where: { email: 'visitor@example.test' } });
    assert.ok(lead, 'lead was created from the form post');
    assert.equal(lead.name, 'Form Visitor');
    assert.equal(lead.product, 'Need 500 units');
    assert.equal(lead.emailMarketingConsent, false, 'no box ticked, no consent');
  });

  test('records email consent only when the form says yes', async () => {
    const source = await request('POST', '/api/webhooks/sources/from-preset', {
      headers: authHeader(),
      body: { presetId: 'website', name: 'Newsletter form' },
    });
    const post = (body) => request('POST', `${source.body.webhookUrl}?apiKey=${source.body.apiKey}`, { body });
    await post({ name: 'Yes Please', email: 'yes@example.test', phone: '+44 7700 900124', email_consent: 'on' });
    await post({ name: 'No Thanks', email: 'no@example.test', phone: '+44 7700 900125', email_consent: 'false' });

    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const yes = await prisma.lead.findFirst({ where: { email: 'yes@example.test' } });
    const no = await prisma.lead.findFirst({ where: { email: 'no@example.test' } });
    assert.equal(yes.emailMarketingConsent, true);
    assert.match(yes.emailMarketingConsentSource, /^webhook:website-/);
    assert.equal(no.emailMarketingConsent, false);
  });

  test('other API routes still refuse form-encoded bodies', async () => {
    const status = await new Promise((resolve, reject) => {
      const url = new URL('/api/leads', baseUrl);
      const body = 'name=X&mobile=123';
      const req = http.request({
        method: 'POST', hostname: url.hostname, port: url.port, path: url.pathname,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...authHeader() },
      }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject);
      req.end(body);
    });
    assert.notEqual(status, 200);
  });
});

// ── Workspace profile and onboarding ─────────────────────────────────────────

describe('Workspace profile and onboarding', () => {
  test('untrusted cookie requests cannot trigger administrative webhook actions', async () => {
    const res = await request('POST', '/api/webhooks/subscriptions/123/test', {
      headers: { Cookie: '__session=fixture', Origin: 'https://untrusted.example.test' },
    });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /trusted origin/);
  });
  test('an outbound webhook test checks one destination and does not follow a redirect', async () => {
    const { default: db } = await import('../src/utils/prismaClient.js');
    const calls = [];
    const receiver = http.createServer((req, res) => {
      calls.push(req.url);
      req.resume();
      if (req.url === '/redirect') res.writeHead(307, { Location: '/unexpected' });
      else res.writeHead(204);
      res.end();
    });
    await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${receiver.address().port}`;
    const previous = process.env.OUTBOUND_WEBHOOK_TRUSTED_ORIGINS;
    delete process.env.OUTBOUND_WEBHOOK_TRUSTED_ORIGINS;
    const headers = { ...authHeader(), 'X-Forwarded-For': '198.51.100.227' };
    const root = '/api/webhooks/subscriptions';
    try {
      const blocked = await request('POST', root, { headers, body: { name: 'Blocked fixture', url: origin + '/unexpected' } });
      assert.equal(blocked.status, 400);
      const legacy = await db.webhookSubscription.create({ data: { name: 'Legacy fixture', url: origin + '/unexpected', enabled: false } });
      const blockedTest = await request('POST', `${root}/${legacy.id}/test`, { headers });
      assert.equal(blockedTest.status, 422);
      assert.deepEqual(calls, []);
      process.env.OUTBOUND_WEBHOOK_TRUSTED_ORIGINS = origin;
      const other = await request('POST', root, { headers, body: { name: 'Other fixture', url: origin + '/other' } });
      const selected = await request('POST', root, { headers, body: { name: 'Selected fixture', url: origin + '/redirect', events: ['lead.replied'] } });
      assert.equal(other.status, 200);
      assert.equal(selected.status, 200);
      const testId = `${root}/${selected.body.id}`;
      const failure = await request('POST', `${testId}/test`, { headers });
      assert.equal(failure.status, 422);
      assert.equal(failure.body.status, 307);
      assert.equal((await request('PATCH', testId, { headers, body: { url: origin + '/selected' } })).status, 200);
      const success = await request('POST', `${testId}/test`, { headers });
      assert.equal(success.status, 200);
      assert.deepEqual(calls, ['/redirect', '/selected']);
    } finally {
      if (previous === undefined) delete process.env.OUTBOUND_WEBHOOK_TRUSTED_ORIGINS;
      else process.env.OUTBOUND_WEBHOOK_TRUSTED_ORIGINS = previous;
      await db.webhookSubscription.deleteMany({ where: { url: { startsWith: origin } } });
      await new Promise(resolve => receiver.close(resolve));
    }
  });
  test('a new workspace reports what is left to set up', async () => {
    const res = await request('GET', '/api/onboarding/status', { headers: authHeader() });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.steps.profile, 'boolean');
    assert.equal(typeof res.body.channels.whatsapp, 'boolean');
    assert.equal(res.body.dismissed, false);
  });

  test('saves the profile to the database and applies it at once', async () => {
    const save = await request('PUT', '/api/workspace/profile', {
      headers: authHeader(),
      body: {
        BUSINESS_NAME: 'Harbor Supply Co.',
        BUSINESS_TIMEZONE: 'Europe/London',
        DEFAULT_COUNTRY_CODE: '+44',
        BUSINESS_WEBSITE: 'https://harbor.example',
        NOT_A_FIELD: 'ignored',
        ...JSON.parse('{"__proto__":"ignored","constructor":"ignored","toString":"ignored"}'),
      },
    });
    assert.equal(save.status, 200);
    assert.equal(save.body.BUSINESS_NAME, 'Harbor Supply Co.');
    assert.equal(save.body.DEFAULT_COUNTRY_CODE, '44');
    assert.equal(save.body.NOT_A_FIELD, undefined);
    assert.equal(Object.hasOwn(save.body, '__proto__'), false);

    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const row = await prisma.systemConfig.findUnique({ where: { key: 'workspace.BUSINESS_TIMEZONE' } });
    assert.equal(row.value, 'Europe/London');

    const brand = await request('GET', '/api/config/brand', { headers: authHeader() });
    assert.equal(brand.body.businessName, 'Harbor Supply Co.');
    assert.equal(brand.body.timezone, 'Europe/London');

    const status = await request('GET', '/api/onboarding/status', { headers: authHeader() });
    assert.equal(status.body.steps.profile, true);
  });

  test('rejects an invalid value without saving any of the batch', async () => {
    const res = await request('PUT', '/api/workspace/profile', {
      headers: authHeader(),
      body: { BUSINESS_NAME: 'Should not save', BUSINESS_TIMEZONE: 'Mars/Olympus' },
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.BUSINESS_TIMEZONE);
    const after = await request('GET', '/api/workspace/profile', { headers: authHeader() });
    assert.equal(after.body.BUSINESS_NAME, 'Harbor Supply Co.');
  });

  test('the old settings form endpoint saves through the same path', async () => {
    const res = await request('POST', '/api/config/env', {
      headers: authHeader(),
      body: { BUSINESS_CITY: 'Leeds' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.profile.BUSINESS_CITY, 'Leeds');
  });

  test('the checklist can be dismissed', async () => {
    const res = await request('POST', '/api/onboarding/dismiss', { headers: authHeader(), body: {} });
    assert.equal(res.status, 200);
    const status = await request('GET', '/api/onboarding/status', { headers: authHeader() });
    assert.equal(status.body.dismissed, true);
  });
});

// ── Role checks ──────────────────────────────────────────────────────────────

describe('View-only users cannot change or export data', () => {
  test('a viewer can read leads but not delete a number, cancel sends or export', async () => {
    const created = await request('POST', '/api/users', {
      headers: authHeader(),
      body: { name: 'Read Only', email: 'viewer@example.test', password: 'viewer password 123', role: 'viewer' },
    });
    assert.equal(created.status, 200);
    const login = await request('POST', '/api/auth/login', {
      body: { email: 'viewer@example.test', password: 'viewer password 123' },
    });
    const headers = { Authorization: `Bearer ${login.body.token}` };

    assert.equal((await request('GET', '/api/leads', { headers })).status, 200);
    assert.equal((await request('DELETE', '/api/whatsapp/accounts/1', { headers })).status, 403);
    assert.equal((await request('POST', '/api/messages/cancel-all', { headers })).status, 403);
    assert.equal((await request('GET', '/api/export/csv', { headers })).status, 403);
    assert.equal((await request('GET', '/api/config', { headers })).status, 403);
    assert.equal((await request('POST', '/api/leads', { headers, body: { name: 'X', mobile: '15550001111' } })).status, 403);
  });
});

describe('Provider webhooks refuse unauthenticated deliveries', () => {
  test('retired WhatsApp webhook is not registered', async () => {
    for (const method of ['GET', 'POST']) {
      const res = await request(method, '/webhook/whatsapp-cloud', { body: method === 'POST' ? {} : undefined });
      assert.equal(res.status, 404);
    }
  });

  test('iMessage webhook needs its secret', async () => {
    const res = await request('POST', '/webhook/imessage', { body: { type: 'new-message' } });
    assert.equal(res.status, 401);
    const ok = await request('POST', '/webhook/imessage?token=test-imessage-webhook-secret', { body: { type: 'noop' } });
    assert.equal(ok.status, 200);
  });
});

describe('Plain HTML form niceties', () => {
  let target;
  const postForm = (fields, headers = {}) => new Promise((resolve, reject) => {
    const body = new URLSearchParams(fields).toString();
    const url = new URL(target, baseUrl);
    const req = http.request({
      method: 'POST', hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), ...headers },
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, text }));
    });
    req.on('error', reject);
    req.end(body);
  });

  test('setup', async () => {
    const source = await request('POST', '/api/webhooks/sources/from-preset', {
      headers: authHeader(), body: { presetId: 'website', name: 'Nicety form' },
    });
    target = `${source.body.webhookUrl}?apiKey=${source.body.apiKey}`;
  });

  test('shows a thank-you page instead of JSON', async () => {
    const res = await postForm({ name: 'Page Viewer', email: 'page@example.test' });
    assert.equal(res.status, 200);
    assert.match(res.text, /Thank you/);
  });

  test('silently drops a filled spam trap', async () => {
    const res = await postForm({ name: 'Bot', email: 'bot@example.test', _gotcha: 'http://spam.example' });
    assert.equal(res.status, 200);
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    assert.equal(await prisma.lead.count({ where: { email: 'bot@example.test' } }), 0);
  });

  test('redirects back only to the form\'s own site', async () => {
    const same = await postForm(
      { name: 'Back Home', email: 'home@example.test', _next: 'https://shop.example/thanks' },
      { Origin: 'https://shop.example' },
    );
    assert.equal(same.status, 303);
    assert.equal(same.location, 'https://shop.example/thanks');

    const elsewhere = await postForm(
      { name: 'Phish Target', email: 'phish@example.test', _next: 'https://evil.example/login' },
      { Origin: 'https://shop.example' },
    );
    assert.equal(elsewhere.status, 200, 'no open redirect');
  });

  test('caps oversized fields', async () => {
    await postForm({ name: 'N'.repeat(5000), email: 'long@example.test' });
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const lead = await prisma.lead.findFirst({ where: { email: 'long@example.test' } });
    assert.equal(lead.name.length, 200);
  });
});

describe('Settlement in the home currency', () => {
  test('an order already in the home currency converts 1:1 without a rate', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const order = await prisma.salesOrder.create({
      data: {
        orderNumber: 'TEST-HOME-1', customerName: 'Home Buyer', currency: 'USD',
        subtotal: 100000, total: 100000, procurementCostInr: 60000,
      },
    });
    const res = await request('GET', `/api/orders/${order.id}/settlement`, { headers: authHeader() });
    assert.equal(res.status, 200);
    assert.equal(res.body.homeCurrency, 'USD');
    assert.equal(res.body.landedInr, 100000);
    assert.equal(res.body.profitInr, 40000);
  });
});


describe('Replies always stop automation, and nothing a lead sends is dropped', () => {
  const sign = (payload) => `sha256=${crypto.createHmac('sha256', 'test-meta-app-secret')
    .update(JSON.stringify(payload)).digest('hex')}`;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 400));
  const deliver = async (messages) => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'WABA-2',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15550000000', phone_number_id: 'PNID-REPLY-FIX' },
            messages,
          },
        }],
      }],
    };
    const res = await request('POST', '/webhook/meta', { body: payload, headers: { 'X-Hub-Signature-256': sign(payload) } });
    assert.equal(res.status, 200);
    await settle();
  };

  test('someone who writes first is marked as replied', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    await deliver([{ from: '15551239901', id: 'wamid.FIRST-1', timestamp: '1790000500', type: 'text', text: { body: 'Hi, do you stock M8 bolts?' } }]);

    const lead = await prisma.lead.findFirst({ where: { mobile: { contains: '15551239901' } } });
    assert.ok(lead, 'a lead was created for the new number');
    assert.equal(lead.status, 'replied');
    assert.ok(lead.repliedAt, 'the reply time was recorded');
  });

  test('a reply from a lead WhatsApp could not reach cancels its queued follow-ups', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const lead = await prisma.lead.create({
      data: { name: 'Unreachable Buyer', mobile: '15551239902', email: 'unreachable@example.test', source: 'manual', status: 'wa_unavailable' },
    });
    const followUp = await prisma.message.create({
      data: {
        leadId: lead.id, direction: 'outbound', channel: 'email', content: 'Following up',
        status: 'queued', scheduledAt: new Date(Date.now() + 3600_000),
      },
    });

    await deliver([{ from: '15551239902', id: 'wamid.UNREACHABLE-1', timestamp: '1790000600', type: 'text', text: { body: 'Please send the catalogue' } }]);

    assert.equal((await prisma.message.findUnique({ where: { id: followUp.id } })).status, 'cancelled');
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'replied');
  });

  test('several photos sent together are all kept', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const lead = await prisma.lead.create({
      data: { name: 'Photo Buyer', mobile: '15551239903', source: 'manual', status: 'contacted' },
    });
    await deliver(['A', 'B', 'C'].map((id, i) => ({
      from: '15551239903', id: `wamid.PHOTO-${id}`, timestamp: String(1790000700 + i),
      type: 'image', image: { id: `MEDIA-${id}`, mime_type: 'image/jpeg' },
    })));

    // The webhook acknowledges before processing its media batch. Wait for
    // the observable result rather than assuming every CI runner finishes
    // three sequential downloads within the fixed delivery settling window.
    const deadline = Date.now() + 3000;
    let photos;
    do {
      photos = await prisma.message.findMany({ where: { leadId: lead.id, direction: 'inbound' } });
      if (photos.length === 3) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    } while (Date.now() < deadline);
    assert.equal(photos.length, 3);
  });
});

describe('Lead webhook matches an email-only lead once a number arrives', () => {
  test('the same person stays one lead and gains the number', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const source = await request('POST', '/api/webhooks/sources/from-preset', {
      headers: authHeader(),
      body: { presetId: 'website', name: 'Quote form' },
    });
    assert.equal(source.status, 200);
    const { webhookUrl, apiKey } = source.body;
    const post = (body) => request('POST', webhookUrl, { headers: { 'x-api-key': apiKey }, body });

    const first = await post({ name: 'Email First', email: 'emailfirst@example.test' });
    assert.equal(first.status, 200);
    assert.equal(first.body.created, true);

    const second = await post({ name: 'Email First', email: 'emailfirst@example.test', phone: '+44 7700 900456' });
    assert.equal(second.status, 200);
    assert.equal(second.body.created, false);
    assert.equal(second.body.leadId, first.body.leadId);

    const leads = await prisma.lead.findMany({ where: { email: 'emailfirst@example.test' } });
    assert.equal(leads.length, 1);
    assert.ok(!leads[0].mobile.startsWith('no-phone:'), 'the placeholder was replaced by the real number');
  });
});


describe('Approved WhatsApp template discovery', () => {
  test('uses account credentials, follows safe pagination and returns only approved templates', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const { default: cloudApi } = await import('../src/services/whatsappCloudApi.js');
    const calls = [];
    let rejectToken = false;
    const graph = http.createServer((req, res) => {
      calls.push({ url: req.url, authorization: req.headers.authorization });
      res.setHeader('Content-Type', 'application/json');
      if (rejectToken) { res.statusCode = 401; return res.end(JSON.stringify({ error: { code: 190 } })); }
      const after = new URL(req.url, 'http://localhost').searchParams.get('after');
      res.end(JSON.stringify(after ? { data: [
        { name: 'named_offer', language: 'en', category: 'MARKETING', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hi {{customer_name}}' }] },
      ] } : { data: [
        { name: 'welcome', language: 'en_US', category: 'UTILITY', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hi {{1}}, your country is {{2}}. Hello {{1}} again.' }] },
        { name: 'pending', language: 'en', category: 'MARKETING', status: 'PENDING', components: [] },
      ], paging: { next: 'https://untrusted.example.test/do-not-forward-token', cursors: { after: 'next-page' } } }));
    });
    await new Promise((resolve) => graph.listen(0, '127.0.0.1', resolve));
    const previousBase = process.env.META_GRAPH_API_BASE;
    process.env.META_GRAPH_API_BASE = `http://127.0.0.1:${graph.address().port}`;
    const account = await prisma.whatsAppAccount.create({ data: {
      name: 'Template test', provider: 'meta', metaWabaId: 'TEST-WABA',
      cloudApiPhoneId: 'TEST-PHONE', cloudApiToken: cloudApi.encryptToken('test-template-account-token'),
    } });
    try {
      const endpoint = `/api/whatsapp/accounts/${account.id}/templates`;
      assert.equal((await request('GET', endpoint)).status, 401);
      const response = await request('GET', endpoint, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.60' } });
      assert.equal(response.status, 200);
      assert.equal(response.body.accountId, account.id);
      assert.deepEqual(response.body.templates.map((t) => t.name), ['welcome', 'named_offer']);
      assert.deepEqual(response.body.templates[0].bodyVariables, ['1', '2']);
      assert.deepEqual(response.body.templates[1].bodyVariables, ['customer_name']);
      assert.equal(response.body.templates[0].category, 'UTILITY');
      assert.equal(response.body.templates[0].language, 'en_US');
      assert.equal(response.body.templates[0].status, 'APPROVED');
      assert.equal(calls.length, 2);
      assert.ok(calls.every((c) => c.authorization === 'Bearer test-template-account-token'));
      assert.ok(calls.every((c) => c.url.startsWith('/TEST-WABA/message_templates?')));
      assert.match(calls[1].url, /after=next-page/);
      assert.ok(!JSON.stringify(response.body).includes('test-template-account-token'));
      rejectToken = true;
      assert.equal((await request('GET', endpoint, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.60' } })).status, 502);
    } finally {
      if (previousBase === undefined) delete process.env.META_GRAPH_API_BASE; else process.env.META_GRAPH_API_BASE = previousBase;
      await new Promise((resolve) => graph.close(resolve));
      await prisma.whatsAppAccount.delete({ where: { id: account.id } });
    }
  });

  test('reports invalid IDs, unknown accounts and missing WABA clearly', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const meta = await prisma.whatsAppAccount.create({ data: { name: 'Missing WABA template test', provider: 'meta' } });
    try {
      const get = (id) => request('GET', `/api/whatsapp/accounts/${id}/templates`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.60' } });
      assert.equal((await get('1abc')).status, 400);
      assert.equal((await get(999999999)).status, 404);
      const missing = await get(meta.id);
      assert.equal(missing.status, 422);
      assert.match(missing.body.error, /Business Account ID/);
    } finally {
      await prisma.whatsAppAccount.deleteMany({ where: { id: { in: [meta.id] } } });
    }
  });
});

import { FORM_PAYLOADS } from './fixtures/formSubmissions.js';

describe('Form provider presets through the lead webhook', () => {
  for (const presetId of ['typeform', 'tally', 'googleforms']) {
    test(`${presetId}: authenticated submission, field mapping and replay deduplication`, async () => {
      const presets = await request('GET', '/api/webhooks/sources/presets', { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.60' } });
      assert.ok(presets.body.some((p) => p.id === presetId));
      const source = await request('POST', '/api/webhooks/sources/from-preset', { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.60' }, body: { presetId } });
      assert.equal(source.status, 200);
      const { webhookUrl, apiKey } = source.body;
      assert.equal((await request('POST', webhookUrl, { body: FORM_PAYLOADS[presetId] })).status, 401);
      const submit = () => request('POST', webhookUrl, { headers: { 'x-api-key': apiKey }, body: FORM_PAYLOADS[presetId] });
      const first = await submit();
      const second = await submit();
      assert.equal(first.status, 200);
      assert.equal(first.body.created, true);
      assert.equal(second.status, 200);
      assert.equal(second.body.created, false);
      assert.equal(second.body.leadId, first.body.leadId);
      const detail = await request('GET', `/api/leads/${first.body.leadId}`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.60' } });
      assert.equal(detail.body.email, `${presetId}@example.test`);
      assert.equal(detail.body.product, 'Need 500 units');
      assert.ok(!detail.body.mobile.startsWith('no-phone:'));
      assert.ok(detail.body.externalId.startsWith(`${presetId}:`));
      assert.equal(detail.body.consumedAt, '2026-10-01T09:30:00.000Z');
      // A replay remains the same submission even if contact answers change.
      const edited = structuredClone(FORM_PAYLOADS[presetId]);
      if (presetId === 'typeform') {
        edited.form_response.answers.find((a) => a.type === 'email').email = 'edited@example.test';
        edited.form_response.answers.find((a) => a.type === 'phone_number').phone_number = '+1 555 000 0091';
      } else if (presetId === 'tally') {
        edited.data.fields.find((f) => f.label === 'Email').value = 'edited@example.test';
        edited.data.fields.find((f) => f.label === 'Phone').value = '+1 555 000 0092';
      } else {
        edited.email = 'edited@example.test';
        edited.phone = '+1 555 000 0093';
      }
      // A replay must not overwrite a saved contact or fail because an edited
      // answer points at somebody else's existing number.
      const { default: prisma } = await import('../src/utils/prismaClient.js');
      await prisma.lead.create({ data: {
        name: 'Other form contact', source: 'manual',
        mobile: `1555000009${presetId === 'typeform' ? '1' : presetId === 'tally' ? '2' : '3'}`,
      } });
      const replay = await request('POST', webhookUrl, { headers: { 'x-api-key': apiKey }, body: edited });
      assert.equal(replay.status, 200);
      assert.equal(replay.body.leadId, first.body.leadId);
      assert.equal(replay.body.created, false);
      assert.equal((await prisma.lead.findUnique({ where: { id: first.body.leadId } })).mobile, detail.body.mobile);
    });
  }
});

test('Inbox thread exposes Meta pricing without inventing an amount', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const lead = await prisma.lead.create({ data: { name: 'Pricing Buyer', mobile: '15550000021', source: 'manual' } });
  await prisma.message.create({ data: {
    leadId: lead.id, direction: 'outbound', channel: 'whatsapp', content: 'Test pricing', status: 'sent',
    pricingCategory: 'marketing', pricingType: 'regular', billable: true,
  } });
  const response = await request('GET', `/api/inbox/threads/${lead.id}`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.60' } });
  assert.equal(response.status, 200);
  const message = response.body.messages.find((m) => m.content === 'Test pricing');
  assert.equal(message.pricingCategory, 'marketing');
  assert.equal(message.pricingType, 'regular');
  assert.equal(message.billable, true);
});

describe('Campaign schedule API', () => {
  test('requires manager review for both launch paths and invalidates an audience swap with an unchanged count', async t => {
    const scheduleRequest = (method, url, options = {}) => request(method, url, { ...options, headers: { ...options.headers, 'X-Forwarded-For': '192.0.2.182' } });
    const { default: db } = await import('../src/utils/prismaClient.js');
    const { signToken } = await import('../src/auth/rbac.js');
    const user = await db.user.create({ data: { name: 'Schedule viewer', email: 'schedule-viewer@example.test', role: 'viewer', passwordHash: 'fixture' } });
    const lead = await db.lead.create({ data: { name: 'Schedule fixture', mobile: '15550001998', email: 'schedule-fixture@example.test' } });
    const replacement = await db.lead.create({ data: { name: 'Schedule replacement', mobile: '15550001997', email: 'replacement@example.test' } });
    const campaign = await db.campaign.create({ data: { name: 'Schedule fixture', messageTemplate: 'Hello', channel: 'email' } });
    await db.campaignLead.create({ data: { campaignId: campaign.id, leadId: lead.id } });
    const url = `/api/campaigns/${campaign.id}/schedule`;
    const startUrl = `/api/campaigns/${campaign.id}/start`;
    const snapshot = async () => {
      const response = await scheduleRequest('GET', `/api/campaigns/${campaign.id}/leads?launchReview=1`, { headers: authHeader() });
      assert.equal(response.status, 200);
      return response.body.launchReview;
    };
    const scheduledAt = new Date(Date.now() + 86400000);
    scheduledAt.setUTCHours(12, 0, 0, 0);
    const body = { scheduledAt: scheduledAt.toISOString(), timezone: 'UTC' };
    const { default: config } = await import('../src/config.js');
    const old = { ...config.businessHours };
    config.businessHours = { start: 0, end: 24, timezone: 'UTC' };
    try {
      assert.equal((await scheduleRequest('POST', url, { body })).status, 401);
      const viewer = { Authorization: `Bearer ${signToken(user)}` };
      assert.equal((await scheduleRequest('POST', url, { body, headers: viewer })).status, 403);
      assert.equal((await scheduleRequest('DELETE', url, { headers: viewer })).status, 403);
      assert.equal((await scheduleRequest('POST', url, { body, headers: authHeader() })).status, 409);
      assert.equal((await scheduleRequest('POST', startUrl, { headers: authHeader() })).status, 409);
      const original = await snapshot();
      assert.equal(original.recipientCount, 1);
      await db.campaignLead.updateMany({ where: { campaignId: campaign.id }, data: { leadId: replacement.id } });
      assert.equal((await scheduleRequest('POST', url, { body: { ...body, reviewToken: original.token }, headers: authHeader() })).status, 409);
      assert.equal((await scheduleRequest('POST', startUrl, { body: { reviewToken: original.token }, headers: authHeader() })).status, 409);
      const scheduled = await scheduleRequest('POST', url, { body: { ...body, reviewToken: (await snapshot()).token }, headers: authHeader() });
      assert.equal(scheduled.status, 200);
      assert.equal(scheduled.body.status, 'scheduled');
      assert.equal(scheduled.body.scheduleTimezone, 'UTC');
      assert.equal(await db.message.count({ where: { campaignId: campaign.id } }), 0);
      assert.equal((await scheduleRequest('POST', `/api/campaigns/${campaign.id}/start`, { headers: authHeader() })).status, 409);
      await db.lead.update({ where: { id: replacement.id }, data: { email: 'changed-after-approval@example.test' } });
      await db.campaign.update({ where: { id: campaign.id }, data: { scheduledAt: new Date(Date.now() - 1000) } });
      const { default: scheduler } = await import('../src/services/campaignScheduler.js');
      await scheduler.processDue();
      const held = await db.campaign.findUnique({ where: { id: campaign.id } });
      assert.equal(held.status, 'paused');
      assert.match(held.scheduleError, /scheduled audience changed/);
      assert.equal(await db.message.count({ where: { campaignId: campaign.id } }), 0);
      assert.equal((await scheduleRequest('POST', url, { body: { ...body, reviewToken: (await snapshot()).token }, headers: authHeader() })).status, 200);
      assert.equal((await scheduleRequest('DELETE', url, { headers: authHeader() })).status, 200);
      assert.equal((await db.campaign.findUnique({ where: { id: campaign.id } })).status, 'draft');
      assert.equal((await scheduleRequest('POST', url, { body: { scheduledAt: 'invalid', timezone: 'UTC' }, headers: authHeader() })).status, 400);
      const { default: engine } = await import('../src/services/campaignEngine.js');
      const execute = t.mock.method(engine, '_executeCampaign', async () => {});
      assert.equal((await scheduleRequest('POST', startUrl, { body: { reviewToken: (await snapshot()).token }, headers: authHeader() })).status, 200);
      assert.equal(execute.mock.callCount(), 1);
    } finally {
      config.businessHours = old;
      await db.campaignLead.deleteMany({ where: { campaignId: campaign.id } });
      await db.campaign.delete({ where: { id: campaign.id } });
      await db.lead.delete({ where: { id: lead.id } });
      await db.lead.delete({ where: { id: replacement.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });
});

test('workspace outreach pause persists, holds due work without retries and audits the operator action', async () => {
  const { default: db } = await import('../src/utils/prismaClient.js');
  const { default: followup } = await import('../src/services/followup.js');
  const { default: email } = await import('../src/services/emailService.js');
  const { default: imessage } = await import('../src/services/imessage.js');
  const { default: fresh } = await import('../src/services/freshLeadOutreach.js');
  const { default: scheduler } = await import('../src/services/campaignScheduler.js');
  const lead = await db.lead.create({ data: {
    name: 'Paused outreach fixture', mobile: '12025550191', email: 'pause-fixture@example.test', telegramPeer: 'pause_fixture',
  } });
  const campaign = await db.campaign.create({ data: {
    name: 'Paused scheduled fixture', messageTemplate: 'Fixture', status: 'scheduled',
    scheduledAt: new Date(), scheduleTimezone: 'UTC',
  } });
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.214' };
  try {
    await db.message.createMany({ data: ['whatsapp', 'email', 'imessage'].map(channel => ({
      leadId: lead.id, channel, direction: 'outbound', status: 'queued', scheduledAt: new Date(0), content: 'Fixture',
    })) });
    const pause = await request('POST', '/api/system/pause', { headers });
    assert.equal(pause.status, 200);
    assert.deepEqual(pause.body, { sendingPaused: true });
    assert.equal((await db.systemConfig.findUnique({ where: { key: 'sending_paused' } })).value, 'true');
    assert.deepEqual((await request('GET', '/api/system/outreach', { headers })).body, { sendingPaused: true });
    const ids = (await db.message.findMany({ where: { leadId: lead.id }, select: { id: true } })).map(row => row.id);
    await followup.processQueue({ messageIds: ids });
    await email.processEmailQueue({ messageIds: ids });
    await imessage.processQueue({ messageIds: ids });
    assert.equal((await fresh.queue(lead, { channels: ['telegram'] })).telegram, 'paused');
    await scheduler.processDue();
    assert.equal(await db.message.count({ where: { leadId: lead.id, status: 'queued', retryCount: 0 } }), 3);
    assert.equal((await db.campaign.findUnique({ where: { id: campaign.id } })).status, 'scheduled');
    assert.deepEqual((await request('POST', '/api/system/resume', { headers })).body, { sendingPaused: false });
    const events = await db.activityLog.findMany({ where: { type: 'outreach_pause_changed' }, orderBy: { id: 'asc' } });
    assert.deepEqual(events.map(row => JSON.parse(row.meta)), [
      { actorId: 'mcp-service', sendingPaused: true }, { actorId: 'mcp-service', sendingPaused: false },
    ]);
  } finally {
    await db.systemConfig.deleteMany({ where: { key: { in: ['sending_paused', 'runtime.queue.campaigns.last_scan_at'] } } });
    await db.activityLog.deleteMany({ where: { type: 'outreach_pause_changed' } });
    await db.campaign.delete({ where: { id: campaign.id } });
    await db.lead.delete({ where: { id: lead.id } });
  }
});

describe('Account dashboard layouts', () => {
  const layoutRequest = (method, url, options = {}) => request(method, url, { ...options, headers: { ...options.headers, 'X-Forwarded-For': '192.0.2.10' } });
  test('requires authentication and keeps pages and accounts isolated', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const { signToken } = await import('../src/auth/rbac.js');
    const { defaultDashboardLayout } = await import('../shared/dashboardLayout.js');
    const users = await Promise.all(['a', 'b'].map((suffix) => prisma.user.create({ data: { name: `Layout ${suffix}`, email: `layout-${suffix}@example.test`, passwordHash: 'not-a-password', role: 'viewer' } })));
    const headers = users.map((user) => ({ Authorization: `Bearer ${signToken(user)}` }));
    try {
      assert.equal((await layoutRequest('GET', '/api/dashboard/preferences/analytics')).status, 401);
      const initial = await layoutRequest('GET', '/api/dashboard/preferences/analytics', { headers: headers[0] });
      assert.equal(initial.status, 200);
      assert.equal(initial.body.revision, 0);
      const layout = defaultDashboardLayout('analytics');
      layout.widgets.reverse();
      layout.widgets[0].width = 1;
      layout.widgets[0].visible = false;
      const save = await layoutRequest('PUT', '/api/dashboard/preferences/analytics', { headers: headers[0], body: { layout, revision: 0, ownerKey: 'forged-user' } });
      assert.equal(save.status, 200);
      assert.equal(save.body.revision, 1);
      assert.deepEqual((await layoutRequest('GET', '/api/dashboard/preferences/analytics', { headers: headers[0] })).body.layout, layout);
      assert.equal((await layoutRequest('GET', '/api/dashboard/preferences/analytics', { headers: headers[1] })).body.revision, 0);
      assert.equal((await layoutRequest('GET', '/api/dashboard/preferences/overview', { headers: headers[0] })).body.revision, 0);
      assert.equal((await layoutRequest('PUT', '/api/dashboard/preferences/analytics', { headers: headers[0], body: { layout, revision: 0 } })).status, 409);
      assert.equal((await layoutRequest('PUT', '/api/dashboard/preferences/analytics', { headers: headers[0], body: { layout, revision: 99 } })).status, 409);
      assert.equal((await layoutRequest('PUT', '/api/dashboard/preferences/analytics', { headers: headers[0], body: { layout: { version: 1, widgets: [] }, revision: 1 } })).status, 400);
      assert.equal((await layoutRequest('GET', '/api/dashboard/preferences/unknown', { headers: headers[0] })).status, 404);
      const reset = await layoutRequest('PUT', '/api/dashboard/preferences/analytics', { headers: headers[0], body: { layout: defaultDashboardLayout('analytics'), revision: 1 } });
      assert.equal(reset.body.revision, 2);
      assert.deepEqual(reset.body.layout, initial.body.layout);
      const concurrent = await Promise.all([1, 2].map((width) => {
        const next = defaultDashboardLayout('analytics');
        next.widgets[0].width = width;
        return layoutRequest('PUT', '/api/dashboard/preferences/analytics', { headers: headers[0], body: { layout: next, revision: 2 } });
      }));
      assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);

    } finally {
      await prisma.dashboardPreference.deleteMany({});
      await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    }
  });
});

describe('Analytics selected periods', () => {
  const periodRequest = (method, url, options = {}) => request(method, url, { ...options, headers: { ...options.headers, 'X-Forwarded-For': '192.0.2.11' } });
  test('filters distributions, team cohorts, funnel and campaigns by the selected calendar period', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const user = await prisma.user.create({ data: { name: 'Period tester', email: 'period-tester@example.test', passwordHash: 'not-a-password', role: 'agent' } });
    const now = new Date();
    const leadIds = [];
    const campaignIds = [];
    try {
      for (const [index, age] of [3, 20, -2].entries()) {
        const date = new Date(now.getTime() - age * 86400000);
        const lead = await prisma.lead.create({ data: { name: `Period ${index}`, mobile: `no-phone:period-${index}`, source: 'manual', country: 'Test Period Country', assignedToId: user.id, consumedAt: date, createdAt: date, status: 'closed', score: 80, leadTier: 'HOT' } });
        leadIds.push(lead.id);
        const campaign = await prisma.campaign.create({ data: { name: `Period campaign ${index}`, channel: 'email', messageTemplate: 'Test message', createdAt: date } });
        campaignIds.push(campaign.id);
      }
      const distribution = await periodRequest('GET', '/api/analytics/distributions?days=14&tzOffset=0', { headers: authHeader() });
      assert.equal(distribution.status, 200);
      assert.equal(distribution.body.countryDist.find((row) => row.country === 'Test Period Country')._count.id, 1);
      const thirty = await periodRequest('GET', '/api/analytics/distributions?days=30&tzOffset=0', { headers: authHeader() });
      assert.equal(thirty.body.countryDist.find((row) => row.country === 'Test Period Country')._count.id, 2);
      const team = await periodRequest('GET', '/api/analytics/team?days=14&tzOffset=0', { headers: authHeader() });
      assert.equal(team.body.find((row) => row.id === user.id).leadsAssigned, 1);
      const allTeam = await periodRequest('GET', '/api/analytics/team', { headers: authHeader() });
      assert.equal(allTeam.body.find((row) => row.id === user.id).leadsAssigned, 3);
      const funnel = await periodRequest('GET', '/api/analytics/funnel?range=14d&country=Test%20Period%20Country&tzOffset=0', { headers: authHeader() });
      assert.equal(funnel.status, 200);
      assert.equal(funnel.body.total, 1);
      const roi = await periodRequest('GET', '/api/analytics/campaign-roi?range=14d&tzOffset=0', { headers: authHeader() });
      assert.equal(roi.status, 200);
      assert.deepEqual(roi.body.campaigns.filter((row) => campaignIds.includes(row.id)).map((row) => row.id), [campaignIds[0]]);
      const { signToken } = await import('../src/auth/rbac.js');
      assert.equal((await periodRequest('GET', '/api/analytics/team?days=14', { headers: { Authorization: `Bearer ${signToken(user)}` } })).status, 403);
    } finally {
      await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
      await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});

// Phone queues must not lose older replies behind the default 50-row page.
test('Inbox filters before pagination and returns stable queue totals', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const ids = [];
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.71' };
  try {
    for (let i = 0; i < 54; i++) {
      const old = i < 2;
      const date = new Date(old ? '2020-01-01T00:00:00Z' : '2026-01-01T00:00:00Z');
      const lead = await prisma.lead.create({ data: { name: `Mobile Queue Fixture ${i}`, mobile: `no-phone:mobile-queue-${i}`, source: 'manual', status: 'contacted', updatedAt: date, lastMessageAt: date, messages: { create: { direction: old ? 'inbound' : 'outbound', channel: 'email', status: 'sent', content: 'Queue fixture', createdAt: date } } } });
      ids.push(lead.id);
    }
    const first = await request('GET', '/api/inbox/threads?search=Mobile%20Queue%20Fixture&state=needs_reply&limit=1', { headers });
    assert.equal(first.status, 200);
    assert.equal(first.body.total, 2);
    assert.equal(first.body.pages, 2);
    assert.equal(first.body.needsReply, 2);
    assert.equal(first.body.threads.length, 1);
    const second = await request('GET', '/api/inbox/threads?search=Mobile%20Queue%20Fixture&state=needs_reply&limit=1&page=2', { headers });
    assert.equal(second.body.threads.length, 1);
    assert.notEqual(first.body.threads[0].leadId, second.body.threads[0].leadId);
    const all = await request('GET', '/api/inbox/threads?search=Mobile%20Queue%20Fixture&limit=25', { headers });
    assert.equal(all.body.total, 54);
    assert.equal(all.body.pages, 3);
    assert.equal(all.body.needsReply, 2);
    assert.equal(all.body.threads.length, 25);
    assert.equal(all.body.threads[0].leadId, ids[53]);
  } finally {
    await prisma.message.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.lead.deleteMany({ where: { id: { in: ids } } });
  }
});

test('Inbox reports successful outreach channels across the full history of each visible lead', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.73' };
  const earlier = new Date('2026-01-03T10:00:00Z');
  const latest = new Date('2026-01-04T10:00:00Z');
  const later = new Date('2026-01-05T10:00:00Z');
  const message = (channel, status, date, extra = {}) =>
    ({ channel, status, sentAt: date, createdAt: date, direction: 'outbound', content: 'Outreach fixture', ...extra });
  const createLead = (suffix, messages) => prisma.lead.create({
    data: { name: `Outreach Badge Fixture ${suffix}`, mobile: `no-phone:outreach-badges-${suffix}`, source: 'manual', messages: { create: messages } },
  });
  const ids = [];
  try {
    const mixed = await createLead('Mixed', [
      message('whatsapp', 'read', earlier),
      message('whatsapp', 'sent', earlier),
      message('email', 'sent', latest),
      message('imessage', 'queued', later),
      message('telegram', 'unconfirmed', later),
    ]);
    ids.push(mixed.id);
    const single = await createLead('Single', [
      message('whatsapp', 'delivered', earlier),
      message('email', 'failed', latest),
      message('email', 'sent', latest, { providerDeliveryStatus: 'soft_bounce' }),
      message('email', 'permanently_failed', latest, { providerDeliveryStatus: 'hard_bounce' }),
      message('telegram', 'delivered', later, { direction: 'inbound' }),
    ]);
    ids.push(single.id);
    const inboundOnly = await createLead('Inbound', [message('email', 'synced', earlier, { direction: 'inbound' })]);
    ids.push(inboundOnly.id);

    const all = await request('GET', '/api/inbox/threads?search=Outreach%20Badge%20Fixture', { headers });
    assert.equal(all.status, 200);
    assert.deepEqual(all.body.threads.find(thread => thread.leadId === mixed.id).outreachChannels, ['email', 'whatsapp']);
    assert.deepEqual(all.body.threads.find(thread => thread.leadId === single.id).outreachChannels, ['whatsapp']);
    assert.deepEqual(all.body.threads.find(thread => thread.leadId === inboundOnly.id).outreachChannels, []);
    const filtered = await request('GET', `/api/inbox/threads?channel=email&leadId=${mixed.id}&limit=1`, { headers });
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.threads[0].channel, 'email');
    assert.deepEqual(filtered.body.threads[0].outreachChannels, ['email', 'whatsapp']);

    const detail = await request('GET', `/api/inbox/threads/${mixed.id}`, { headers });
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.outreachChannels, ['email', 'whatsapp']);
  } finally {
    await prisma.lead.deleteMany({ where: { id: { in: ids } } });
  }
});

test('Mobile follow-ups validate edits, enforce lead ownership, and paginate workspace tasks', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { signToken } = await import('../src/auth/rbac.js');
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.72' };
  const leads = await Promise.all([1, 2].map(i => prisma.lead.create({ data: { name: `Mobile Task ${i}`, mobile: `no-phone:mobile-task-${i}`, source: 'manual' } })));
  const viewer = await prisma.user.create({ data: { name: 'Mobile Viewer', email: 'mobile-viewer@example.test', passwordHash: 'not-a-password', role: 'viewer' } });
  try {
    const leadId = leads[0].id;
    for (const body of [{ title: '  ' }, { title: 1 }, { title: 'Call buyer', dueAt: 'bad date' }]) {
      assert.equal((await request('POST', `/api/leads/${leadId}/tasks`, { headers, body })).status, 400);
    }
    const created = await request('POST', `/api/leads/${leadId}/tasks`, { headers, body: { title: ' Call buyer ', dueAt: '2020-01-01T12:00:00Z' } });
    assert.equal(created.status, 200);
    assert.equal(created.body.title, 'Call buyer');
    const taskId = created.body.id;
    assert.equal((await request('PATCH', `/api/leads/${leadId}/tasks/${taskId}`, { headers, body: { done: 'false' } })).status, 400);
    assert.equal((await request('PATCH', `/api/leads/${leadId}/tasks/${taskId}`, { headers, body: { title: '' } })).status, 400);
    assert.equal((await request('PATCH', `/api/leads/${leads[1].id}/tasks/${taskId}`, { headers, body: { done: true } })).status, 404);
    assert.equal((await request('DELETE', `/api/leads/${leads[1].id}/tasks/${taskId}`, { headers })).status, 404);
    const note = await request('POST', `/api/leads/${leadId}/notes`, { headers, body: { content: 'Customer asked to follow up' } });
    assert.equal((await request('DELETE', `/api/leads/${leads[1].id}/notes/${note.body.id}`, { headers })).status, 404);
    const readonlyHeaders = { Authorization: `Bearer ${signToken(viewer)}`, 'X-Forwarded-For': '192.0.2.73' };
    assert.equal((await request('GET', '/api/tasks', { headers: readonlyHeaders })).status, 200);
    assert.equal((await request('PATCH', `/api/leads/${leadId}/tasks/${taskId}`, { headers: readonlyHeaders, body: { done: true } })).status, 403);
    const queue = await request('GET', '/api/tasks?limit=1', { headers });
    assert.equal(queue.body.tasks.length, 1);
    assert.ok(queue.body.total >= 1);
    assert.ok(queue.body.overdueCount >= 1);
    assert.equal(queue.body.pages, queue.body.total);
    assert.equal((await request('PATCH', `/api/leads/${leadId}/tasks/${taskId}`, { headers, body: { done: true, dueAt: null } })).status, 200);
    const pending = await request('GET', `/api/leads/${leadId}/tasks`, { headers });
    assert.equal(pending.body[0].done, true);
    assert.equal(pending.body[0].dueAt, null);
    assert.equal((await request('DELETE', `/api/leads/${leadId}/notes/${note.body.id}`, { headers })).status, 200);
  } finally {
    const ids = leads.map(lead => lead.id);
    await prisma.leadTask.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.leadNote.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.lead.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.delete({ where: { id: viewer.id } });
  }
});

test('follow-up endpoints reject malformed IDs and missing parents without server errors', async () => {
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.74' };
  assert.equal((await request('GET', '/api/leads/1junk/tasks', { headers })).status, 400);
  assert.equal((await request('PATCH', '/api/leads/1/tasks/-2', { headers, body: { done: true } })).status, 400);
  assert.equal((await request('POST', '/api/leads/2147483647/tasks', { headers, body: { title: 'Missing buyer' } })).status, 404);
  assert.equal((await request('POST', '/api/leads/2147483647/notes', { headers, body: { content: 'Missing buyer' } })).status, 404);
  assert.equal((await request('POST', '/api/leads/1/notes', { headers, body: { content: 'Test', type: 'invented' } })).status, 400);
});

test('inbox detail and queue agree on the latest message when timestamps tie', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const date = new Date('2026-01-01T12:00:00Z');
  const lead = await prisma.lead.create({ data: { name: 'Queue Tie Fixture', source: 'manual', mobile: 'no-phone:queue-tie', lastMessageAt: new Date('2020-01-01T00:00:00Z') } });
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.75' };
  try {
    await prisma.message.create({ data: { leadId: lead.id, channel: 'email', direction: 'inbound', content: 'Question', status: 'delivered', createdAt: date } });
    const sent = await prisma.message.create({ data: { leadId: lead.id, channel: 'email', direction: 'outbound', content: 'Answered', status: 'sent', createdAt: date } });
    const queue = await request('GET', '/api/inbox/threads?search=Queue%20Tie%20Fixture', { headers });
    assert.equal(queue.body.threads[0].replyNeeded, false);
    assert.equal(queue.body.threads[0].lastMessageAt, date.toISOString());
    const detail = await request('GET', `/api/inbox/threads/${lead.id}`, { headers });
    assert.equal(detail.body.messages.at(-1).id, sent.id);
    assert.equal(detail.body.replyNeeded, false);
  } finally {
    await prisma.message.deleteMany({ where: { leadId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
  }
});

test('Gmail inbox settings use the existing admin account update without changing delivery or exposing passwords', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { signToken } = await import('../src/auth/rbac.js');
  const account = await prisma.emailAccount.create({ data: { name: 'Reply Inbox Fixture', email: 'sender@example.test', provider: 'brevo', smtpHost: 'api.brevo.com', smtpPort: 443, smtpUser: 'sender@example.test', smtpPass: 'fake-existing-smtp-secret' } });
  const manager = await prisma.user.create({ data: { name: 'Email Manager Fixture', email: 'email-manager@example.test', passwordHash: 'not-a-password', role: 'manager' } });
  const password = 'abcdefghijklmnop';
  const body = { imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true, imapUser: 'reply-inbox@example.test', imapPass: password };
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.76' };
  try {
    assert.equal((await request('PATCH', `/api/email/accounts/${account.id}`, { body, headers: { 'X-Forwarded-For': '192.0.2.77' } })).status, 401);
    assert.equal((await request('PATCH', `/api/email/accounts/${account.id}`, { body, headers: { Authorization: `Bearer ${signToken(manager)}`, 'X-Forwarded-For': '192.0.2.78' } })).status, 403);
    const saved = await request('PATCH', `/api/email/accounts/${account.id}`, { body, headers });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.account.imapHost, 'imap.gmail.com');
    assert.equal(saved.body.account.imapUser, body.imapUser);
    assert.equal(saved.body.account.hasImapPass, true);
    assert.equal(saved.body.account.imapPass, undefined);
    assert.equal(saved.body.account.smtpPass, undefined);
    const stored = await prisma.emailAccount.findUnique({ where: { id: account.id } });
    assert.match(stored.imapPass, /^enc:v1:/);
    assert.notEqual(stored.imapPass, password);
    assert.equal(stored.provider, 'brevo');
    assert.equal(stored.smtpPass, account.smtpPass);
    assert.equal(stored.smtpHost, account.smtpHost);
    assert.equal(stored.smtpPort, account.smtpPort);
    const listed = await request('GET', `/api/email/accounts/${account.id}`, { headers });
    assert.equal(listed.body.imapPass, undefined);
    assert.equal(listed.body.smtpPass, undefined);
  } finally {
    await prisma.emailAccount.delete({ where: { id: account.id } });
    await prisma.user.delete({ where: { id: manager.id } });
  }
});

test('deployed Gmail routes validate access, save atomically and serialize shared inbox syncs', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { default: email } = await import('../src/services/emailService.js');
  const originalClient = email._createImapClient;
  const originalRead = email._readRepliesForAccount;
  const accounts = await Promise.all([1, 2].map(i => prisma.emailAccount.create({ data: { name: `Gmail Route Fixture ${i}`, email: `gmail-route-${i}@example.test`, provider: 'brevo', smtpHost: 'api.brevo.com', smtpPort: 443, smtpUser: 'fake', smtpPass: 'fake-existing-key' } })));
  const ids = accounts.map(a => a.id);
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.81' };
  const body = { accountIds: ids, user: 'shared@example.test', appPassword: 'abcd efgh ijkl mnop' };
  let active = 0;
  let maximum = 0;
  try {
    email._createImapClient = () => ({ connect: async () => {}, getMailboxLock: async () => ({ release() {} }), logout: async () => {} });
    assert.equal((await request('POST', `/api/email/accounts/${ids[0]}/gmail-inbox`, { body, headers: { 'X-Forwarded-For': '192.0.2.82' } })).status, 401);
    assert.equal((await request('POST', `/api/email/accounts/${ids[0]}/gmail-inbox`, { headers, body: { ...body, accountIds: 'bad' } })).status, 400);
    assert.equal((await request('POST', `/api/email/accounts/${ids[0]}/gmail-inbox`, { headers, body: { ...body, appPassword: 'bad' } })).status, 400);
    const connected = await request('POST', `/api/email/accounts/${ids[0]}/gmail-inbox`, { headers, body });
    assert.equal(connected.status, 200);
    assert.equal(JSON.stringify(connected.body).includes('abcdefghijklmnop'), false);
    for (const id of ids) {
      const saved = await prisma.emailAccount.findUnique({ where: { id } });
      assert.equal(saved.imapUser, body.user);
      assert.match(saved.imapPass, /^enc:v1:/);
      assert.equal(saved.smtpPass, 'fake-existing-key');
    }
    email._readRepliesForAccount = async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 15)); active--; return 1; };
    const synced = await Promise.all(ids.map(id => request('POST', `/api/email/accounts/${id}/sync-inbox`, { headers })));
    assert.ok(synced.every(r => r.status === 200 && r.body.replies === 1));
    assert.equal(maximum, 1, 'shared mailbox operations must not race and import duplicate replies');
    email._createImapClient = () => ({ connect: async () => { throw new Error('provider private credential failure'); }, logout: async () => {} });
    const failed = await request('POST', `/api/email/accounts/${ids[0]}/gmail-inbox`, { headers, body: { ...body, user: 'changed@example.test' } });
    assert.equal(failed.status, 400);
    assert.equal(JSON.stringify(failed.body).includes('private credential'), false);
    assert.equal((await prisma.emailAccount.findUnique({ where: { id: ids[0] } })).imapUser, body.user, 'failed validation preserves existing inbox settings');
  } finally {
    email._createImapClient = originalClient;
    email._readRepliesForAccount = originalRead;
    await prisma.emailAccount.deleteMany({ where: { id: { in: ids } } });
  }
});

test('Brevo campaign recording handles nullable tenant keys and retries without duplicate counters', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { default: campaigns } = await import('../src/services/brevoMarketingCampaigns.js');
  const lead = await prisma.lead.create({ data: { name: 'Campaign Retry Fixture', mobile: 'no-phone:campaign-retry', email: 'campaign-retry@example.test' } });
  const account = await prisma.emailAccount.create({ data: { name: 'Campaign Retry Sender', email: 'campaign-sender@example.test', provider: 'brevo', smtpHost: 'api.brevo.com', smtpUser: 'fake', smtpPass: 'fake-key' } });
  try {
    const input = { date: '2026-10-12', account, leads: [lead], template: { id: 123, name: 'Fixture template', subject: 'Hello {{name}}', htmlBody: '<p>{{name}}</p>', textBody: 'Hello {{name}}' }, state: { campaignId: 123, sentAt: '2026-10-12T01:00:00Z' } };
    await campaigns._recordAcceptedCampaign(input);
    const original = await prisma.message.findFirst({ where: { leadId: lead.id } });
    await prisma.message.update({ where: { id: original.id }, data: { status: 'read', providerDeliveryStatus: 'opened' } });
    await prisma.lead.update({ where: { id: lead.id }, data: { emailOptOut: true, emailStatus: 'unsubscribed' } });
    await campaigns._recordAcceptedCampaign(input);
    assert.equal(await prisma.message.count({ where: { leadId: lead.id } }), 1);
    assert.equal((await prisma.message.findUnique({ where: { id: original.id } })).status, 'read');
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).emailStatus, 'unsubscribed');
    assert.equal((await prisma.emailAccount.findUnique({ where: { id: account.id } })).sentToday, 1);
  } finally {
    await prisma.message.deleteMany({ where: { leadId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
    await prisma.emailAccount.delete({ where: { id: account.id } });
    await prisma.systemConfig.deleteMany({ where: { key: { startsWith: `email.daily.marketing.batch.2026-10-12.${account.id}` } } });
  }
});

test('IMAP MIME replies retain the sending account, cancel follow-ups and retry partial bodies once', async () => {
  const { Readable } = await import('node:stream');
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { default: email } = await import('../src/services/emailService.js');
  const { default: scorer } = await import('../src/services/leadScorer.js');
  const originalClient = email._createImapClient;
  const originalScore = scorer.calculateScore;
  const lead = await prisma.lead.create({ data: { name: 'MIME Reply Fixture', mobile: 'no-phone:mime-reply', email: 'mime-reply@example.test', status: 'contacted' } });
  const accounts = await Promise.all([1, 2].map(i => prisma.emailAccount.create({ data: { name: `MIME Sender ${i}`, email: `mime-sender-${i}@example.test`, smtpHost: 'smtp.example.test', smtpUser: 'fake', smtpPass: 'fake-key', imapHost: 'imap.example.test' } })));
  const outgoingId = '<fixture-original@example.test>';
  const incomingId = '<fixture-reply@example.test>';
  const headers = `Message-ID: ${incomingId}\r\nIn-Reply-To: ${outgoingId}\r\n`;
  const before = new Date('2026-10-01T01:00:00Z');
  let brokenDownload = true;
  try {
    scorer.calculateScore = async () => {};
    await prisma.emailAccount.update({ where: { id: accounts[0].id }, data: { lastSyncAt: before } });
    await prisma.message.createMany({ data: [
      { leadId: lead.id, emailAccountId: accounts[1].id, channel: 'email', direction: 'outbound', status: 'sent', content: 'Original', emailMessageId: outgoingId },
      { leadId: lead.id, channel: 'email', direction: 'outbound', status: 'queued', content: 'Follow-up' },
    ] });
    email._createImapClient = () => ({
      on() {}, connect: async () => {}, logout: async () => {},
      getMailboxLock: async () => ({ release() {} }),
      search: async () => [101],
      fetchAll: async () => [{ uid: 101, headers: Buffer.from(headers), envelope: { from: [{ address: lead.email }], subject: 'Fixture reply' } }],
      download: async (uid, part, options) => {
        assert.equal(uid, 101); assert.equal(options.uid, true);
        if (brokenDownload) throw new Error('fixture download failed');
        return { content: Readable.from([Buffer.from(`${headers}MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('Thanks, please send the quotation.').toString('base64')}`)]) };
      },
    });
    await assert.rejects(email.syncInbox(accounts[0].id), /could not be processed/);
    let inbound = await prisma.message.findFirst({ where: { leadId: lead.id, direction: 'inbound' } });
    assert.equal(inbound.status, 'partial');
    assert.equal(inbound.emailInboundKind, 'pending');
    assert.equal(inbound.emailReplyProcessedAt, null);
    assert.equal(inbound.emailAccountId, accounts[1].id);
    assert.equal((await prisma.emailAccount.findUnique({ where: { id: accounts[0].id } })).lastSyncAt.getTime(), before.getTime());
    assert.equal(await prisma.message.count({ where: { leadId: lead.id, status: 'queued' } }), 0);
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'contacted');
    brokenDownload = false;
    await email.syncInbox(accounts[0].id);
    await email.syncInbox(accounts[0].id);
    inbound = await prisma.message.findUnique({ where: { id: inbound.id } });
    assert.equal(inbound.status, 'delivered');
    assert.equal(inbound.emailInboundKind, 'human');
    assert.ok(inbound.emailReplyProcessedAt);
    assert.equal(inbound.content, 'Thanks, please send the quotation.');
    assert.equal(await prisma.message.count({ where: { leadId: lead.id, direction: 'inbound' } }), 1);
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'replied', 'body recovery must not count as another reply');
  } finally {
    email._createImapClient = originalClient;
    scorer.calculateScore = originalScore;
    await prisma.message.deleteMany({ where: { leadId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
    await prisma.emailAccount.deleteMany({ where: { id: { in: accounts.map(a => a.id) } } });
  }
});


test('Inbox queue stays complete above SQLite relation parameter limits', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const prefix = 'Large Inbox Fixture';
  const total = 1205;
  const ids = [];
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.91' };
  try {
    for (let start = 0; start < total; start += 100) {
      await prisma.lead.createMany({ data: Array.from({ length: Math.min(100, total - start) }, (_, offset) => ({ name: `${prefix} ${start + offset}`, mobile: `no-phone:large-inbox-${start + offset}`, status: 'contacted' })) });
    }
    ids.push(...(await prisma.lead.findMany({ where: { name: { startsWith: prefix } }, select: { id: true }, orderBy: { id: 'asc' } })).map(lead => lead.id));
    for (let start = 0; start < ids.length; start += 100) {
      await prisma.message.createMany({ data: ids.slice(start, start + 100).map((leadId, offset) => ({ leadId, channel: 'email', direction: start + offset < 2 ? 'inbound' : 'outbound', status: 'delivered', content: 'Large inbox fixture', createdAt: new Date(start + offset < 2 ? '2020-01-01T00:00:00Z' : '2026-01-01T00:00:00Z') })) });
    }
    const query = '/api/inbox/threads?search=Large%20Inbox%20Fixture&channel=email';
    const all = await request('GET', `${query}&limit=25`, { headers });
    assert.equal(all.status, 200);
    assert.equal(all.body.total, total);
    assert.equal(all.body.threads.length, 25);
    assert.equal(all.body.threads[0].leadId, ids.at(-1));
    for (const page of [1, 2]) {
      const replies = await request('GET', `${query}&state=needs_reply&limit=1&page=${page}`, { headers });
      assert.equal(replies.status, 200);
      assert.equal(replies.body.total, 2);
      assert.equal(replies.body.needsReply, 2);
      assert.equal(replies.body.threads[0].leadId, ids[2 - page]);
    }
  } finally {
    for (let start = 0; start < ids.length; start += 100) {
      const chunk = ids.slice(start, start + 100);
      await prisma.message.deleteMany({ where: { leadId: { in: chunk } } });
      await prisma.lead.deleteMany({ where: { id: { in: chunk } } });
    }
  }
});

// These tests replace the provider transport with an in-memory fake. They can
// exercise a real launch through HTTP without contacting or emailing anyone.
describe('Reviewed manual email batches', () => {
  test('status and preview are read-only; the reviewed audience uses four senders and the saved template', async t => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const { default: email } = await import('../src/services/emailService.js');
    const { default: scheduler } = await import('../src/services/dailyEmailScheduler.js');
    const { default: campaigns } = await import('../src/services/brevoMarketingCampaigns.js');
    const batchRequest = (method, route, options = {}) => request(method, route, { ...options, headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.200' } });
    const priorConfig = await prisma.systemConfig.findMany({ where: { key: { startsWith: 'email.daily.' } } });
    const oldUrl = process.env.BREVO_WEBHOOK_PUBLIC_URL;
    const oldSecret = process.env.BREVO_WEBHOOK_SECRET;
    const senders = [];
    const calls = [];
    let remoteId = 7000;
    let beforeSend = null;
    const template = await prisma.emailTemplate.create({ data: { name: 'Batch Fixture Brand', subject: 'Fixture {{name}}', htmlBody: '<h1>Fixture Brand</h1><p>{{product}} to {{country}}</p><a href="{{ unsubscribe }}">Unsubscribe</a>', textBody: 'Fixture {{name}}: {{product}} to {{country}}' } });
    try {
      await prisma.systemConfig.deleteMany({ where: { key: { startsWith: 'email.daily.' } } });
      process.env.BREVO_WEBHOOK_PUBLIC_URL = 'https://api.example.test';
      process.env.BREVO_WEBHOOK_SECRET = 'fake-batch-webhook-secret';
      for (let i = 0; i < 4; i++) senders.push(await prisma.emailAccount.create({ data: {
        name: `Batch fixture sender ${i}`, email: `batch-sender-${i}@example.test`, provider: 'brevo',
        smtpHost: 'api.brevo.com', smtpUser: 'fake', smtpPass: 'fake-not-a-credential', status: 'verified',
        dailyLimit: 50, sentToday: 50, lastResetAt: new Date('2020-01-01'),
      } }));
      await prisma.lead.createMany({ data: Array.from({ length: 200 }, (_, i) => ({
        name: `Batch fixture buyer ${i}`, mobile: `no-phone:batch-fixture-${i}`, email: `batch-buyer-${i}@example.test`,
        country: ['USA', 'UK', 'Australia'][i % 3], product: 'Fixture product', status: 'new', score: 1000,
        emailMarketingConsent: true,
      })) });
      await prisma.lead.createMany({ data: [
        { name: 'Outside scope', mobile: 'no-phone:batch-fixture-outside', email: 'batch-outside@example.test', country: 'Canada', score: 9000, emailMarketingConsent: true },
        { name: 'Missing country', mobile: 'no-phone:batch-fixture-unknown', email: 'batch-unknown@example.test', country: '', score: 9000, emailMarketingConsent: true },
        { name: 'Opt-out duplicate', mobile: 'no-phone:batch-fixture-optout', email: 'BATCH-DUP@example.test', country: 'USA', score: 9000, emailMarketingConsent: true, emailOptOut: true },
        { name: 'Other duplicate row', mobile: 'no-phone:batch-fixture-duplicate', email: 'batch-dup@example.test', country: 'USA', score: 9000, emailMarketingConsent: true },
      ] });
      const save = await batchRequest('PATCH', '/api/email/daily/settings', { headers: authHeader(), body: {
        enabled: true, marketingEnabled: true, countries: ['US', 'UK', 'AU'], templateId: template.id,
        senderIds: senders.map(sender => sender.id), perSenderQuota: 50, batchSize: 200, brevoFolderId: 123,
      } });
      assert.equal(save.status, 200, JSON.stringify(save.body));
      assert.equal(save.body.launchMode, 'manual');
      assert.deepEqual(save.body.senderIds, senders.map(sender => sender.id));
      const snapshot = async () => JSON.stringify(await Promise.all([
        prisma.systemConfig.findMany({ orderBy: { key: 'asc' } }),
        prisma.emailTemplate.findMany({ orderBy: { id: 'asc' } }),
        prisma.emailAccount.findMany({ orderBy: { id: 'asc' } }),
        prisma.message.count(),
      ]));
      await batchRequest('PATCH', '/api/email/daily/settings', { body: { marketingEnabled: false } });
      const before = await snapshot();
      await batchRequest('GET', '/api/email/daily/status', { headers: authHeader() });
      await batchRequest('GET', '/api/email/daily/status', { headers: authHeader() });
      t.mock.method(email, 'brevoRequestForAccount', async (accountId, route, options = {}) => {
        calls.push({ accountId, route, options });
        if (route === '/contacts/attributes') return { attributes: [{ name: 'PRODUCT' }, { name: 'COUNTRY' }, { name: 'COMPANY' }] };
        if (route === '/emailCampaigns' && beforeSend) await beforeSend();
        return { id: ++remoteId };
      });
      const preview = await batchRequest('POST', '/api/email/daily/preview', { headers: authHeader() });
      assert.equal(preview.status, 200);
      assert.equal(preview.body.skipped, undefined, JSON.stringify(preview.body));
      assert.equal(preview.body.count, 200);
      assert.equal(new Set(preview.body.items.map(item => item.email.toLowerCase())).size, 200);
      assert.ok(preview.body.items.every(item => item.email.startsWith('batch-buyer-')));
      for (const sender of senders) assert.equal(preview.body.items.filter(item => item.accountId === sender.id).length, 50);
      assert.equal(await snapshot(), before, 'GETs and preview must not write defaults, templates, counters or messages');
      assert.equal(calls.length, 0, 'preview must not create any provider resources');
      const invalid = await batchRequest('PATCH', '/api/email/daily/settings', { headers: authHeader(), body: { enabled: false, batchSize: 0 } });
      assert.equal(invalid.status, 400);
      assert.equal(await snapshot(), before, 'invalid settings must not partially change launch gates');
      const disarmed = await batchRequest('POST', '/api/email/daily/queue', { body: { previewHash: preview.body.previewHash } });
      assert.equal(disarmed.body.reason, 'brevo_marketing_campaigns_disabled');
      assert.equal(calls.length, 0);
      await batchRequest('PATCH', '/api/email/daily/settings', { body: { marketingEnabled: true } });
      await prisma.emailTemplate.update({ where: { id: template.id }, data: { subject: 'Edited fixture {{name}}' } });
      const stale = await batchRequest('POST', '/api/email/daily/queue', { headers: authHeader(), body: { previewHash: preview.body.previewHash } });
      assert.equal(stale.body.reason, 'preview_changed');
      assert.equal(calls.length, 0);
      const fresh = await batchRequest('POST', '/api/email/daily/preview', { headers: authHeader() });
      const launched = await batchRequest('POST', '/api/email/daily/queue', { headers: authHeader(), body: { previewHash: fresh.body.previewHash } });
      assert.equal(launched.body.queued, 200, JSON.stringify(launched.body));
      assert.equal(calls.filter(call => call.route.endsWith('/sendNow')).length, 4);
      for (const call of calls.filter(call => call.route === '/emailCampaigns')) {
        assert.match(call.options.body.htmlContent, /Fixture Brand/);
        assert.match(call.options.body.subject, /Edited fixture/);
        assert.match(call.options.body.htmlContent, /contact.PRODUCT/);
      }
      const recorded = await prisma.message.findMany({ where: { lead: { mobile: { startsWith: 'no-phone:batch-fixture-' } } } });
      assert.equal(recorded.length, 200);
      assert.ok(recorded.every(row => !row.content.includes('{{name}}') && row.templateVariant.startsWith(`saved-email-template:${template.id}:`)));
      const after = await batchRequest('POST', '/api/email/daily/queue', { headers: authHeader(), body: { previewHash: fresh.body.previewHash } });
      assert.equal(after.body.reason, 'already_ran_today');
      assert.equal(calls.filter(call => call.route.endsWith('/sendNow')).length, 4);
      assert.deepEqual(await scheduler.run(), { skipped: true, reason: 'explicit_launch_required' });

      // Simulate an opt-out after provider draft creation but before sendNow.
      await batchRequest('PATCH', '/api/email/daily/settings', { headers: authHeader(), body: { batchSize: 1, senderIds: [senders[0].id] } });
      await prisma.lead.createMany({ data: Array.from({ length: 3005 }, (_, i) => ({
        name: 'Previously contacted duplicate fixture', mobile: `no-phone:batch-fixture-page-${i}`,
        email: 'batch-buyer-0@example.test', country: 'US', score: 3000, emailMarketingConsent: true,
      })) });
      const late = await prisma.lead.create({ data: { name: 'Late opt-out fixture', mobile: 'no-phone:batch-fixture-late', email: 'batch-late@example.test', country: 'UK', score: 2000, emailMarketingConsent: true } });
      await prisma.systemConfig.deleteMany({ where: { key: { in: ['email.daily.last_run_date', ...senders.map(sender => `email.daily.marketing.batch.${fresh.body.date}.${sender.id}`)] } } });
      await prisma.emailAccount.updateMany({ where: { id: { in: senders.map(sender => sender.id) } }, data: { sentToday: 0 } });
      const next = await batchRequest('POST', '/api/email/daily/preview', { headers: authHeader() });
      assert.equal(next.body.count, 1, JSON.stringify(next.body));
      assert.equal(next.body.items[0].leadId, late.id, 'selection must scan beyond 3,000 previously contacted duplicate rows');
      const sendsBefore = calls.filter(call => call.route.endsWith('/sendNow')).length;
      beforeSend = async () => prisma.lead.update({ where: { id: late.id }, data: { emailOptOut: true } });
      const blocked = await batchRequest('POST', '/api/email/daily/queue', { headers: authHeader(), body: { previewHash: next.body.previewHash } });
      assert.equal(blocked.body.queued, 0, JSON.stringify(blocked.body));
      assert.equal(calls.filter(call => call.route.endsWith('/sendNow')).length, sendsBefore);
      assert.equal(await prisma.message.count({ where: { leadId: late.id } }), 0);
      // A gate or global pause changed during draft creation must win over
      // the earlier preview, even when the recipient itself is still eligible.
      beforeSend = null;
      const clearDraft = () => prisma.systemConfig.deleteMany({ where: { key: `email.daily.marketing.batch.${fresh.body.date}.${senders[0].id}` } });
      await clearDraft();
      await prisma.lead.update({ where: { id: late.id }, data: { emailOptOut: false } });
      let retry = await batchRequest('POST', '/api/email/daily/preview');
      beforeSend = async () => prisma.systemConfig.update({ where: { key: 'email.daily.marketing.enabled' }, data: { value: 'false' } });
      const disarmedLate = await batchRequest('POST', '/api/email/daily/queue', { body: { previewHash: retry.body.previewHash } });
      assert.equal(disarmedLate.body.queued, 0);
      assert.equal(calls.filter(call => call.route.endsWith('/sendNow')).length, sendsBefore);
      await clearDraft();
      await prisma.systemConfig.update({ where: { key: 'email.daily.marketing.enabled' }, data: { value: 'true' } });
      retry = await batchRequest('POST', '/api/email/daily/preview');
      const pauseBefore = await prisma.systemConfig.findUnique({ where: { key: 'sending_paused' } });
      beforeSend = async () => prisma.systemConfig.upsert({ where: { key: 'sending_paused' }, update: { value: 'true' }, create: { key: 'sending_paused', value: 'true' } });
      try {
        const pausedLate = await batchRequest('POST', '/api/email/daily/queue', { body: { previewHash: retry.body.previewHash } });
        assert.equal(pausedLate.body.queued, 0);
        assert.equal(calls.filter(call => call.route.endsWith('/sendNow')).length, sendsBefore);
      } finally {
        if (pauseBefore) await prisma.systemConfig.update({ where: { key: 'sending_paused' }, data: { value: pauseBefore.value } });
        else await prisma.systemConfig.deleteMany({ where: { key: 'sending_paused' } });
      }
      assert.equal((await campaigns.getStatus({ senderIds: [senders[0].id, 2147483647] })).configuredBrevoSenders, false);
    } finally {
      if (oldUrl === undefined) delete process.env.BREVO_WEBHOOK_PUBLIC_URL; else process.env.BREVO_WEBHOOK_PUBLIC_URL = oldUrl;
      if (oldSecret === undefined) delete process.env.BREVO_WEBHOOK_SECRET; else process.env.BREVO_WEBHOOK_SECRET = oldSecret;
      await prisma.message.deleteMany({ where: { lead: { mobile: { startsWith: 'no-phone:batch-fixture-' } } } });
      await prisma.lead.deleteMany({ where: { mobile: { startsWith: 'no-phone:batch-fixture-' } } });
      await prisma.emailAccount.deleteMany({ where: { id: { in: senders.map(sender => sender.id) } } });
      await prisma.emailTemplate.delete({ where: { id: template.id } });
      await prisma.systemConfig.deleteMany({ where: { key: { startsWith: 'email.daily.' } } });
      await prisma.systemConfig.createMany({ data: priorConfig });
    }
  });

  test('startup, wake and manual runtime recovery never invoke the marketing selector', async t => {
    const { default: scheduler } = await import('../src/services/dailyEmailScheduler.js');
    const { default: recovery } = await import('../src/services/recoveryCoordinator.js');
    const { default: fresh } = await import('../src/services/freshLeadOutreach.js');
    const { default: followup } = await import('../src/services/followup.js');
    const { default: email } = await import('../src/services/emailService.js');
    const { default: config } = await import('../src/config.js');
    t.mock.method(fresh, 'reconcileRecent', async () => ({ errors: 0 }));
    t.mock.method(followup, 'recoverStuckMessages', async () => ({ count: 0 }));
    t.mock.method(email, 'syncAllReplies', async () => []);
    const run = t.mock.method(scheduler, 'run', () => { throw new Error('Recovery must not select marketing recipients'); });
    const previous = config.recovery.enabled;
    config.recovery.enabled = true;
    try {
      const startup = await recovery.start();
      assert.equal(startup.summary.dailyEmail.reason, 'explicit_launch_required');
      for (const reason of ['wake', 'manual']) {
        const result = await recovery.runRecovery({ reason });
        assert.equal(result.status, 'ok');
        assert.equal(result.dailyEmail.reason, 'explicit_launch_required');
      }
      assert.equal(run.mock.callCount(), 0);
    } finally { await recovery.stop(); config.recovery.enabled = previous; }
  });
});

// Receipt fixtures have no transports or provider credentials. Every callback
// uses the public HTTP endpoint and the real transaction/migration path.
let deliveryFixtureSequence = 0;
async function withDeliveryFixture(run) {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const sequence = ++deliveryFixtureSequence;
  const recipient = `receipt-${sequence}@example.test`;
  const priorSecret = process.env.BREVO_WEBHOOK_SECRET;
  process.env.BREVO_WEBHOOK_SECRET = 'fake-delivery-webhook-secret';
  const lead = await prisma.lead.create({ data: { name: 'Delivery Receipt Fixture', email: recipient, mobile: `no-phone:delivery-${sequence}`, emailStatus: 'sent' } });
  const accounts = await Promise.all([1, 2].map(i => prisma.emailAccount.create({ data: {
    name: `Receipt Sender ${i}`, email: `receipt-sender-${sequence}-${i}@example.test`, provider: 'brevo',
    smtpHost: 'api.brevo.com', smtpUser: 'fake', smtpPass: 'fake-no-network-credential',
  } })));
  const createMessage = (data = {}) => prisma.message.create({ data: {
    leadId: lead.id, emailAccountId: accounts[0].id, channel: 'email', direction: 'outbound',
    content: 'Fictional receipt test', status: 'sent', sentAt: new Date('2026-10-16T01:00:00Z'),
    emailRecipient: recipient, providerCampaignId: '71', ...data,
  } });
  const post = (body, query = '', headers = { 'x-brevo-webhook-secret': 'fake-delivery-webhook-secret' }) => request('POST', `/webhook/brevo${query}`, { body, headers });
  const event = (name, data = {}) => ({ id: 99, event: name, email: recipient, camp_id: 71, ts_event: 1792112400, ...data });
  try { await run({ prisma, lead, accounts, recipient, createMessage, post, event }); }
  finally {
    if (priorSecret === undefined) delete process.env.BREVO_WEBHOOK_SECRET; else process.env.BREVO_WEBHOOK_SECRET = priorSecret;
    await prisma.emailDeliveryEvent.deleteMany({ where: { recipient } });
    await prisma.lead.deleteMany({ where: { mobile: { startsWith: `no-phone:delivery-${sequence}` } } });
    await prisma.systemConfig.deleteMany({ where: { key: { in: accounts.map(account => `email.brevo.identity.${account.id}`) } } });
    await prisma.emailAccount.deleteMany({ where: { id: { in: accounts.map(account => account.id) } } });
  }
}

test('scheduled inbox email keeps the original payload and holds missing files or interrupted submissions', async t => {
  const { default: db } = await import('../src/utils/prismaClient.js');
  const { default: email, SCHEDULED_EMAIL_SUBMITTING } = await import('../src/services/emailService.js');
  const { default: followup } = await import('../src/services/followup.js');
  const { default: imessage } = await import('../src/services/imessage.js');
  const { MEDIA_DIR } = await import('../src/services/whatsappMedia.js');
  const account = await db.emailAccount.create({ data: {
    name: 'Scheduled SMTP fixture', email: 'schedule-sender@example.test', smtpHost: 'smtp.example.test',
    smtpUser: 'fixture', smtpPass: 'fixture', status: 'verified',
  } });
  const lead = await db.lead.create({ data: {
    name: 'Scheduled email fixture', mobile: '12025550138', email: 'schedule-recipient@example.test',
    assignedEmailAccountId: account.id, status: 'replied',
  } });
  const originalReply = await db.message.create({ data: {
    leadId: lead.id, channel: 'email', direction: 'inbound', status: 'received',
    content: 'Reply already in the thread', emailMessageId: '<previous-reply@example.test>',
  } });
  const filename = 'schedule-fixture-' + crypto.randomUUID() + '.txt';
  const filePath = path.join(MEDIA_DIR, filename);
  let file;
  const calls = [];
  const transport = t.mock.method(email, '_getTransport', () => ({
    async sendMail(options) {
      const sending = await db.message.findFirst({ where: { leadId: lead.id, status: 'sending' } });
      assert.equal(sending?.providerStatusReason, SCHEDULED_EMAIL_SUBMITTING);
      calls.push(options);
      return { messageId: '<schedule-fixture@example.test>' };
    },
  }));
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.239' };
  const send = body => request('POST', '/api/inbox/send', { headers, body: {
    leadId: lead.id, accountId: account.id, channel: 'email', subject: 'Fixture schedule',
    body: 'Original body', htmlBody: '<strong>Original body</strong>', cc: 'copy@example.test',
    replyToMessageId: originalReply.id, ...body,
  } });
  try {
    for (const scheduledAt of ['invalid time', new Date(0).toISOString()]) {
      assert.equal((await send({ scheduledAt })).status, 400);
    }
    const date = new Date(Date.now() + 60 * 60_000).toISOString();
    assert.equal((await send({ channel: 'whatsapp', scheduledAt: date })).status, 400);
    assert.equal(await db.message.count({ where: { leadId: lead.id, direction: 'outbound' } }), 0);
    assert.equal(transport.mock.callCount(), 0);

    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    fs.writeFileSync(filePath, 'Synthetic attachment', { flag: 'wx' });
    file = await db.mediaFile.create({ data: {
      filename, originalName: 'estimate.txt', mimeType: 'text/plain', size: 20, path: 'data/media/' + filename,
    } });
    const body = { scheduledAt: date, attachmentIds: [file.id], clientMessageId: 'scheduled-email-fixture-001' };
    const [first, repeated] = await Promise.all([send(body), send(body)]);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(repeated.status, 200, JSON.stringify(repeated.body));
    const id = first.body.message.id;
    assert.equal(repeated.body.message.id, id);
    assert.equal(await db.message.count({ where: { leadId: lead.id, direction: 'outbound' } }), 1);
    assert.equal(transport.mock.callCount(), 0);
    const queued = await request('GET', '/api/inbox/threads/' + lead.id, { headers });
    assert.deepEqual(queued.body.scheduledEmails.map(row => row.status), ['queued']);
    assert.equal(queued.body.messages.length, 1, 'queued email does not count as a conversation message yet');

    const changeUrl = messageId => `/api/inbox/threads/${lead.id}/scheduled-emails/${messageId}`;
    const moved = new Date(Date.now() + 120 * 60_000).toISOString();
    assert.equal((await request('PATCH', changeUrl(id), { headers, body: { scheduledAt: moved } })).status, 200);
    await email.processEmailQueue({ messageIds: [id] });
    assert.equal(calls.length, 0, 'a rescheduled message is held until the new time');
    assert.equal((await db.message.findUnique({ where: { id } })).scheduledAt.toISOString(), moved);

    await db.message.update({ where: { id }, data: { scheduledAt: new Date(0) } });
    await email.processEmailQueue({ messageIds: [id] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].html, '<strong>Original body</strong>');
    assert.equal(calls[0].cc, 'copy@example.test');
    assert.equal(calls[0].headers['In-Reply-To'], '<previous-reply@example.test>');
    assert.deepEqual(calls[0].attachments, [{ filename: 'estimate.txt', path: filePath, contentType: 'text/plain' }]);
    assert.equal((await db.message.findUnique({ where: { id } })).status, 'sent');

    const missing = await send({ ...body, clientMessageId: 'scheduled-email-fixture-002' });
    assert.equal(missing.status, 200, JSON.stringify(missing.body));
    const missingId = missing.body.message.id;
    fs.unlinkSync(filePath);
    await db.message.update({ where: { id: missingId }, data: { scheduledAt: new Date(0) } });
    await email.processEmailQueue({ messageIds: [missingId] });
    assert.equal(calls.length, 1);
    const failed = await db.message.findUnique({ where: { id: missingId } });
    assert.equal(failed.status, 'permanently_failed');
    assert.equal(failed.providerStatusReason, 'email_attachment_unavailable');

    t.mock.method(imessage, 'recoverStuckMessages', async () => ({ count: 0, requeued: 0 }));
    const stale = await send({ scheduledAt: date, clientMessageId: 'scheduled-email-fixture-003' });
    assert.equal(stale.status, 200, JSON.stringify(stale.body));
    const staleId = stale.body.message.id;
    await db.message.update({ where: { id: staleId }, data: {
      status: 'sending', providerStatusReason: SCHEDULED_EMAIL_SUBMITTING,
      scheduledAt: new Date(0), updatedAt: new Date(0),
    } });
    await followup.recoverStuckMessages();
    assert.equal((await db.message.findUnique({ where: { id: staleId } })).status, 'unconfirmed');
    const review = await request('GET', '/api/inbox/threads/' + lead.id, { headers });
    assert.ok(review.body.scheduledEmails.some(row => row.id === staleId && row.status === 'unconfirmed'));
    await email.processEmailQueue({ messageIds: [staleId] });
    assert.equal(calls.length, 1, 'an interrupted provider submission is never sent again automatically');

    const lateReply = await send({ scheduledAt: date, clientMessageId: 'scheduled-email-fixture-004' });
    assert.equal(lateReply.status, 200);
    const cancelledId = lateReply.body.message.id;
    await db.message.create({ data: {
      leadId: lead.id, channel: 'email', direction: 'inbound', status: 'received',
      content: 'New reply after scheduling',
    } });
    await db.message.update({ where: { id: cancelledId }, data: { scheduledAt: new Date(0) } });
    await email.processEmailQueue({ messageIds: [cancelledId] });
    assert.equal((await db.message.findUnique({ where: { id: cancelledId } })).status, 'cancelled');
    assert.equal(calls.length, 1, 'a newer reply stops the scheduled send');
    assert.equal((await request('DELETE', changeUrl(id), { headers })).status, 409, 'accepted mail cannot be cancelled');
    const toCancel = await send({ scheduledAt: date, clientMessageId: 'scheduled-email-fixture-005' });
    assert.equal(toCancel.status, 200);
    const cancelId = toCancel.body.message.id;
    assert.equal((await request('DELETE', changeUrl(cancelId), { headers })).status, 200);
    assert.equal((await db.message.findUnique({ where: { id: cancelId } })).providerStatusReason, 'scheduled_email_cancelled_by_operator');
    assert.equal((await request('PATCH', changeUrl(cancelId), { headers, body: { scheduledAt: moved } })).status, 409);
  } finally {
    fs.rmSync(filePath, { force: true });
    if (file) await db.mediaFile.delete({ where: { id: file.id } });
    await db.lead.delete({ where: { id: lead.id } });
    await db.emailAccount.delete({ where: { id: account.id } });
  }
});

describe('Brevo delivery receipts', () => {
  test('only the identified campaign recipient changes among many historical emails', async () => withDeliveryFixture(async ({ prisma, lead, createMessage, post, event }) => {
    const target = await createMessage();
    for (let i = 0; i < 24; i++) await createMessage({ providerCampaignId: String(100 + i) });
    await createMessage({ direction: 'inbound', status: 'delivered' });
    assert.equal((await post(event('delivered'))).status, 200);
    assert.equal((await prisma.message.findUnique({ where: { id: target.id } })).status, 'delivered');
    assert.equal(await prisma.message.count({ where: { leadId: lead.id, status: 'sent' } }), 24);
    assert.equal(await prisma.emailDeliveryEvent.count({ where: { messageId: target.id, outcome: 'applied' } }), 1);
    await post(event('delivered', { id: 100, delivery_attempt: 2 }));
    assert.equal(await prisma.emailDeliveryEvent.count({ where: { messageId: target.id } }), 1, 'webhook registration IDs are not event identities');
    await post(event('delivered', { camp_id: undefined }));
    assert.equal(await prisma.message.count({ where: { leadId: lead.id, status: 'sent' } }), 24);
    assert.ok(await prisma.emailDeliveryEvent.findFirst({ where: { reason: 'provider_identity_missing' } }));
  }));

  test('colliding campaign IDs are quarantined unless sender account scope resolves them', async () => withDeliveryFixture(async ({ prisma, accounts, createMessage, post, event }) => {
    const first = await createMessage();
    const second = await createMessage({ emailAccountId: accounts[1].id });
    await post(event('delivered'));
    assert.equal((await prisma.message.findUnique({ where: { id: first.id } })).status, 'sent');
    assert.equal((await prisma.message.findUnique({ where: { id: second.id } })).status, 'sent');
    assert.ok(await prisma.emailDeliveryEvent.findFirst({ where: { reason: 'ambiguous_provider_identity' } }));
    assert.equal((await post(event('delivered'), `?accountId=${accounts[0].id}`)).status, 200);
    assert.equal((await prisma.message.findUnique({ where: { id: first.id } })).status, 'delivered');
    assert.equal((await prisma.message.findUnique({ where: { id: second.id } })).status, 'sent');
    for (const id of ['1abc', '0', '999999999999999999999', '2147483647']) assert.equal((await post(event('delivered'), `?accountId=${id}`)).status, 400);
  }));

  test('SMTP IDs match with or without brackets and use the send-time recipient after lead edits', async () => withDeliveryFixture(async ({ prisma, lead, recipient, createMessage, post, event }) => {
    const smtp = await createMessage({ providerCampaignId: null, emailMessageId: '<receipt-smtp@example.test>' });
    const provider = await createMessage({ providerCampaignId: null, providerMessageId: 'receipt-provider@example.test' });
    await prisma.lead.update({ where: { id: lead.id }, data: { email: 'edited@example.test' } });
    await post(event('delivered', { camp_id: undefined, 'message-id': 'receipt-smtp@example.test' }));
    await post(event('delivered', { camp_id: undefined, 'message-id': '<receipt-provider@example.test>' }));
    assert.equal((await prisma.message.findUnique({ where: { id: smtp.id } })).status, 'delivered');
    assert.equal((await prisma.message.findUnique({ where: { id: provider.id } })).status, 'delivered');
    await post(event('opened', { email: 'edited@example.test', camp_id: undefined, 'message-id': 'receipt-smtp@example.test' }));
    assert.equal((await prisma.message.findUnique({ where: { id: smtp.id } })).status, 'delivered');
    await prisma.emailDeliveryEvent.deleteMany({ where: { recipient: 'edited@example.test' } });
    assert.equal((await prisma.message.findUnique({ where: { id: smtp.id } })).emailRecipient, recipient);
  }));

  test('verified shared Brevo identities scope multiple senders and account changes hold historical receipts', async () => withDeliveryFixture(async ({ prisma, accounts, createMessage, post, event }) => {
    const { default: delivery } = await import('../src/services/brevoDeliveryEvents.js');
    const identity = crypto.createHash('sha256').update('fixture-brevo-account@example.test').digest('hex');
    await prisma.systemConfig.createMany({ data: accounts.map(account => ({
      key: `email.brevo.identity.${account.id}`,
      value: JSON.stringify({ identity, credential: crypto.createHash('sha256').update(account.smtpPass).digest('hex') }),
    })) });
    const message = await createMessage({ emailAccountId: accounts[1].id });
    await post(event('delivered'), `?accountId=${accounts[0].id}`);
    assert.equal((await prisma.message.findUnique({ where: { id: message.id } })).status, 'delivered');
    await post(event('delivered', { camp_id: 73 }), `?accountId=${accounts[0].id}`);
    const early = await createMessage({ providerCampaignId: '73' });
    await prisma.emailAccount.update({ where: { id: accounts[0].id }, data: { smtpPass: 'fake-changed-provider-account' } });
    await delivery.replayUnmatched();
    assert.equal((await prisma.message.findUnique({ where: { id: early.id } })).status, 'sent');
    await prisma.emailAccount.update({ where: { id: accounts[0].id }, data: { smtpPass: accounts[0].smtpPass } });
    assert.equal((await delivery.replayUnmatched()).applied, 1);
  }));

  test('simultaneous retries commit one receipt and a subsequent retry is harmless', async () => withDeliveryFixture(async ({ prisma, createMessage, post, event }) => {
    const message = await createMessage();
    const attempts = await Promise.all([post(event('delivered')), post(event('delivered'))]);
    assert.ok(attempts.every(result => [200, 503].includes(result.status)));
    assert.ok(attempts.some(result => result.status === 200));
    assert.equal((await post(event('delivered'))).status, 200);
    assert.equal(await prisma.emailDeliveryEvent.count({ where: { messageId: message.id } }), 1);
    assert.equal((await prisma.message.findUnique({ where: { id: message.id } })).status, 'delivered');
  }));

  test('temporary bounces do not suppress recipients or enter the send queue; late receipts do not downgrade delivery', async () => withDeliveryFixture(async ({ prisma, lead, createMessage, post, event }) => {
    const message = await createMessage();
    await post(event('softBounce'));
    let stored = await prisma.message.findUnique({ where: { id: message.id } });
    assert.equal(stored.status, 'sent');
    assert.equal(stored.providerDeliveryStatus, 'soft_bounce');
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).emailStatus, 'sent');
    assert.equal((await request('POST', `/api/messages/${message.id}/requeue`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.201' } })).status, 409);
    await post(event('delivered', { ts_event: 1792112401 }));
    await post(event('opened', { ts_event: 1792112402 }));
    await post(event('delivered', { ts_event: 1792112403 }));
    await post(event('hard_bounce', { ts_event: 1792112399 }));
    stored = await prisma.message.findUnique({ where: { id: message.id } });
    assert.equal(stored.status, 'read');
    assert.equal(stored.providerDeliveryStatus, 'opened');
    assert.equal(stored.providerDeliveryAt.toISOString(), new Date(1792112402000).toISOString());
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).emailStatus, 'sent');
  }));

  test('hard bounces suppress duplicate addresses while blocked sender events do not; marketing campaigns cannot be requeued as SMTP', async () => withDeliveryFixture(async ({ prisma, lead, recipient, createMessage, post, event }) => {
    const duplicate = await prisma.lead.create({ data: { name: 'Duplicate Receipt Fixture', email: ` ${recipient.toUpperCase()} `, mobile: `${lead.mobile}-duplicate` } });
    const hard = await createMessage();
    const blocked = await createMessage({ providerCampaignId: '72' });
    await post(event('blocked', { camp_id: 72 }));
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).emailStatus, 'sent');
    assert.equal((await prisma.message.findUnique({ where: { id: blocked.id } })).status, 'permanently_failed');
    await post(event('hard_bounce'));
    assert.equal((await prisma.message.findUnique({ where: { id: hard.id } })).status, 'permanently_failed');
    assert.equal((await prisma.lead.findUnique({ where: { id: duplicate.id } })).emailStatus, 'bounced');
    const retry = await request('POST', `/api/messages/${hard.id}/requeue`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.201' } });
    assert.equal(retry.status, 409);
    assert.match(retry.body.error, /marketing campaign/i);
    await createMessage({ status: 'permanently_failed', sentAt: null, providerCampaignId: null, content: 'Unsent fixture' });
    const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.201' };
    const queue = await request('GET', `/api/inbox/threads?leadId=${lead.id}&channel=email`, { headers });
    assert.equal(queue.body.total, 1);
    assert.equal(queue.body.threads[0].messageCount, 2);
    const detail = await request('GET', `/api/inbox/threads/${lead.id}`, { headers });
    assert.equal(detail.body.messages.length, 2, 'provider failures remain visible; unsent drafts do not');
    assert.equal(detail.body.messages[0].providerDeliveryStatus, 'hard_bounce');
    const history = await request('GET', `/api/inbox/threads/${lead.id}/messages`, { headers });
    assert.equal(history.body.length, 2);
  }));

  test('legacy marketing requeues are held before any SMTP transport is invoked', async t => withDeliveryFixture(async ({ prisma, createMessage }) => {
    const { default: email } = await import('../src/services/emailService.js');
    const send = t.mock.method(email, 'sendEmail', () => { throw new Error('Marketing campaigns cannot enter SMTP retry'); });
    const queued = await createMessage({ status: 'queued', scheduledAt: new Date(0) });
    await email.processEmailQueue({ messageIds: [queued.id] });
    assert.equal(send.mock.callCount(), 0);
    const message = await prisma.message.findUnique({ where: { id: queued.id } });
    assert.equal(message.status, 'permanently_failed');
    assert.equal(message.providerStatusReason, 'marketing_campaign_requires_review');
  }));

  test('marketing unsubscribe and transactional unsubscribed suppress all duplicate contacts and cancel queued email', async () => withDeliveryFixture(async ({ prisma, lead, recipient, createMessage, post, event }) => {
    const duplicate = await prisma.lead.create({ data: { name: 'Opt-out Duplicate Fixture', email: ` ${recipient.toUpperCase()} `, mobile: `${lead.mobile}-duplicate` } });
    const queued = await createMessage({ leadId: duplicate.id, providerCampaignId: null, status: 'queued' });
    await post(event('unsubscribe', { camp_id: undefined }));
    for (const id of [lead.id, duplicate.id]) {
      const contact = await prisma.lead.findUnique({ where: { id } });
      assert.equal(contact.emailOptOut, true);
      assert.equal(contact.emailStatus, 'unsubscribed');
      assert.ok(contact.emailOptOutAt);
    }
    assert.equal((await prisma.message.findUnique({ where: { id: queued.id } })).status, 'cancelled');
    const firstOptOut = (await prisma.lead.findUnique({ where: { id: lead.id } })).emailOptOutAt;
    await post(event('spam', { ts_event: 1792112401 }));
    await post(event('unsubscribed', { ts_event: 1792112402 }));
    const stored = await prisma.lead.findUnique({ where: { id: lead.id } });
    assert.equal(stored.emailStatus, 'complained');
    assert.equal(+stored.emailOptOutAt, +firstOptOut);
  }));

  test('proxy opens and unrelated provider events remain distinct from human engagement', async () => withDeliveryFixture(async ({ prisma, createMessage, post, event }) => {
    const message = await createMessage();
    await post(event('proxy_open'));
    await post(event('contact_updated'));
    assert.equal((await prisma.message.findUnique({ where: { id: message.id } })).status, 'sent');
    assert.ok(await prisma.emailDeliveryEvent.findFirst({ where: { messageId: message.id, reason: 'proxy_open_not_human_engagement' } }));
  }));

  test('early callbacks are durable and maintenance replay links them after send recording', async t => withDeliveryFixture(async ({ prisma, createMessage, post, event }) => {
    const { default: delivery } = await import('../src/services/brevoDeliveryEvents.js');
    const { default: fresh } = await import('../src/services/freshLeadOutreach.js');
    const { default: followup } = await import('../src/services/followup.js');
    const { default: recovery } = await import('../src/services/recoveryCoordinator.js');
    t.mock.method(fresh, 'reconcileRecent', async () => ({ errors: 0 }));
    t.mock.method(followup, 'recoverStuckMessages', async () => ({ count: 0 }));
    await post(event('delivered'));
    const message = await createMessage();
    assert.equal((await recovery.runMaintenance()).emailDeliveryEvents.applied, 1);
    assert.equal((await prisma.message.findUnique({ where: { id: message.id } })).status, 'delivered');
    assert.equal(await prisma.emailDeliveryEvent.count({ where: { messageId: message.id } }), 1);
    assert.equal((await delivery.replayUnmatched()).applied, 0);
  }));

  test('authentication, payload validation and atomic batch rollback happen before acknowledgement', async t => withDeliveryFixture(async ({ prisma, createMessage, post, event }) => {
    const { default: delivery } = await import('../src/services/brevoDeliveryEvents.js');
    const message = await createMessage();
    assert.equal((await post(event('delivered'), '', {})).status, 401);
    assert.equal((await post(event('delivered'), '', { 'x-brevo-webhook-secret': 'wrong-secret' })).status, 401);
    assert.equal((await post([])).status, 400);
    assert.equal((await post([event('delivered'), { event: 'opened' }])).status, 400);
    assert.equal((await post(Array.from({ length: 1001 }, () => event('delivered')))).status, 400);
    const apply = delivery._apply.bind(delivery);
    const fail = t.mock.method(delivery, '_apply', async (...args) => {
      if (args[1].event === 'opened') throw new Error('Fictional transient persistence failure');
      return apply(...args);
    });
    const batch = [event('delivered'), event('opened', { ts_event: 1792112401 })];
    assert.equal((await post(batch)).status, 503);
    assert.equal((await prisma.message.findUnique({ where: { id: message.id } })).status, 'sent');
    assert.equal(await prisma.emailDeliveryEvent.count({ where: { messageId: message.id } }), 0);
    fail.mock.restore();
    assert.equal((await post(batch)).status, 200);
    assert.equal((await prisma.message.findUnique({ where: { id: message.id } })).status, 'read');
    assert.equal(await prisma.emailDeliveryEvent.count({ where: { messageId: message.id } }), 2);
    assert.equal((await post(batch)).status, 200);
    assert.equal(await prisma.emailDeliveryEvent.count({ where: { messageId: message.id } }), 2);
  }));
});

// IMAP fixtures are MIME messages delivered by an in-memory mailbox, without
// network credentials. These assertions cover ingestion through dashboard data.
describe('Inbound email classification', () => {
  test('delivery reports and automatic replies stay visible without customer engagement, notifications or reply credit', async t => {
    const { Readable } = await import('node:stream');
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const { default: email } = await import('../src/services/emailService.js');
    const { default: scorer } = await import('../src/services/leadScorer.js');
    const { default: reporting } = await import('../src/services/reportingService.js');
    const { default: activity } = await import('../src/utils/activityLog.js');
    const lead = await prisma.lead.create({ data: {
      name: 'Classification Fixture', mobile: 'no-phone:classification', email: 'classify@example.test', status: 'contacted', emailStatus: 'sent',
    } });
    const account = await prisma.emailAccount.create({ data: {
      name: 'Classification Inbox', email: 'classify-sender@example.test', smtpHost: 'smtp.example.test', smtpUser: 'fake', smtpPass: 'fake', imapHost: 'imap.example.test',
    } });
    const originalId = '<classification-original@example.test>';
    const at = new Date(Date.now() - 300000);
    const sent = await prisma.message.create({ data: { leadId: lead.id, emailAccountId: account.id, channel: 'email', direction: 'outbound', status: 'sent', content: 'Fictional quotation', sentAt: at, createdAt: at, emailMessageId: originalId, templateVariant: 'classification-fixture' } });
    const queued = await prisma.message.create({ data: { leadId: lead.id, channel: 'email', direction: 'outbound', status: 'queued', content: 'Pending follow-up' } });
    const mailbox = [];
    const add = (uid, from, extraHeaders, content) => {
      const headers = `Message-ID: <classification-${uid}@example.test>\r\nIn-Reply-To: ${originalId}\r\nFrom: ${from}\r\nTo: ${account.email}\r\nSubject: Re: Fixture quotation\r\n${extraHeaders}`;
      mailbox.push({ uid, headers: Buffer.from(headers), envelope: { from: [{ address: from }], to: [{ address: account.email }], subject: 'Re: Fixture quotation' }, internalDate: new Date(Date.now() - 60000), raw: `${headers}\r\n\r\n${content}` });
    };
    const score = t.mock.method(scorer, 'calculateScore', async () => {});
    let bodyDownloads = 0;
    t.mock.method(email, '_createImapClient', () => ({
      mailbox: { uidValidity: 123n }, on() {}, connect: async () => {}, logout: async () => {},
      getMailboxLock: async () => ({ release() {} }), search: async () => mailbox.map(msg => msg.uid),
      fetchAll: async () => mailbox,
      download: async uid => { bodyDownloads++; return { content: Readable.from([Buffer.from(mailbox.find(msg => msg.uid === uid).raw)]) }; },
    }));
    const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.202' };
    const overview = () => request('GET', '/api/stats/overview', { headers });
    const performance = () => request('GET', '/api/analytics/email-performance?range=all', { headers });
    const range = [new Date(Date.now() - 3600000), new Date(Date.now() + 3600000)];
    const baseOverview = await overview();
    const baseReport = await reporting._getPeriodMetrics(...range);
    const baseEvents = activity.getRecent(100).filter(event => event.type === 'email_reply').length;
    try {
      add(301, 'postmaster@example.test', 'Content-Type: multipart/report; report-type=delivery-status; boundary="report"', '--report\r\nContent-Type: text/plain\r\n\r\nDelivery failed for classify@example.test\r\n--report\r\nContent-Type: message/delivery-status\r\n\r\nFinal-Recipient: rfc822; classify@example.test\r\nAction: failed\r\nStatus: 5.1.1\r\n--report--');
      add(302, lead.email, 'Auto-Submitted: auto-replied\r\nContent-Type: text/plain', 'I am away. This is an automatic response.');
      assert.equal((await email.syncInbox(account.id)).replies, 0);
      await email.syncInbox(account.id);
      assert.equal(bodyDownloads, 2, 'completed receipts are not downloaded again on the overlap sync');
      const machine = await prisma.message.findMany({ where: { leadId: lead.id, direction: 'inbound' }, orderBy: { id: 'asc' } });
      assert.deepEqual(machine.map(message => message.emailInboundKind), ['delivery_report', 'automatic_reply']);
      assert.ok(machine.every(message => !message.emailReplyProcessedAt));
      const leadAfter = await prisma.lead.findUnique({ where: { id: lead.id } });
      assert.equal(leadAfter.status, 'contacted');
      assert.equal(leadAfter.repliedAt, null);
      assert.equal(leadAfter.emailStatus, 'sent');
      assert.equal((await prisma.message.findUnique({ where: { id: queued.id } })).status, 'queued');
      assert.equal(score.mock.callCount(), 0);
      assert.equal(activity.getRecent(100).filter(event => event.type === 'email_reply').length, baseEvents);
      assert.equal((await overview()).body.replied, baseOverview.body.replied);
      assert.equal((await reporting._getPeriodMetrics(...range)).repliesReceived, baseReport.repliesReceived);
      assert.equal((await performance()).body.variants.find(variant => variant.variant === 'classification-fixture').replied, 0);
      let queue = await request('GET', `/api/inbox/threads?leadId=${lead.id}&state=needs_reply`, { headers });
      assert.equal(queue.body.total, 0);
      const detail = await request('GET', `/api/inbox/threads/${lead.id}`, { headers });
      assert.equal(detail.body.messages.length, 3);
      assert.equal(detail.body.replyNeeded, false);
      // A human reply is processed once, and later automatic mail cannot hide
      // that unanswered human message from the Needs Reply queue.
      add(303, lead.email, 'Auto-Submitted: no\r\nContent-Type: text/plain', 'Please quote five boxes. I am out of office tomorrow.');
      assert.equal((await email.syncInbox(account.id)).replies, 1);
      assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'replied');
      assert.equal((await prisma.message.findUnique({ where: { id: queued.id } })).status, 'cancelled');
      assert.equal(score.mock.callCount(), 1);
      assert.equal((await overview()).body.replied, baseOverview.body.replied + 1);
      assert.equal((await reporting._getPeriodMetrics(...range)).repliesReceived, baseReport.repliesReceived + 1);
      assert.equal((await performance()).body.variants.find(variant => variant.variant === 'classification-fixture').replied, 1);
      add(304, lead.email, 'Auto-Submitted: auto-generated\r\nContent-Type: text/plain', 'Automated ticket acknowledgement');
      assert.equal((await email.syncInbox(account.id)).replies, 0);
      assert.equal(score.mock.callCount(), 1);
      assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'replied');
      queue = await request('GET', `/api/inbox/threads?leadId=${lead.id}&state=needs_reply`, { headers });
      assert.equal(queue.body.total, 1);
      assert.equal(queue.body.threads[0].replyNeeded, true);
      assert.equal((await request('GET', `/api/inbox/threads/${lead.id}`, { headers })).body.replyNeeded, true);
      assert.equal(await prisma.message.count({ where: { leadId: lead.id, direction: 'inbound' } }), 4);
      await prisma.message.createMany({ data: Array.from({ length: 20 }, (_, index) => ({
        leadId: lead.id, direction: 'inbound', channel: 'email', status: 'delivered',
        emailInboundKind: 'automatic_reply', content: 'Fictional automated acknowledgement', createdAt: new Date(Date.now() + index),
      })) });
      const feed = await request('GET', '/api/activity', { headers });
      assert.ok(feed.body.some(item => item.type === 'reply_received' && item.message.includes(lead.name)), 'automatic mail must be excluded before activity pagination');
      assert.ok(sent.id);
    } finally {
      await prisma.lead.delete({ where: { id: lead.id } });
      await prisma.emailAccount.delete({ where: { id: account.id } });
    }
  });

  test('a matched message without Message-ID is imported once across repeated syncs', async t => {
    const { Readable } = await import('node:stream');
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const { default: email } = await import('../src/services/emailService.js');
    const { default: scorer } = await import('../src/services/leadScorer.js');
    const lead = await prisma.lead.create({ data: { name: 'No ID Fixture', mobile: 'no-phone:inbound-no-id', email: 'no-id@example.test', status: 'contacted' } });
    const account = await prisma.emailAccount.create({ data: { name: 'No ID Inbox', email: 'no-id-sender@example.test', smtpHost: 'smtp.example.test', smtpUser: 'fake', smtpPass: 'fake', imapHost: 'imap.example.test' } });
    t.mock.method(scorer, 'calculateScore', async () => {});
    const header = `From: ${lead.email}\r\nTo: ${account.email}\r\nSubject: Enquiry\r\nContent-Type: text/plain`;
    t.mock.method(email, '_createImapClient', () => ({
      mailbox: { uidValidity: 456n }, on() {}, connect: async () => {}, logout: async () => {},
      getMailboxLock: async () => ({ release() {} }), search: async () => [401],
      fetchAll: async () => [{ uid: 401, headers: Buffer.from(header), envelope: { from: [{ address: lead.email }] } }],
      download: async () => ({ content: Readable.from([Buffer.from(`${header}\r\n\r\nCould you share the specification?`)]) }),
    }));
    try {
      assert.equal((await email.syncInbox(account.id)).replies, 1);
      assert.equal((await email.syncInbox(account.id)).replies, 0);
      assert.equal(await prisma.message.count({ where: { leadId: lead.id } }), 1);
      assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'replied');
      const legacy = await prisma.message.findFirst({ where: { leadId: lead.id } });
      await prisma.message.update({ where: { id: legacy.id }, data: { status: 'partial', emailInboundKind: null, emailReplyProcessedAt: null } });
      assert.equal((await email.syncInbox(account.id)).replies, 0, 'legacy partial rows already emitted their first reply');
      assert.ok((await prisma.message.findUnique({ where: { id: legacy.id } })).emailReplyProcessedAt);
    } finally {
      await prisma.lead.delete({ where: { id: lead.id } });
      await prisma.emailAccount.delete({ where: { id: account.id } });
    }
  });
});

test('lead scoring and priority triage ignore machine mail and retain the last unanswered human reply', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { default: scorer } = await import('../src/services/leadScorer.js');
  const { default: intervention } = await import('../src/services/interventionEngine.js');
  const lead = await prisma.lead.create({ data: { name: 'Scoring Classification Fixture', mobile: 'no-phone:score-classification', status: 'replied', email: 'score-classification@example.test', repliedAt: new Date() } });
  try {
    await prisma.message.create({ data: { leadId: lead.id, channel: 'email', direction: 'outbound', status: 'sent', content: 'Specification', sentAt: new Date(Date.now() - 3600000), createdAt: new Date(Date.now() - 3600000) } });
    const before = await scorer.calculateScore(lead.id);
    const content = 'Urgent order, please quote the price and shipping for 100 boxes.';
    const machine = await prisma.message.create({ data: { leadId: lead.id, channel: 'email', direction: 'inbound', status: 'delivered', content, emailInboundKind: 'automatic_reply' } });
    assert.equal(await scorer.calculateScore(lead.id), before);
    let priority = (await intervention.getPriorityInbox(100)).find(row => row.id === lead.id);
    assert.equal(priority.waitingForResponse, false);
    await prisma.message.create({ data: { leadId: lead.id, channel: 'email', direction: 'inbound', status: 'delivered', content, emailInboundKind: 'human', createdAt: new Date(Date.now() - 60000) } });
    assert.ok(await scorer.calculateScore(lead.id) > before);
    await prisma.message.update({ where: { id: machine.id }, data: { createdAt: new Date() } });
    priority = (await intervention.getPriorityInbox(100)).find(row => row.id === lead.id);
    assert.equal(priority.waitingForResponse, true);
    assert.equal(priority.messages[0].content, content);
  } finally { await prisma.lead.delete({ where: { id: lead.id } }); }
});


test('Clerk team membership route is mounted and keeps local sign-in behavior explicit', async () => {
  // Use a distinct documented fixture client so this small route check does
  // not consume the main suite's 100-request production rate-limit bucket.
  const headers = { ...authHeader(), 'X-Forwarded-For': '198.51.100.113' };
  const denied = await request('GET', '/api/team/members', {headers: { 'X-Forwarded-For': '198.51.100.113' }});
  assert.equal(denied.status, 401);
  const members = await request('GET', '/api/team/members', {headers});
  assert.equal(members.status, 409);
  assert.match(members.body.error, /local user management/);
  const invitations = await request('GET', '/api/team/invitations', {headers});
  assert.equal(invitations.status, 200);
  assert.deepEqual(invitations.body, []);
});


describe('Direct Meta transport', () => {
  test('checks credentials with GET and sends templates through the same Meta account', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const { default: cloud } = await import('../src/services/whatsappCloudApi.js');
    const calls = [];
    const graph = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      calls.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body: chunks.length ? JSON.parse(Buffer.concat(chunks)) : null });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(req.method === 'GET'
        ? { display_phone_number: '+1 555 000 0001', verified_name: 'Example', quality_rating: 'GREEN' }
        : { messages: [{ id: 'wamid.test-template-1' }] }));
    });
    await new Promise((resolve) => graph.listen(0, '127.0.0.1', resolve));
    const previous = process.env.META_GRAPH_API_BASE;
    process.env.META_GRAPH_API_BASE = `http://127.0.0.1:${graph.address().port}`;
    const account = await prisma.whatsAppAccount.create({ data: {
      name: 'Direct transport fixture', provider: 'meta', enabled: true, cloudApiPhoneId: 'phone-fixture',
      cloudApiToken: cloud.encryptToken('fixture-token'), templateLanguage: 'en_US',
    } });
    try {
      assert.equal((await cloud.testCredentials(account.id)).ok, true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'GET');
      const sent = await cloud.sendCampaignTemplate({ phone: '15550000001', campaignName: 'approved_enquiry', templateParams: ['Taylor', 'Canada'], accountId: account.id });
      assert.equal(sent.success, true);
      assert.equal(sent.messageId, 'wamid.test-template-1');
      assert.equal(calls[1].url, '/phone-fixture/messages');
      assert.equal(calls[1].authorization, 'Bearer fixture-token');
      assert.equal(calls[1].body.template.name, 'approved_enquiry');
      assert.equal(calls[1].body.template.language.code, 'en_US');
      assert.deepEqual(calls[1].body.template.components[0].parameters, [{ type: 'text', text: 'Taylor' }, { type: 'text', text: 'Canada' }]);
      assert.equal((await request('PATCH', `/api/whatsapp/accounts/${account.id}/cloud-credentials`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.91' }, body: { provider: 'retired-provider' } })).status, 400);
      assert.equal((await request('PATCH', `/api/whatsapp/accounts/${account.id}/cloud-credentials`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.91' }, body: { defaultCampaignName: 'Old Campaign Label' } })).status, 400);
      assert.equal((await prisma.whatsAppAccount.findUnique({ where: { id: account.id } })).defaultCampaignName, '');
    } finally {
      if (previous === undefined) delete process.env.META_GRAPH_API_BASE; else process.env.META_GRAPH_API_BASE = previous;
      await new Promise((resolve) => graph.close(resolve));
      await prisma.whatsAppAccount.delete({ where: { id: account.id } });
    }
  });
});

describe('Website service enquiries', () => {
  const origin = 'https://website.example.test';
  const endpoint = '/api/public/request-access';
  const headers = (ip = '192.0.2.130') => ({ Origin: origin, 'X-Forwarded-For': ip });
  const body = { name: 'Example Owner', workEmail: 'owner@example.test', company: 'Example Studio', notes: 'Help with Meta and hosting' };
  let previous;
  before(() => {
    previous = { enabled: process.env.WEBSITE_ENQUIRY_ENABLED, origins: process.env.WEBSITE_ENQUIRY_ORIGINS };
    process.env.WEBSITE_ENQUIRY_ENABLED = 'true';
    process.env.WEBSITE_ENQUIRY_ORIGINS = origin;
  });
  after(() => {
    for (const [key, value] of [['WEBSITE_ENQUIRY_ENABLED', previous.enabled], ['WEBSITE_ENQUIRY_ORIGINS', previous.origins]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  test('is opt-in and only accepts configured browser origins', async () => {
    assert.equal((await request('POST', endpoint, { headers: { 'X-Forwarded-For': '192.0.2.129' }, body })).status, 403);
    assert.equal((await request('POST', endpoint, { headers: { Origin: 'https://untrusted.example.test', 'X-Forwarded-For': '192.0.2.129' }, body })).status, 403);
    const preflight = await request('OPTIONS', endpoint, { headers: headers() });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], origin);
    process.env.WEBSITE_ENQUIRY_ENABLED = 'false';
    assert.equal((await request('POST', endpoint, { headers: headers(), body })).status, 503);
    process.env.WEBSITE_ENQUIRY_ENABLED = 'true';
  });
  test('validates input and ignores honeypot submissions', async () => {
    const invalidEmails = ['invalid', 'person@@example.test', 'person@example', 'person@.test', 'person@example.', 'person@exam ple.test', `!@!${'!.'.repeat(120)}`];
    for (const [i, workEmail] of invalidEmails.entries()) {
      assert.equal((await request('POST', endpoint, { headers: headers(`192.0.2.${140 + i}`), body: { ...body, workEmail } })).status, 422);
    }
    assert.equal((await request('POST', endpoint, { headers: headers(), body: { ...body, notes: 'x'.repeat(4001) } })).status, 422);
    assert.equal((await request('POST', endpoint, { headers: headers(), body: { ...body, companyWebsite: 'bot.test' } })).status, 200);
  });
  test('persists a paused enquiry without changing an existing contact or queueing outreach', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const existing = await prisma.lead.create({ data: { name: 'Existing contact', mobile: '15550000130', email: body.workEmail, status: 'replied' } });
    try {
      const result = await request('POST', endpoint, { headers: headers('192.0.2.131'), body });
      assert.equal(result.status, 201);
      assert.deepEqual(result.body, { success: true });
      assert.equal(result.headers['access-control-allow-origin'], origin);
      const saved = await prisma.lead.findFirst({ where: { source: 'website_service_enquiry', email: body.workEmail } });
      assert.equal(saved.status, 'paused');
      assert.equal(saved.emailMarketingConsent, false);
      assert.match(saved.mobile, /^no-phone:website-enquiry:/);
      assert.match(saved.notes, /Help with Meta and hosting/);
      assert.equal(await prisma.message.count({ where: { leadId: saved.id } }), 0);
      assert.equal((await prisma.lead.findUnique({ where: { id: existing.id } })).status, 'replied');
      await prisma.lead.delete({ where: { id: saved.id } });
    } finally { await prisma.lead.delete({ where: { id: existing.id } }); }
  });
  test('limits public submissions', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await request('POST', endpoint, { headers: headers('192.0.2.132'), body: { ...body, companyWebsite: 'bot.test' } })).status, 200);
    assert.equal((await request('POST', endpoint, { headers: headers('192.0.2.132'), body })).status, 429);
  });
});

describe('Generic connector intake and supplier attribution', () => {
  let db, source, supplier, otherSupplier;
  const created = [];
  const endpoint = '/api/webhooks/connector/fixture-connector';
  const headers = { 'x-api-key': 'fixture-connector-key', 'X-Forwarded-For': '192.0.2.170' };
  const record = (externalId, extra = {}) => ({ externalId, name: 'Connector fixture', mobile: '+1 (555) 000-0171', email: 'connector@example.test', acquiredAt: '2026-01-02T12:00:00Z', ...extra });
  before(async () => {
    db = (await import('../src/utils/prismaClient.js')).default;
    supplier = await db.supplier.create({ data: { name: 'Fixture origin partner', matchTag: 'fixture-partner' } });
    otherSupplier = await db.supplier.create({ data: { name: 'Fixture other partner', matchTag: 'other-partner' } });
    source = await db.webhookSource.create({ data: { name: 'Fixture connector', source: 'fixture-connector', apiKey: 'fixture-connector-key', importSupplierId: supplier.id, importTags: 'fixture-import' } });
  });
  after(async () => {
    await db.connectorReceipt.deleteMany({ where: { sourceId: source.id } });
    await db.salesOrder.deleteMany({ where: { originSupplierId: supplier.id } });
    await db.lead.deleteMany({ where: { OR: [{ source: source.source }, { id: { in: created } }] } });
    await db.webhookSource.delete({ where: { id: source.id } });
    await db.supplier.deleteMany({ where: { id: { in: [supplier.id, otherSupplier.id] } } });
  });
  test('requires the source key and validates the whole batch before writes', async () => {
    assert.equal((await request('POST', endpoint, { headers: { ...headers, 'x-api-key': 'wrong' }, body: { records: [record('bad-key')] } })).status, 401);
    assert.equal((await request('POST', endpoint, { headers, body: { records: [record('valid-before-invalid'), { name: 'Missing ID' }] } })).status, 422);
    assert.equal(await db.connectorReceipt.count({ where: { sourceId: source.id } }), 0);
  });
  test('persists a paused historical contact, source receipt and replay without outreach', async () => {
    const first = await request('POST', endpoint, { headers, body: { records: [record('fixture-1')] } });
    assert.equal(first.status, 200);
    assert.equal(first.body.outreachQueued, false);
    assert.equal(first.body.results[0].state, 'created');
    const id = first.body.results[0].leadId;
    const lead = await db.lead.findUnique({ where: { id } });
    assert.equal(lead.mobile, '15550000171'); assert.equal(lead.status, 'paused');
    assert.equal(lead.emailMarketingConsent, false); assert.equal(lead.originSupplierId, supplier.id);
    assert.match(lead.tags, /fixture-partner/); assert.equal(lead.consumedAt.toISOString(), '2026-01-02T12:00:00.000Z');
    assert.equal(await db.message.count({ where: { leadId: id } }), 0);
    const replay = await request('POST', endpoint, { headers, body: { records: [record('fixture-1')] } });
    assert.equal(replay.body.results[0].replay, true); assert.equal(replay.body.results[0].leadId, id);
    assert.equal(await db.connectorReceipt.count({ where: { sourceId: source.id } }), 1);
  });
  test('matches formatted phones and case-insensitive emails while preserving status and consent', async () => {
    const lead = await db.lead.create({ data: { name: 'Existing', mobile: '+44-7700-900171', email: 'EXISTING@example.test', status: 'replied', emailMarketingConsent: true, emailOptOut: true } }); created.push(lead.id);
    const response = await request('POST', endpoint, { headers, body: { records: [record('fixture-2', { mobile: '0044 7700 900171', email: 'existing@example.test', company: 'Filled company' })] } });
    assert.equal(response.body.results[0].state, 'matched'); assert.equal(response.body.results[0].leadId, lead.id);
    const saved = await db.lead.findUnique({ where: { id: lead.id } });
    assert.equal(saved.status, 'replied'); assert.equal(saved.emailMarketingConsent, true); assert.equal(saved.emailOptOut, true); assert.equal(saved.company, 'Filled company');
  });
  test('holds different owners and split identities for review without changing contacts', async () => {
    const owner = await db.lead.create({ data: { name: 'Other owner', mobile: '15550000173', tags: 'other-partner', originSupplierId: otherSupplier.id } }); created.push(owner.id);
    const second = await db.lead.create({ data: { name: 'Split identity', mobile: '15550000174', email: 'split@example.test' } }); created.push(second.id);
    const response = await request('POST', endpoint, { headers, body: { records: [record('owner-conflict', { mobile: '+1 555 000 0173', email: '' }), record('identity-conflict', { mobile: '+1 555 000 0171', email: 'split@example.test' })] } });
    assert.deepEqual(response.body.results.map((r) => r.state), ['conflict', 'conflict']);
    assert.equal((await db.lead.findUnique({ where: { id: owner.id } })).tags, 'other-partner');
    assert.equal(await db.connectorReceipt.count({ where: { sourceId: source.id, state: 'conflict' } }), 2);
  });
  test('snapshots lead origin onto a new order independently of fulfilment supplier', async () => {
    const lead = await db.lead.findFirst({ where: { source: source.source } });
    const result = await request('POST', '/api/orders', { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.175' }, body: { customerName: 'Fixture customer', leadId: lead.id, supplierId: otherSupplier.id, items: [] } });
    assert.equal(result.status, 201);
    assert.equal(result.body.originSupplierId, supplier.id); assert.equal(result.body.supplierId, otherSupplier.id);
    await db.lead.update({ where: { id: lead.id }, data: { tags: 'changed-later' } });
    assert.equal((await db.salesOrder.findUnique({ where: { id: result.body.id } })).originSupplierId, supplier.id);
    const list = await request('GET', `/api/orders?originSupplierId=${supplier.id}`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.175' } });
    assert.ok(list.body.data.some((order) => order.id === result.body.id));
  });
  test('configures future import attribution without rewriting existing receipts or origin', async () => {
    const admin = { ...authHeader(), 'X-Forwarded-For': '192.0.2.176' };
    const leadBefore = await db.lead.findFirst({ where: { source: source.source } });
    const receiptBefore = await db.connectorReceipt.findFirst({ where: { sourceId: source.id } });
    const invalid = await request('PATCH', `/api/connector-sources/${source.id}`, { headers: admin, body: { supplierId: supplier.id, tags: ['bad,tag'] } });
    assert.equal(invalid.status, 422);
    const unavailable = await request('PATCH', `/api/connector-sources/${source.id}`, { headers: admin, body: { supplierId: 99999999, tags: [] } });
    assert.equal(unavailable.status, 404);
    const saved = await request('PATCH', `/api/connector-sources/${source.id}`, { headers: admin, body: { supplierId: otherSupplier.id, tags: [' reviewed-import ', 'reviewed-import'] } });
    assert.equal(saved.status, 200); assert.equal(saved.body.outreachQueued, false);
    const listed = await request('GET', '/api/webhooks/sources', { headers: admin });
    const configured = listed.body.find((entry) => entry.id === source.id);
    assert.equal(configured.importSupplierId, otherSupplier.id); assert.equal(configured.importTags, 'reviewed-import');
    assert.notEqual(configured.apiKey, source.apiKey);
    assert.equal((await db.lead.findUnique({ where: { id: leadBefore.id } })).originSupplierId, leadBefore.originSupplierId);
    assert.deepEqual(await db.connectorReceipt.findUnique({ where: { id: receiptBefore.id } }), receiptBefore);
    await db.webhookSource.update({ where: { id: source.id }, data: { importSupplierId: supplier.id, importTags: 'fixture-import' } });
  });
  test('restricts configuration to admins and receipts to managers', async () => {
    const { signToken } = await import('../src/auth/rbac.js');
    const users = [];
    try {
      for (const role of ['agent', 'manager']) {
        const user = await db.user.create({ data: { name: 'Import review fixture', email: `import-${role}@example.test`, passwordHash: 'not-a-password', role } }); users.push(user.id);
        const auth = { Authorization: `Bearer ${signToken(user)}`, 'X-Forwarded-For': `192.0.2.${role === 'agent' ? 177 : 178}` };
        const configuration = await request('PATCH', `/api/connector-sources/${source.id}`, { headers: auth, body: { supplierId: supplier.id, tags: [] } });
        assert.equal(configuration.status, 403);
        const records = await request('GET', `/api/connector-receipts?sourceId=${source.id}&state=conflict&page=1`, { headers: auth });
        assert.equal(records.status, role === 'manager' ? 200 : 403);
        if (role === 'manager') {
          assert.equal(records.body.total, 2); assert.equal(records.body.records.length, 2);
          assert.ok(records.body.records.every((receipt) => receipt.sourceId === source.id && receipt.state === 'conflict' && receipt.reason));
          assert.equal(records.body.page, 1); assert.equal(records.body.pages, 1);
        }
      }
      assert.equal((await request('GET', `/api/connector-receipts?sourceId=${source.id}`, { headers: { 'X-Forwarded-For': '192.0.2.181' } })).status, 401);
      assert.equal((await request('GET', '/api/connector-receipts?sourceId=bad', { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.179' } })).status, 422);
    } finally { await db.user.deleteMany({ where: { id: { in: users } } }); }
  });
  test('pages large import histories without mixing sources or omitting records', async () => {
    const admin = { ...authHeader(), 'X-Forwarded-For': '192.0.2.182' };
    const before = await db.connectorReceipt.count({ where: { sourceId: source.id } });
    await db.connectorReceipt.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ sourceId: source.id, externalId: `paging-${index}`, state: 'matched', recordJson: '{}' })) });
    try {
      const first = await request('GET', `/api/connector-receipts?sourceId=${source.id}&page=1`, { headers: admin });
      const second = await request('GET', `/api/connector-receipts?sourceId=${source.id}&page=2`, { headers: admin });
      assert.equal(first.status, 200); assert.equal(second.status, 200);
      assert.equal(first.body.total, before + 101); assert.equal(first.body.pages, 2);
      assert.equal(first.body.records.length, 100); assert.equal(second.body.records.length, before + 1);
      const all = [...first.body.records, ...second.body.records];
      assert.equal(new Set(all.map((receipt) => receipt.id)).size, before + 101);
      assert.ok(all.every((receipt) => receipt.sourceId === source.id));
      const absent = await request('GET', '/api/connector-receipts?sourceId=99999999', { headers: admin });
      assert.equal(absent.body.total, 0); assert.deepEqual(absent.body.records, []);
    } finally { await db.connectorReceipt.deleteMany({ where: { sourceId: source.id, externalId: { startsWith: 'paging-' } } }); }
  });
  test('deleting a supplier used only by a configured source disables it and retains the reference', async () => {
    const partner = await db.supplier.create({ data: { name: 'Source-only supplier fixture' } });
    const configured = await db.webhookSource.create({ data: { name: 'Source-only fixture', source: 'source-only-fixture', apiKey: 'fixture-key', importSupplierId: partner.id } });
    try {
      const response = await request('DELETE', `/api/suppliers/${partner.id}`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.194' } });
      assert.equal(response.status, 200); assert.equal(response.body.disabled, true);
      assert.equal((await db.supplier.findUnique({ where: { id: partner.id } })).enabled, false);
      assert.equal((await db.webhookSource.findUnique({ where: { id: configured.id } })).importSupplierId, partner.id);
    } finally { await db.webhookSource.delete({ where: { id: configured.id } }); await db.supplier.delete({ where: { id: partner.id } }); }
  });
  test('accepted import IDs remain replayable after their supplier is disabled', async () => {
    const receipt = await db.connectorReceipt.findUnique({ where: { sourceId_externalId: { sourceId: source.id, externalId: 'fixture-1' } } });
    await db.supplier.update({ where: { id: supplier.id }, data: { enabled: false } });
    try {
      const replay = await request('POST', endpoint, { headers, body: { records: [record('fixture-1')] } });
      assert.equal(replay.status, 200);
      assert.equal(replay.body.results[0].replay, true);
      assert.equal(replay.body.results[0].leadId, receipt.leadId);
      const mixed = await request('POST', endpoint, { headers, body: { records: [record('fixture-1'), record('disabled-supplier-new', { mobile: '15550000190', email: 'new-import@example.test' })] } });
      assert.equal(mixed.status, 503);
      assert.equal(await db.connectorReceipt.count({ where: { sourceId: source.id, externalId: 'disabled-supplier-new' } }), 0);
      assert.deepEqual(await db.connectorReceipt.findUnique({ where: { id: receipt.id } }), receipt);
    } finally { await db.supplier.update({ where: { id: supplier.id }, data: { enabled: true } }); }
  });
  test('retains import history when deletion is attempted and allows disabling intake', async () => {
    const admin = { ...authHeader(), 'X-Forwarded-For': '192.0.2.180' };
    const count = await db.connectorReceipt.count({ where: { sourceId: source.id } });
    const removed = await request('DELETE', `/api/webhooks/sources/${source.id}`, { headers: admin });
    assert.equal(removed.status, 409); assert.match(removed.body.error, /Disable/);
    assert.equal(await db.connectorReceipt.count({ where: { sourceId: source.id } }), count);
    assert.ok(await db.webhookSource.findUnique({ where: { id: source.id } }));
    const disabled = await request('PATCH', `/api/webhooks/sources/${source.id}`, { headers: admin, body: { enabled: false } });
    assert.equal(disabled.status, 200); assert.equal(disabled.body.enabled, false);
    const intake = await request('POST', endpoint, { headers, body: { records: [record('disabled-source')] } });
    assert.equal(intake.status, 404);
    assert.equal(await db.connectorReceipt.count({ where: { sourceId: source.id } }), count);
    assert.equal((await request('DELETE', '/api/webhooks/sources/bad', { headers: admin })).status, 422);
    assert.equal((await request('DELETE', '/api/webhooks/sources/99999999', { headers: admin })).status, 404);
  });
});

test('personal read cursors and resolution stay independent of sales status and other viewers', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { signToken } = await import('../src/auth/rbac.js');
  const users = await Promise.all([1, 2].map(i => prisma.user.create({ data: { name: `Read Viewer ${i}`, email: `read-viewer-${i}@example.test`, passwordHash: 'fixture', role: 'agent' } })));
  const lead = await prisma.lead.create({ data: { name: 'Personal Read Fixture', mobile: 'no-phone:personal-read', status: 'paused', source: 'manual', messages: { create: { channel: 'whatsapp', direction: 'inbound', content: 'Please send a quote', status: 'delivered' } } }, include: { messages: true } });
  const other = await prisma.lead.create({ data: { name: 'Other Read Fixture', mobile: 'no-phone:other-read', messages: { create: { channel: 'email', direction: 'inbound', content: 'Other conversation', status: 'delivered' } } }, include: { messages: true } });
  const headers = i => ({ Authorization: `Bearer ${signToken(users[i])}`, 'X-Forwarded-For': `192.0.2.${120 + i}` });
  const detail = i => request('GET', `/api/inbox/threads/${lead.id}`, { headers: headers(i) });
  const read = (i, messageId) => request('POST', `/api/inbox/threads/${lead.id}/read`, { headers: headers(i), body: { messageId } });
  try {
    assert.equal((await detail(0)).body.unread, true);
    const list = i => request('GET', '/api/inbox/threads?search=Read%20Fixture&limit=1', { headers: headers(i) });
    assert.equal((await list(0)).body.unread, 2, 'unread total includes later pages');
    assert.equal((await list(1)).body.unread, 2);
    const assigned = await request('POST', `/api/inbox/threads/${lead.id}/assign-self`, { headers: headers(0) });
    assert.equal(assigned.status, 200);
    assert.equal(assigned.body.assignedToId, users[0].id);
    const own = await request('GET', '/api/inbox/threads?assignedToMe=true&search=Read%20Fixture', { headers: headers(0) });
    assert.equal(own.status, 200); assert.deepEqual(own.body.threads.map(row => row.leadId), [lead.id]);
    assert.equal((await read(0, other.messages[0].id)).status, 400);
    assert.equal((await read(0, -1)).status, 400);
    assert.equal((await request('POST', `/api/inbox/threads/${lead.id}/read`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.122' }, body: { messageId: lead.messages[0].id } })).status, 403);
    assert.equal((await read(0, lead.messages[0].id)).status, 200);
    assert.equal((await detail(0)).body.unread, false);
    assert.equal((await list(0)).body.unread, 1);
    assert.equal((await list(1)).body.unread, 2, 'another viewer retains their own unread total');
    assert.equal((await detail(0)).body.replyNeeded, true);
    assert.equal((await detail(1)).body.unread, true);
    const resolved = await request('POST', `/api/inbox/threads/${lead.id}/resolve`, { headers: headers(0) });
    assert.equal(resolved.status, 200);
    assert.equal((await detail(0)).body.threadState, 'resolved');
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'paused');
    const fresh = await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'inbound', content: 'Another question', status: 'delivered', createdAt: new Date(Date.now() + 1000) } });
    assert.equal((await detail(0)).body.threadState, 'needs_reply');
    assert.equal((await detail(0)).body.unread, true);
    await read(0, fresh.id);
    const stale = await read(0, lead.messages[0].id);
    assert.equal(stale.body.lastReadMessageId, fresh.id);
    assert.equal((await detail(0)).body.unread, false);
    const reopened = await request('POST', `/api/inbox/threads/${lead.id}/reopen`, { headers: headers(0) });
    assert.equal(reopened.status, 200);
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'paused');
  } finally {
    await prisma.lead.deleteMany({ where: { id: { in: [lead.id, other.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
  }
});

test('Web Push enforces personal device ownership and retries durable reply cursors without exposing content', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { default: webpush } = await import('web-push');
  const { signToken } = await import('../src/auth/rbac.js');
  const { deliverDeviceReplies, pollWebPush } = await import('../src/services/webPush.js');
  const keys = webpush.generateVAPIDKeys();
  const env = Object.fromEntries(['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT'].map(key => [key, process.env[key]]));
  process.env.WEB_PUSH_PUBLIC_KEY = keys.publicKey; process.env.WEB_PUSH_PRIVATE_KEY = keys.privateKey; process.env.WEB_PUSH_SUBJECT = 'mailto:admin@example.test';
  const users = await Promise.all([1, 2].map(i => prisma.user.create({ data: { name: `Push Viewer ${i}`, email: `push-viewer-${i}@example.test`, passwordHash: 'fixture', role: 'agent' } })));
  const headers = i => ({ Authorization: `Bearer ${signToken(users[i])}`, 'X-Forwarded-For': `192.0.2.${150 + i}` });
  const device = { endpoint: 'https://web.push.apple.com/fixture-device', keys: { p256dh: keys.publicKey, auth: Buffer.alloc(16, 1).toString('base64url') } };
  let lead;
  try {
    assert.equal((await request('POST', '/api/push/subscriptions', { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.152' }, body: device })).status, 403);
    assert.equal((await request('POST', '/api/push/subscriptions', { headers: headers(0), body: { ...device, endpoint: 'https://127.0.0.1/test' } })).status, 400);
    assert.equal((await request('POST', '/api/push/subscriptions', { headers: headers(0), body: device })).status, 200);
    assert.equal((await request('POST', '/api/push/subscriptions', { headers: headers(1), body: device })).status, 409);
    assert.equal((await request('POST', '/api/push/test', { headers: headers(1), body: { endpoint: device.endpoint } })).status, 404);
    await request('DELETE', '/api/push/subscriptions', { headers: headers(1), body: { endpoint: device.endpoint } });
    let subscription = await prisma.webPushSubscription.findFirst({ where: { userId: String(users[0].id) } });
    assert.ok(subscription);
    assert.notEqual(subscription.encryptedData, JSON.stringify(device));
    assert.ok(!subscription.encryptedData.includes(device.keys.auth));
    lead = await prisma.lead.create({ data: { name: 'Push Reply Fixture', mobile: 'no-phone:push-reply-fixture' } });
    const human = await prisma.message.create({ data: { leadId: lead.id, direction: 'inbound', channel: 'email', emailInboundKind: 'human', content: 'Private customer details', status: 'delivered' } });
    await prisma.message.create({ data: { leadId: lead.id, direction: 'inbound', channel: 'email', emailInboundKind: 'automatic_reply', content: 'Vacation notice', status: 'delivered' } });
    await deliverDeviceReplies(subscription, async () => { throw { statusCode: 503 }; });
    assert.equal((await prisma.webPushSubscription.findUnique({ where: { id: subscription.id } })).lastMessageId, subscription.lastMessageId);
    const sent = [];
    await deliverDeviceReplies(subscription, async (_device, payload) => { sent.push(payload); });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].tag, `conversation-${lead.id}-email`);
    assert.ok(!JSON.stringify(sent).includes('Private customer'));
    subscription = await prisma.webPushSubscription.findUnique({ where: { id: subscription.id } });
    assert.equal(subscription.lastMessageId, human.id);
    await deliverDeviceReplies(subscription, async () => assert.fail('Already delivered messages must not send again'));
    assert.equal((await request('PATCH', `/api/push/subscriptions/${subscription.id}/preview`, { headers: headers(0), body: { previewMode: 'message' } })).status, 200);
    const previewMessage = await prisma.message.create({ data: { leadId: lead.id, direction: 'inbound', channel: 'telegram', content: '<b>Fixture</b> message preview', status: 'delivered' } });
    subscription = await prisma.webPushSubscription.findUnique({ where: { id: subscription.id } });
    const previews = [];
    await deliverDeviceReplies(subscription, async (_device, payload) => previews.push(payload));
    assert.equal(previews.length, 1);
    assert.equal(previews[0].title, 'Push Reply Fixture · Telegram');
    assert.equal(previews[0].body, 'Fixture message preview');
    assert.equal(previews[0].url, `/m/inbox?leadId=${lead.id}&channel=telegram`);
    assert.ok(!previews[0].url.includes('Fixture'));
    assert.equal(previews[0].timestamp, previewMessage.createdAt.getTime());
    assert.equal((await request('PATCH', `/api/push/subscriptions/${subscription.id}/preview`, { headers: headers(0), body: { previewMode: 'private' } })).status, 200);
    subscription = await prisma.webPushSubscription.findUnique({ where: { id: subscription.id } });
    const newer = await prisma.message.create({ data: { leadId: lead.id, direction: 'inbound', channel: 'whatsapp', content: 'Another question', status: 'delivered' } });
    await prisma.inboxReadState.create({ data: { leadId: lead.id, viewerKey: subscription.viewerKey, lastReadMessageId: newer.id } });
    await deliverDeviceReplies(subscription, async () => assert.fail('Messages read in the foreground must not alert again'));
    const last = await prisma.message.create({ data: { leadId: lead.id, direction: 'inbound', channel: 'whatsapp', content: 'Last question', status: 'delivered' } });
    subscription = await prisma.webPushSubscription.findUnique({ where: { id: subscription.id } });
    await deliverDeviceReplies(subscription, async () => { throw { statusCode: 410 }; });
    assert.equal(await prisma.webPushSubscription.findUnique({ where: { id: subscription.id } }), null);
    assert.ok(last.id > subscription.lastMessageId);
    const original = prisma.webPushSubscription.findFirst;
    prisma.webPushSubscription.findFirst = async () => { throw new Error('Fictional private database failure'); };
    try {
      const unavailable = await request('POST', '/api/push/status', { headers: { ...headers(0), 'X-Forwarded-For': '192.0.2.153' }, body: { endpoint: device.endpoint } });
      assert.equal(unavailable.status, 500);
      assert.ok(!JSON.stringify(unavailable.body).includes('private database'));
    } finally { prisma.webPushSubscription.findFirst = original; }
    await request('POST', '/api/push/subscriptions', { headers: { ...headers(0), 'X-Forwarded-For': '192.0.2.154' }, body: device });
    await prisma.user.update({ where: { id: users[0].id }, data: { enabled: false } });
    await pollWebPush();
    assert.equal(await prisma.webPushSubscription.count({ where: { userId: String(users[0].id) } }), 0, 'disabled users lose device access before delivery');
  } finally {
    await prisma.webPushSubscription.deleteMany({ where: { userId: { in: users.map(user => String(user.id)) } } });
    if (lead) await prisma.lead.delete({ where: { id: lead.id } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('WhatsApp follow-up quota waits without using a retry and uncertain sends stay held', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { default: manager } = await import('../src/services/whatsapp.js');
  const { default: followup } = await import('../src/services/followup.js');
  const sender = await prisma.whatsAppAccount.create({ data: { name: 'Follow-up quota fixture' } });
  const lead = await prisma.lead.create({ data: {
    name: 'Follow-up quota fixture', mobile: '15550104997', assignedAccount: sender.id, status: 'new', leadTier: 'HOT',
  } });
  const queued = await prisma.message.create({ data: {
    leadId: lead.id, direction: 'outbound', channel: 'whatsapp', status: 'queued', content: 'Synthetic follow-up',
    scheduledAt: new Date(Date.now() - 60_000), waAccount: sender.id, waCampaignName: 'fixture_template',
  } });
  const original = manager.sendCampaignTemplate;
  const retryAt = new Date(Date.now() + 30 * 60_000);
  let attempts = 0;
  manager.sendCampaignTemplate = async () => {
    attempts++;
    return attempts === 1 ? { success: false, reason: 'whatsapp_hourly_limit', retryAt }
      : { success: false, reason: 'timeout' };
  };
  try {
    const run = () => followup.processQueue({ messageIds: [queued.id] });
    const row = () => prisma.message.findUnique({ where: { id: queued.id } });
    await run();
    const held = await row();
    assert.equal(held.status, 'queued');
    assert.equal(held.retryCount, 0);
    assert.equal(+held.scheduledAt, +retryAt);
    await run();
    assert.equal(attempts, 1);
    await prisma.message.update({ where: { id: queued.id }, data: { scheduledAt: new Date(Date.now() - 1_000) } });
    await run();
    assert.equal((await row()).status, 'unconfirmed');
    await run();
    assert.equal(attempts, 2);
  } finally {
    manager.sendCampaignTemplate = original;
    await prisma.lead.delete({ where: { id: lead.id } });
    await prisma.whatsAppAccount.delete({ where: { id: sender.id } });
  }
});

test('a worker killed during provider submission leaves one held WhatsApp attempt', { timeout: 15_000 }, async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { default: followup } = await import('../src/services/followup.js');
  const { default: imessage } = await import('../src/services/imessage.js');
  const sender = await prisma.whatsAppAccount.create({ data: {
    name: 'Crash recovery fixture', enabled: true, cloudApiPhoneId: 'fixture-crash-recovery',
    cloudApiToken: 'synthetic-fixture-only', dailyLimit: 20, hourlyLimit: 10,
  } });
  const lead = await prisma.lead.create({ data: {
    name: 'Crash recovery fixture', mobile: '15550104998', assignedAccount: sender.id, status: 'new', leadTier: 'HOT',
  } });
  const message = await prisma.message.create({ data: {
    leadId: lead.id, direction: 'outbound', channel: 'whatsapp', status: 'queued', content: 'Synthetic follow-up',
    scheduledAt: new Date(Date.now() - 60_000), waAccount: sender.id, waCampaignName: 'fixture_template',
  } });
  let submissions = 0;
  let received;
  const requestReceived = new Promise(resolve => { received = resolve; });
  const graph = http.createServer((req) => {
    submissions++;
    req.resume();
    req.on('end', received);
    // Keep the response open so the worker cannot record a provider outcome.
  });
  const recoverImessage = imessage.recoverStuckMessages;
  let child;
  let timer;
  try {
    await new Promise(resolve => graph.listen(0, '127.0.0.1', resolve));
    const { href } = new URL('../src/services/followup.js', import.meta.url);
    child = spawn(process.execPath, ['--input-type=module', '-e', `
      import worker from ${JSON.stringify(href)};
      await worker.processQueue({ messageIds: [Number(process.argv[1])] });
      process.exit(0);
    `, String(message.id)], { env: {
      ...process.env, META_GRAPH_API_BASE: `http://127.0.0.1:${graph.address().port}`,
    }, stdio: 'ignore' });
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (_code, signal) => resolve(signal));
    });
    await Promise.race([
      requestReceived,
      exited.then(() => { throw new Error('Worker exited before provider submission.'); }),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('No provider submission received.')), 7000);
      }),
    ]);
    const row = () => prisma.message.findUnique({ where: { id: message.id } });
    assert.equal((await row()).providerStatusReason, 'provider_pending');
    child.kill('SIGKILL');
    assert.equal(await exited, 'SIGKILL');

    await prisma.message.update({ where: { id: message.id }, data: { updatedAt: new Date(Date.now() - 6 * 60_000) } });
    imessage.recoverStuckMessages = async () => ({ count: 0, confirmed: 0, requeued: 0 });
    await followup.recoverStuckMessages();
    const held = await row();
    assert.equal(held.status, 'unconfirmed');
    assert.equal(held.providerStatusReason, 'confirmation_unknown');
    assert.equal(held.retryCount, 0);
    await followup.processQueue({ messageIds: [message.id] });
    assert.equal(submissions, 1);
  } finally {
    clearTimeout(timer);
    child?.kill('SIGKILL');
    imessage.recoverStuckMessages = recoverImessage;
    graph.closeAllConnections();
    if (graph.listening) await new Promise(resolve => graph.close(resolve));
    await prisma.lead.delete({ where: { id: lead.id } });
    await prisma.whatsAppAccount.delete({ where: { id: sender.id } });
  }
});

test('WhatsApp manual replies enforce the window, persist failures, retain reply ownership and deduplicate attempts', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { default: manager } = await import('../src/services/whatsapp.js');
  const { default: cloud } = await import('../src/services/whatsappCloudApi.js');
  const originalSend = manager.sendMessage, originalTemplate = manager.sendApprovedTemplate, originalList = cloud.listApprovedTemplates;
  const account = await prisma.whatsAppAccount.create({ data: { name: 'Manual session fixture', enabled: true, cloudApiPhoneId: 'manual-fixture-phone' } });
  const lead = await prisma.lead.create({ data: { name: 'Manual WhatsApp Fixture', mobile: '15551234501', assignedAccount: account.id, status: 'paused' } });
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.181' };
  let sends = 0;
  manager.sendMessage = async () => { sends++; return { success: true, waMessageId: 'wamid.MANUAL-FIXTURE', accountId: account.id }; };
  manager.sendApprovedTemplate = async (...args) => { assert.equal(args[2], 'en_GB'); sends++; return { success: true, waMessageId: 'wamid.TEMPLATE-FIXTURE' }; };
  cloud.listApprovedTemplates = async () => ({ ok: true, templates: [{ name: 'reconnect_fixture', language: 'en_GB', category: 'MARKETING', status: 'APPROVED', body: 'Hello {{1}}, still interested?', bodyVariables: ['1'], manualSupported: true }] });
  const send = (body) => request('POST', '/api/inbox/send', { headers, body: { leadId: lead.id, channel: 'whatsapp', ...body } });
  try {
    await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'inbound', waAccount: account.id, content: 'Old enquiry', status: 'delivered', sentAt: new Date('2026-01-01'), createdAt: new Date() } });
    const blocked = await send({ text: 'A normal reply' });
    assert.equal(blocked.status, 409); assert.equal(blocked.body.reason, 're_engagement_required'); assert.equal(sends, 0);
    const template = { name: 'reconnect_fixture', language: 'en_GB', parameters: ['Buyer'] };
    assert.equal((await send({ whatsappTemplate: { ...template, parameters: [] } })).status, 400);
    const accepted = await send({ whatsappTemplate: template, clientMessageId: 'fixture-template-00001' });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.message.content, 'Hello Buyer, still interested?');
    assert.equal((await send({ text: 'Template did not reopen the window' })).status, 409);
    const mcpTemplate = await request('POST', `/api/leads/${lead.id}/send`, { headers, body: { accountId: account.id, whatsappTemplate: template, clientMessageId: 'fixture-mcp-template-001' } });
    assert.equal(mcpTemplate.status, 200);
    assert.equal(mcpTemplate.body.message.waCampaignName, 'reconnect_fixture');
    assert.equal(mcpTemplate.body.message.content, 'Hello Buyer, still interested?');
    const repeatTemplate = await request('POST', `/api/leads/${lead.id}/send`, { headers, body: { accountId: account.id, whatsappTemplate: template, clientMessageId: 'fixture-mcp-template-001' } });
    assert.equal(repeatTemplate.body.message.id, mcpTemplate.body.message.id);
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'paused');
    const explained = await request('POST', '/api/campaigns/preview-leads', { headers, body: { channel: 'whatsapp', filter: { product: 'unmatched-fixture-product', poolId: 1 } } });
    assert.equal(explained.status, 400);

    await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'inbound', waAccount: account.id, content: 'Yes, please', status: 'delivered', sentAt: new Date() } });
    const body = { text: 'Here are the details', clientMessageId: 'fixture-message-00001' };
    const sent = await send(body); assert.equal(sent.status, 200);
    assert.equal(sent.body.message.waMessageId, 'wamid.MANUAL-FIXTURE');
    const duplicate = await send(body); assert.equal(duplicate.body.message.id, sent.body.message.id); assert.equal(sends, 3);
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'paused');
    await prisma.message.update({ where: { id: sent.body.message.id }, data: { status: 'failed', providerStatusReason: 're_engagement_required' } });
    const detail = await request('GET', `/api/inbox/threads/${lead.id}`, { headers });
    assert.ok(detail.body.messages.some(row => row.id === sent.body.message.id && row.status === 'failed'));
    assert.equal(detail.body.replyNeeded, true, 'failed attempts never clear the unanswered human reply');
    manager.sendMessage = async () => ({ success: false, reason: 'send_failed', error: 'Provider rejected the fixture request', errorCode: 'PARAM_INVALID', requestId: 'req_fixture_manual', waMessageId: 'ycloud.failed-fixture' });
    const rejected = await send({ text: 'A provider-rejected reply', clientMessageId: 'fixture-rejected-0001' });
    assert.equal(rejected.status, 409);
    assert.match(rejected.body.error, /Provider rejected the fixture request/);
    const rejectedRow = await prisma.message.findFirst({ where: { idempotencyKey: `manual-wa:${lead.id}:fixture-rejected-0001` } });
    assert.equal(rejectedRow.status, 'failed');
    assert.equal(rejectedRow.providerErrorMessage, 'Provider rejected the fixture request');
    assert.equal(rejectedRow.providerErrorCode, 'PARAM_INVALID');
    assert.equal(rejectedRow.providerRequestId, 'req_fixture_manual');
    assert.equal(rejectedRow.waMessageId, 'ycloud.failed-fixture');
    const rejectedDetail = await request('GET', `/api/inbox/threads/${lead.id}`, { headers });
    assert.equal(rejectedDetail.body.messages.find(row => row.id === rejectedRow.id).providerErrorCode, 'PARAM_INVALID');
    manager.sendMessage = async () => ({ success: false, reason: 'timeout' });
    const unknown = await send({ text: 'Uncertain send', clientMessageId: 'fixture-uncertain-0001' });
    assert.equal(unknown.status, 409);
    assert.equal((await prisma.message.findFirst({ where: { idempotencyKey: `manual-wa:${lead.id}:fixture-uncertain-0001` } })).status, 'unconfirmed');
    const { sendManualWhatsApp } = await import('../src/services/manualWhatsApp.js');
    const { recordMetaReceipt } = await import('../src/services/whatsappDelivery.js');
    let concurrentSends = 0;
    const dependencies = { manager: { sendMessage: async () => { concurrentSends++; await new Promise(resolve => setTimeout(resolve, 30)); return { success: true, waMessageId: 'wamid.CONCURRENT-FIXTURE' }; } } };
    const parallelBody = { leadId: lead.id, text: 'Only once across tabs', clientMessageId: 'fixture-concurrent-0001' };
    const parallel = await Promise.all([sendManualWhatsApp(parallelBody, dependencies), sendManualWhatsApp(parallelBody, dependencies)]);
    assert.equal(concurrentSends, 1);
    assert.equal(parallel[0].message.id, parallel[1].message.id);
    const retainedFollowup = await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'outbound', content: 'Fixture pending followup', status: 'queued', waAccount: account.id } });
    const finalFailure = await sendManualWhatsApp({ leadId: lead.id, text: 'Receipt arrived first', clientMessageId: 'fixture-receipt-first1' }, { manager: { sendMessage: async () => {
      await recordMetaReceipt({ accountId: account.id, waMessageId: 'wamid.MANUAL-EARLY-FAILURE', status: 'failed', failureCode: 131047 });
      return { success: true, waMessageId: 'wamid.MANUAL-EARLY-FAILURE' };
    } } });
    assert.equal(finalFailure.success, false, 'an early failure must not produce a success response');
    assert.equal(finalFailure.message.status, 'failed');
    assert.equal(finalFailure.reason, 're_engagement_required');
    assert.equal((await prisma.message.findUnique({ where: { id: retainedFollowup.id } })).status, 'queued', 'a rejected manual attempt must not cancel unrelated pending work');
    for (const route of [`/api/leads/${lead.id}/send-cloud-text`, `/api/leads/${lead.id}/send`]) {
      const response = await request('POST', route, { headers, body: { text: 'Legacy route', message: 'Legacy route', accountId: 999999 } });
      assert.equal(response.status, 503, 'an unavailable explicit sender cannot silently switch numbers');
    }
    await prisma.whatsAppAccount.update({ where: { id: account.id }, data: { enabled: false } });
    assert.equal((await send({ text: 'No silent fallback' })).status, 503);
    await prisma.whatsAppAccount.update({ where: { id: account.id }, data: { enabled: true } });
    const { default: followup } = await import('../src/services/followup.js');
    const { default: imessage } = await import('../src/services/imessage.js');
    const previousRecovery = imessage.recoverStuckMessages;
    const stale = new Date(Date.now() - 10 * 60_000);
    const manual = await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'outbound', content: 'Interrupted manual attempt', status: 'sending', idempotencyKey: `manual-wa:${lead.id}:fixture-interrupted-0001`, updatedAt: stale } });
    const automated = await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'outbound', content: 'Interrupted queue attempt', status: 'sending', updatedAt: stale } });
    const interruptedCampaign = await prisma.message.create({ data: { leadId: lead.id, campaignId: 987654, channel: 'whatsapp', direction: 'outbound', content: 'Synthetic interrupted campaign attempt', status: 'sending', updatedAt: stale } });
    const preparing = await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'outbound', content: 'Stopped before submission', status: 'sending', providerStatusReason: 'whatsapp_preparing', updatedAt: stale } });
    imessage.recoverStuckMessages = async () => ({ count: 0, confirmed: 0, requeued: 0 });
    try {
      const recovered = await followup.recoverStuckMessages();
      assert.ok(recovered.unconfirmed >= 1);
      assert.equal((await prisma.message.findUnique({ where: { id: manual.id } })).status, 'unconfirmed');
      assert.equal((await prisma.message.findUnique({ where: { id: automated.id } })).status, 'unconfirmed');
      assert.equal((await prisma.message.findUnique({ where: { id: interruptedCampaign.id } })).status, 'unconfirmed');
      assert.equal((await prisma.message.findUnique({ where: { id: preparing.id } })).status, 'queued');
    } finally { imessage.recoverStuckMessages = previousRecovery; }

  } finally {
    manager.sendMessage = originalSend; manager.sendApprovedTemplate = originalTemplate; cloud.listApprovedTemplates = originalList;
    await prisma.whatsAppReceipt.deleteMany({ where: { accountId: account.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
    await prisma.whatsAppAccount.delete({ where: { id: account.id } });
  }
});

test('campaign receipts expose delivery failure, preserve opt-outs, and retain numeric retry classification', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { recordMetaReceipt } = await import('../src/services/whatsappDelivery.js');
  const { suppressedWhatsAppLeads } = await import('../src/services/whatsappSuppression.js');
  const { findRetryable } = await import('../src/services/deliveryRetry.js');
  const { sendManualWhatsApp } = await import('../src/services/manualWhatsApp.js');
  const account = await prisma.whatsAppAccount.create({ data: { name: 'Synthetic campaign receipts', enabled: true } });
  const lead = await prisma.lead.create({ data: { name: 'Synthetic receipt lead', mobile: '15550000181', status: 'contacted' } });
  const temporaryLead = await prisma.lead.create({ data: { name: 'Synthetic retry lead', mobile: '15550000182', status: 'contacted' } });
  const campaign = await prisma.campaign.create({ data: { name: 'Synthetic dispatch complete', messageTemplate: 'Fixture', channel: 'whatsapp', status: 'completed', totalLeads: 2 } });
  try {
    const sentAt = new Date(Date.now() - 48 * 3600000);
    for (const [index, contact] of [lead, temporaryLead].entries()) {
      await prisma.campaignLead.create({ data: { campaignId: campaign.id, leadId: contact.id, status: 'sent', sentAt } });
      await prisma.message.create({ data: { leadId: contact.id, campaignId: campaign.id, channel: 'whatsapp', direction: 'outbound', content: 'Synthetic template', status: 'sent', sentAt, waAccount: account.id, waMessageId: `fixture-campaign-receipt-${index}` } });
    }
    await recordMetaReceipt({ accountId: account.id, waMessageId: 'fixture-campaign-receipt-0', status: 'sent', timestamp: '1' });
    let message = await prisma.message.findFirst({ where: { campaignId: campaign.id, leadId: lead.id } });
    assert.equal(message.ackStatus, 1, 'provider-sent acknowledgement advances after local acceptance');
    await recordMetaReceipt({ accountId: account.id, waMessageId: message.waMessageId, status: 'failed', failureCode: 131050, failureReason: 'Stopped receiving business marketing', timestamp: '2' });
    await recordMetaReceipt({ accountId: account.id, waMessageId: 'fixture-campaign-receipt-1', status: 'failed', failureCode: 131049, failureReason: 'Marketing quality throttle', timestamp: '3' });
    message = await prisma.message.findFirst({ where: { campaignId: campaign.id, leadId: temporaryLead.id } });
    assert.equal(message.providerErrorCode, '131049');
    const { default: engine } = await import('../src/services/campaignEngine.js');
    const detail = await engine.getCampaign(campaign.id);
    assert.equal(detail.sentCount, 2); assert.equal(detail.failedCount, 2);
    assert.equal(detail.delivery.failed, 2);
    assert.ok((await suppressedWhatsAppLeads(prisma, [lead.id], account.id)).has(lead.id));
    const cloud = { listApprovedTemplates: async () => ({ ok: true, templates: [{ name: 'fixture_marketing', language: 'en', category: 'MARKETING', body: 'Fixture', bodyVariables: [] }] }) };
    await assert.rejects(sendManualWhatsApp({ leadId: lead.id, accountId: account.id, template: { name: 'fixture_marketing', language: 'en', parameters: [] } }, { cloud }), error => error.reason === 'whatsapp_marketing_opted_out');
    const due = await findRetryable({ now: new Date(Date.now() + 48 * 3600000) });
    assert.ok(due.some(row => row.id === message.id), 'numeric 131049 reaches the retryable path after backoff');
    assert.ok(!due.some(row => row.leadId === lead.id), 'explicit marketing opt-outs never enter retries');
    await recordMetaReceipt({ accountId: account.id, waMessageId: 'fixture-campaign-receipt-0', status: 'read', timestamp: '4' });
    assert.ok((await suppressedWhatsAppLeads(prisma, [lead.id], account.id)).has(lead.id), 'a late receipt cannot erase an opt-out');
    const { sweep } = await import('../src/services/deliveryRetry.js');
    const previousTime = new Date(Date.now() - 4 * 86400000);
    await prisma.message.update({ where: { id: message.id }, data: { updatedAt: previousTime, ackUpdatedAt: previousTime } });
    const swept = await sweep({ dryRun: false });
    assert.ok(swept.reviewRequired >= 1, 'campaign retry requires reviewed campaign dispatch');
    assert.equal((await prisma.message.findUnique({ where: { id: message.id } })).status, 'failed');
    const { default: followup } = await import('../src/services/followup.js');
    await prisma.message.update({ where: { id: message.id }, data: { status: 'queued', scheduledAt: previousTime } });
    await followup.processQueue({ messageIds: [message.id] });
    const quarantined = await prisma.message.findUnique({ where: { id: message.id } });
    assert.equal(quarantined.status, 'unconfirmed');
    assert.equal(quarantined.providerStatusReason, 'campaign_retry_review_required');
    const uncertain = await prisma.message.create({ data: { leadId: temporaryLead.id, campaignId: campaign.id, channel: 'whatsapp', direction: 'outbound', status: 'unconfirmed', content: 'Synthetic timeout', waAccount: account.id, waMessageId: 'fixture-uncertain-receipt', providerStatusReason: 'confirmation_unknown' } });
    await recordMetaReceipt({ accountId: account.id, waMessageId: uncertain.waMessageId, status: 'sent', timestamp: '5' });
    const confirmed = await prisma.message.findUnique({ where: { id: uncertain.id } });
    assert.equal(confirmed.status, 'sent'); assert.equal(confirmed.ackStatus, 1);
    assert.equal(confirmed.providerErrorCode, null);
    assert.ok(confirmed.sentAt);
  } finally {
    await prisma.whatsAppReceipt.deleteMany({ where: { accountId: account.id } });
    await prisma.lead.deleteMany({ where: { id: { in: [lead.id, temporaryLead.id] } } });
    await prisma.campaign.delete({ where: { id: campaign.id } });
    await prisma.whatsAppAccount.delete({ where: { id: account.id } });
  }
});

test('Meta receipts survive early arrival, reject cross-number matching, and never downgrade delivery', async () => {
  const { default: prisma } = await import('../src/utils/prismaClient.js');
  const { recordMetaReceipt, replayPendingMetaReceipts } = await import('../src/services/whatsappDelivery.js');
  const accounts = await Promise.all([1, 2].map(i => prisma.whatsAppAccount.create({ data: { name: `Receipt Fixture ${i}`, enabled: true } })));
  const lead = await prisma.lead.create({ data: { name: 'Early receipt fixture', mobile: '15551234503' } });
  const id = 'wamid.EARLY-FIXTURE';
  try {
    const failure = { accountId: accounts[0].id, waMessageId: id, status: 'failed', failureCode: 131047, failureReason: 'Re-engagement message', timestamp: '100' };
    await recordMetaReceipt(failure); await recordMetaReceipt(failure);
    assert.equal(await prisma.whatsAppReceipt.count({ where: { waMessageId: id } }), 1);
    const message = await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'outbound', status: 'sent', waMessageId: id, waAccount: accounts[0].id, content: 'Retain this attempt', sentAt: new Date() } });
    const replay = await replayPendingMetaReceipts();
    assert.ok(replay.applied >= 1, 'maintenance reconciles early receipts without another webhook');
    let row = await prisma.message.findUnique({ where: { id: message.id } });
    assert.equal(row.status, 'failed'); assert.equal(row.providerStatusReason, 're_engagement_required');
    await recordMetaReceipt({ accountId: accounts[1].id, waMessageId: id, status: 'read', timestamp: '101' });
    assert.equal((await prisma.message.findUnique({ where: { id: message.id } })).status, 'failed');
    await recordMetaReceipt({ accountId: accounts[0].id, waMessageId: id, status: 'read', timestamp: '102' });
    await recordMetaReceipt({ ...failure, timestamp: '103' });
    await recordMetaReceipt({ accountId: accounts[0].id, waMessageId: id, status: 'sent', timestamp: '104' });
    row = await prisma.message.findUnique({ where: { id: message.id } });
    assert.equal(row.status, 'read'); assert.equal(row.ackStatus, 3); assert.equal(row.providerStatusReason, null);
    const original = prisma.whatsAppReceipt.upsert;
    prisma.whatsAppReceipt.upsert = async () => { throw new Error('Fictional storage failure'); };
    try {
      const payload = { entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'PNID-TEST-1' }, statuses: [{ id: 'wamid.RETRY-STORAGE', status: 'failed', errors: [{ code: 131047 }] }] } }] }] };
      const signature = `sha256=${crypto.createHmac('sha256', 'test-meta-app-secret').update(JSON.stringify(payload)).digest('hex')}`;
      assert.equal((await request('POST', '/webhook/meta', { headers: { 'X-Hub-Signature-256': signature }, body: payload })).status, 503, 'failed persistence must request a provider retry');
    } finally { prisma.whatsAppReceipt.upsert = original; }
  } finally {
    await prisma.whatsAppReceipt.deleteMany({ where: { accountId: { in: accounts.map(row => row.id) } } });
    await prisma.lead.delete({ where: { id: lead.id } });
    await prisma.whatsAppAccount.deleteMany({ where: { id: { in: accounts.map(row => row.id) } } });
  }
});

describe('MCP dashboard connection setup', () => {
  let previous;
  before(() => { previous = process.env.MCP_PUBLIC_URL; delete process.env.MCP_PUBLIC_URL; });
  after(() => { if (previous === undefined) delete process.env.MCP_PUBLIC_URL; else process.env.MCP_PUBLIC_URL = previous; });
  test('returns public configuration without credentials or trusting query-supplied destinations', async () => {
    const result = await request('GET', '/api/integrations/mcp?url=https://untrusted.example.test/mcp', { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.190' } });
    assert.equal(result.status, 200);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(result.body.serverUrl, null);
    assert.equal(result.body.health.status, 'not_configured');
    assert.equal(result.body.backendConfigured, true);
    assert.ok(!JSON.stringify(result.body).includes(process.env.MCP_SERVICE_TOKEN));
  });
  test('allows managers but rejects agents and anonymous callers', async () => {
    const { default: db } = await import('../src/utils/prismaClient.js');
    const { signToken } = await import('../src/auth/rbac.js');
    const users = [];
    try {
      for (const role of ['agent', 'manager']) {
        const user = await db.user.create({ data: { name: 'MCP setup fixture', email: `mcp-${role}@example.test`, passwordHash: 'fixture', role } }); users.push(user.id);
        const result = await request('GET', '/api/integrations/mcp', { headers: { Authorization: `Bearer ${signToken(user)}`, 'X-Forwarded-For': role === 'agent' ? '192.0.2.191' : '192.0.2.192' } });
        assert.equal(result.status, role === 'manager' ? 200 : 403);
      }
      assert.equal((await request('GET', '/api/integrations/mcp', { headers: { 'X-Forwarded-For': '192.0.2.193' } })).status, 401);
    } finally { await db.user.deleteMany({ where: { id: { in: users } } }); }
  });
});

describe('Audit workflow repairs', () => {
  test('explicit lead pause and resume preserve sales state and record the reason', async () => {
    const { default: db } = await import('../src/utils/prismaClient.js');
    const lead = await db.lead.create({ data: { name: 'Pause stage fixture', mobile: 'no-phone:stage-pause', status: 'engaged' } });
    const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.207' };
    try {
      const pause = (paused, outreachReason) => request('PATCH', `/api/leads/${lead.id}`, {
        headers, body: { outreachPaused: paused, outreachReason },
      });
      assert.equal((await pause(true, 'Review requested')).body.status, 'paused');
      assert.equal((await pause(true)).body.statusBeforePause, 'engaged', 'a repeated pause preserves the saved state');
      assert.equal((await pause(false)).body.status, 'engaged');
      const bulk = action => request('POST', '/api/leads/bulk', { headers, body: { ids: [lead.id], action } });
      assert.equal((await bulk('pause')).body.updated, 1);
      assert.equal((await bulk('resume')).body.updated, 1);
      assert.equal((await db.lead.findUnique({ where: { id: lead.id } })).status, 'engaged');
      const events = await db.activityLog.findMany({ where: { leadId: lead.id }, orderBy: { id: 'asc' } });
      assert.equal(events.length, 4);
      assert.equal(JSON.parse(events[0].meta).reason, 'Review requested');
      assert.equal(JSON.parse(events[1].meta).to, 'engaged');
    } finally {
      await db.activityLog.deleteMany({ where: { leadId: lead.id } });
      await db.lead.delete({ where: { id: lead.id } });
    }
  });

  test('outreach history composes with lead status and uses outbound acceptance evidence', async () => {
    const { default: db } = await import('../src/utils/prismaClient.js');
    const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.206' };
    const source = 'history-filter-fixture';
    const [unconfirmed, accepted, queued] = await Promise.all([
      { name: 'Unconfirmed', status: 'paused', messages: [{ direction: 'inbound', status: 'received' }, { direction: 'outbound', status: 'unconfirmed' }] },
      { name: 'Accepted before bounce', status: 'paused', messages: [{ direction: 'outbound', status: 'bounced', sentAt: new Date() }] },
      { name: 'Only queued', status: 'contacted', messages: [{ direction: 'outbound', status: 'queued' }] },
    ].map((row, index) => db.lead.create({ data: {
      name: row.name, status: row.status, source, mobile: 'no-phone:history-filter:' + index,
      messages: { create: row.messages.map(message => ({ ...message, channel: 'email', content: 'Fixture' })) },
    } })));
    try {
      const list = filter => request('GET', `/api/leads?source=${source}&${filter}`, { headers });
      const paused = await list('status=paused&outreachHistory=no_acceptance');
      assert.equal(paused.body.total, 1);
      assert.deepEqual(paused.body.leads.map(lead => lead.id), [unconfirmed.id]);
      const sent = await list('outreachHistory=accepted');
      assert.deepEqual(sent.body.leads.map(lead => lead.id), [accepted.id]);
      const without = await list('outreachHistory=no_acceptance');
      assert.deepEqual(without.body.leads.map(lead => lead.id).sort(), [unconfirmed.id, queued.id].sort());
      assert.equal((await list('outreachHistory=invalid')).status, 400);
    } finally {
      await db.lead.deleteMany({ where: { source } });
    }
  });

  test('email-only CSV contacts skip matching addresses and preserve suppression', async () => {
    const { default: db } = await import('../src/utils/prismaClient.js');
    const filename = 'audit-email-only.csv';
    const known = await db.lead.create({ data: {
      name: 'Existing suppressed contact', mobile: '12025550173', email: ' Already-Known@example.test ',
      emailOptOut: true,
    } });
    try {
      const form = new FormData();
      form.set('file', new Blob([
        'name,email,company\nExisting,already-known@example.test,Should not fill\nNew,email-csv@example.test,Fixture\nRepeat,EMAIL-CSV@example.test,Ignored\nInvalid,missing-domain,Example\n',
      ], { type: 'text/csv' }), filename);
      const upload = () => fetch(`${baseUrl}/api/import/csv`, {
        method: 'POST', headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.208' }, body: form,
      });
      form.set('preview', '1');
      const preview = await upload();
      assert.equal(preview.status, 200);
      const review = await preview.json();
      assert.deepEqual([review.imported, review.skipped, review.failed], [1, 2, 1]);
      form.delete('preview');
      form.set('reviewToken', review.reviewToken);
      assert.equal((await upload()).status, 200);
      const imported = await db.lead.findMany({ where: { email: 'email-csv@example.test' } });
      assert.equal(imported.length, 1);
      assert.match(imported[0].mobile, /^no-phone:csv:/);
      assert.equal(await db.message.count({ where: { leadId: imported[0].id } }), 0);
      const existing = await db.lead.findUnique({ where: { id: known.id } });
      assert.equal(existing.company, null);
      assert.equal(existing.emailOptOut, true);
    } finally {
      await db.lead.deleteMany({ where: { OR: [{ id: known.id }, { email: 'email-csv@example.test' }] } });
      await db.importBatch.deleteMany({ where: { filename } });
    }
  });

  test('CSV preview writes nothing and applies only the current reviewed upload', async () => {
    const { default: db } = await import('../src/utils/prismaClient.js');
    const name = 'CSV multiline audit fixture';
    try {
      const form = new FormData();
      form.set('file', new Blob(['name,mobile,notes\r\n"CSV multiline audit fixture",447700900811,"line one\nline two"\r\n'], { type: 'text/csv' }), 'audit-fixture.csv');
      form.set('preview', '1');
      const upload = () => fetch(`${baseUrl}/api/import/csv`, {
        method: 'POST', headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.210' }, body: form,
      });
      const scanned = await upload();
      assert.equal(scanned.status, 200);
      const review = await scanned.json();
      assert.equal(review.imported, 1);
      assert.equal(review.columnMapping.mobile, 'mobile');
      assert.equal(await db.lead.count({ where: { name } }), 0);
      assert.equal(await db.importBatch.count({ where: { filename: 'audit-fixture.csv' } }), 0);
      form.delete('preview');
      form.set('reviewToken', 'a'.repeat(64));
      assert.equal((await upload()).status, 409);
      form.set('reviewToken', review.reviewToken);
      const result = await upload();
      assert.equal(result.status, 200, JSON.stringify(await result.clone().json()));
      const saved = await db.lead.findFirst({ where: { name } });
      assert.ok(saved);
      assert.equal(saved.notes, 'line one\nline two');
      assert.equal((await upload()).status, 409, 'repeat approval is stale once the matching contact exists');
      const preview = await request('POST', '/api/campaigns/preview-leads', { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.211' }, body: { filter: { status: 'new' }, channel: 'whatsapp' } });
      assert.equal(preview.status, 200);
      assert.equal(typeof preview.body.count, 'number');
      assert.equal(preview.body.matchedCount, preview.body.count + preview.body.excludedCount);
      assert.equal(typeof preview.body.exclusionCounts, 'object');
    } finally {
      await db.lead.deleteMany({ where: { name } });
      await db.importBatch.deleteMany({ where: { filename: 'audit-fixture.csv' } });
    }
  });

  test('sales stages include email contacts without WhatsApp and tags match whole tokens', async () => {
    const { default: db } = await import('../src/utils/prismaClient.js');
    const lead = await db.lead.create({ data: { name: 'Stage audit fixture', mobile: 'no-phone:stage-audit', email: 'stage-audit@example.test', status: 'replied', isOnWhatsApp: false, tags: 'bulk, UK-retail' } });
    const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.212' };
    try {
      const result = await request('GET', '/api/leads?status=replied&search=Stage%20audit%20fixture', { headers });
      assert.equal(result.status, 200);
      assert.equal(result.body.leads[0]?.id, lead.id);
      assert.equal((await request('GET', '/api/leads?tags=uk&search=Stage%20audit%20fixture', { headers })).body.total, 0);
      assert.equal((await request('GET', '/api/leads?tags=uk-retail&search=Stage%20audit%20fixture', { headers })).body.total, 1);
      const timeline = await request('GET', `/api/leads/${lead.id}/timeline`, { headers });
      assert.equal(timeline.status, 200);
      assert.ok(Array.isArray(timeline.body.events));
    } finally { await db.lead.delete({ where: { id: lead.id } }); }
  });

  test('notification reads persist per person and a read-all watermark does not consume later events', async () => {
    const { default: db } = await import('../src/utils/prismaClient.js');
    const { signToken } = await import('../src/auth/rbac.js');
    const users = await Promise.all(['a', 'b'].map(key => db.user.create({ data: { name: `Bell ${key}`, email: `bell-${key}@example.test`, role: 'viewer', passwordHash: 'fixture' } })));
    const headers = index => ({ Authorization: `Bearer ${signToken(users[index])}`, 'X-Forwarded-For': `192.0.2.${213 + index}` });
    const events = [];
    try {
      events.push(await db.activityLog.create({ data: { type: 'fixture', message: 'Notification one' } }));
      const id = events[0].id;
      assert.equal((await request('PATCH', `/api/notifications/${id}/read`, { headers: headers(0) })).status, 200);
      const list = async index => (await request('GET', '/api/notifications', { headers: headers(index) })).body;
      assert.equal((await list(0)).find(row => row.id === id).read, true);
      assert.equal((await list(1)).find(row => row.id === id).read, false);
      assert.equal((await request('PATCH', '/api/notifications/read-all', { headers: headers(1), body: { throughId: id } })).status, 200);
      events.push(await db.activityLog.create({ data: { type: 'fixture', message: 'Notification two' } }));
      assert.equal((await list(1)).find(row => row.id === events[1].id).read, false);
      assert.equal((await request('PATCH', '/api/notifications/read-all', { headers: headers(1), body: { throughId: -1 } })).status, 400);
      assert.equal((await request('PATCH', `/api/notifications/${id}/read`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.215' } })).status, 403);
    } finally {
      const viewerKeys = users.map(user => `local:${user.id}`);
      await db.notificationRead.deleteMany({ where: { viewerKey: { in: viewerKeys } } });
      await db.notificationCursor.deleteMany({ where: { viewerKey: { in: viewerKeys } } });
      await db.activityLog.deleteMany({ where: { id: { in: events.map(event => event.id) } } });
      await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    }
  });
});

test('recorded activity paginates persisted events and applies type filters before pagination', async () => {
  const { default: db } = await import('../src/utils/prismaClient.js');
  const rows = await Promise.all(Array.from({ length: 4 }, (_, index) => db.activityLog.create({ data: { type: 'audit_pagination_fixture', message: `Recorded ${index}` } })));
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.216' };
  try {
    const first = await request('GET', '/api/activity/records?type=audit_pagination_fixture&limit=2&page=1', { headers });
    const second = await request('GET', '/api/activity/records?type=audit_pagination_fixture&limit=2&page=2', { headers });
    assert.equal(first.status, 200);
    assert.equal(first.body.total, 4);
    assert.equal(first.body.pages, 2);
    assert.equal(first.body.items.length, 2);
    assert.equal(new Set([...first.body.items, ...second.body.items].map(row => row.id)).size, 4);
  } finally { await db.activityLog.deleteMany({ where: { id: { in: rows.map(row => row.id) } } }); }
});


test('assignment validates live members and keeps Mine, Inbox and Tasks ownership consistent', async () => {
  const { default: db } = await import('../src/utils/prismaClient.js');
  const { signToken } = await import('../src/auth/rbac.js');
  const people = await Promise.all(['admin', 'agent', 'viewer'].map((role, index) => db.user.create({ data: {
    name: `Assignment fixture ${role}`, email: `assignment-${index}@example.test`, passwordHash: 'fixture', role,
  } })));
  const heads = people.map((user, i) => ({ Authorization: `Bearer ${signToken(user)}`, 'X-Forwarded-For': `192.0.2.${210 + i}` }));
  const leads = await Promise.all([0, 1, 2].map(index => db.lead.create({ data: { name: `Owner fixture ${index}`, mobile: `no-phone:assignment-${index}`,
    assignedToId: index === 1 ? people[1].id : null,
    messages: { create: { direction: 'outbound', channel: 'email', content: 'Fixture sent message', status: 'sent' } },
    leadTasks: { create: { title: `Ownership follow-up ${index}`, dueAt: new Date('2020-01-01T12:00:00Z') } },
  } })));
  const memberKey = `local:local:${people[1].id}`;
  try {
    assert.equal((await request('GET', '/api/workspace/members', { headers: heads[2] })).status, 403);
    assert.equal((await request('POST', `/api/leads/${leads[0].id}/assign`, { headers: heads[0], body: {} })).status, 400);
    assert.equal((await request('POST', `/api/leads/${leads[0].id}/assign`, { headers: heads[0], body: { userId: '1junk' } })).status, 400);
    const assigned = await request('POST', `/api/leads/${leads[0].id}/assign`, { headers: heads[0], body: { memberKey } });
    assert.equal(assigned.status, 200); assert.equal(assigned.body.assignedMember.key, memberKey);
    assert.equal(assigned.body.assignedToId, people[1].id);
    const detail = await request('GET', `/api/inbox/threads/${leads[0].id}`, { headers: heads[1] });
    assert.equal(detail.body.assignedMember.name, people[1].name); assert.equal(detail.body.threadState, 'assigned');
    const mine = await request('GET', '/api/inbox/threads?assignedToMe=true&search=Owner%20fixture', { headers: heads[1] });
    assert.deepEqual(mine.body.threads.map(row => row.leadId).sort(), [leads[0].id, leads[1].id].sort(), 'legacy local ownership is preserved');
    const taskQueue = await request('GET', '/api/tasks?scope=mine', { headers: heads[1] });
    assert.equal(taskQueue.status, 200); assert.equal(taskQueue.body.total, 2); assert.equal(taskQueue.body.overdueCount, 2);
    assert.deepEqual(taskQueue.body.tasks.map(task => task.leadId).sort(), [leads[0].id, leads[1].id].sort());
    const noServiceIdentity = await request('POST', `/api/inbox/threads/${leads[2].id}/assign-self`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.213' } });
    assert.equal(noServiceIdentity.status, 403);
    const takeover = await request('POST', `/api/inbox/threads/${leads[0].id}/assign-self`, { headers: heads[2] });
    assert.equal(takeover.status, 403, 'read-only users cannot claim conversations');
    await db.lead.update({ where: { id: leads[2].id }, data: { status: 'paused' } });
    const resumed = await request('POST', '/api/leads/bulk', { headers: heads[0], body: { ids: [leads[1].id, leads[2].id, 999999999], action: 'resume' } });
    assert.equal(resumed.status, 200); assert.equal(resumed.body.updated, 1, 'bulk results count affected rows');
    assert.equal((await request('POST', '/api/leads/bulk', { headers: heads[0], body: { ids: ['1junk'], action: 'pause' } })).status, 400);
    await db.user.update({ where: { id: people[1].id }, data: { enabled: false } });
    const unavailable = await request('POST', `/api/leads/${leads[2].id}/assign`, { headers: heads[0], body: { memberKey } });
    assert.equal(unavailable.status, 409);
    assert.equal((await db.lead.findUnique({ where: { id: leads[2].id } })).assignedMemberKey, null);
    const cleared = await request('POST', `/api/leads/${leads[0].id}/assign`, { headers: heads[0], body: { memberKey: null } });
    assert.equal(cleared.status, 200); assert.equal(cleared.body.assignedToId, null); assert.equal(cleared.body.assignedMemberKey, null);
    assert.equal((await request('GET', '/api/tasks?scope=anything', { headers: heads[0] })).status, 400);
  } finally {
    await db.lead.deleteMany({ where: { id: { in: leads.map(lead => lead.id) } } });
    await db.workspaceMember.deleteMany({ where: { externalId: { in: people.map(user => String(user.id)) }, provider: 'local' } });
    await db.user.deleteMany({ where: { id: { in: people.map(user => user.id) } } });
  }
});

test('trusted legacy service assignment validates explicit local targets while personal claim stays forbidden', async () => {
  const { default: db } = await import('../src/utils/prismaClient.js');
  const { signToken } = await import('../src/auth/rbac.js');
  const people = await Promise.all(['agent', 'viewer'].map(role => db.user.create({ data: {
    name: `Service assignment ${role}`, email: `service-assignment-${role}@example.test`, passwordHash: 'fixture', role,
  } })));
  const lead = await db.lead.create({ data: { name: 'Service assignment fixture', mobile: 'no-phone:service-assignment' } });
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.217' };
  const endpoint = `/api/leads/${lead.id}/assign`;
  const memberKey = `local:local:${people[0].id}`;
  try {
    assert.equal((await request('POST', endpoint, { headers: { 'X-Forwarded-For': '192.0.2.219' }, body: { memberKey } })).status, 401);
    for (const [index, person] of people.entries()) {
      assert.equal((await request('POST', endpoint, { headers: { Authorization: `Bearer ${signToken(person)}`, 'X-Forwarded-For': `192.0.2.${220 + index}` }, body: { memberKey } })).status, 403);
    }
    const directory = await request('GET', '/api/workspace/members', { headers });
    assert.equal(directory.status, 200);
    assert.ok(directory.body.members.some(member => member.key === memberKey));
    for (const [body, status] of [
      [{}, 400], [{ memberKey, userId: people[0].id }, 400], [{ memberKey: 'clerk:org_fixture:user_agent' }, 403],
      [{ memberKey: 'local:local:999999999' }, 409], [{ memberKey: `local:local:${people[1].id}` }, 409], [{ userId: '1junk' }, 400],
    ]) assert.equal((await request('POST', endpoint, { headers, body })).status, status);
    assert.equal((await db.lead.findUnique({ where: { id: lead.id } })).assignedMemberKey, null);
    assert.equal((await request('POST', endpoint, { headers, body: { memberKey } })).status, 200);
    let saved = await db.lead.findUnique({ where: { id: lead.id } });
    assert.equal(saved.assignedMemberKey, memberKey);
    assert.equal(saved.assignedToId, people[0].id);
    assert.equal((await request('POST', endpoint, { headers, body: { memberKey: null } })).status, 200);
    const legacy = await request('POST', endpoint, { headers, body: { userId: people[0].id } });
    assert.equal(legacy.status, 200);
    assert.equal(legacy.body.assignedMemberKey, memberKey);
    await db.user.update({ where: { id: people[0].id }, data: { enabled: false } });
    assert.equal((await request('POST', endpoint, { headers, body: { memberKey } })).status, 409);
    assert.equal((await request('POST', `/api/inbox/threads/${lead.id}/assign-self`, { headers })).status, 403);
    assert.equal((await request('POST', endpoint, { headers, body: { userId: null } })).status, 200);
    saved = await db.lead.findUnique({ where: { id: lead.id } });
    assert.equal(saved.assignedMemberKey, null);
    assert.equal(saved.assignedToId, null);
  } finally {
    await db.lead.delete({ where: { id: lead.id } });
    await db.workspaceMember.deleteMany({ where: { key: memberKey } });
    await db.user.deleteMany({ where: { id: { in: people.map(person => person.id) } } });
  }
});

test('legacy service Clerk assignment uses pinned provider keys and never matches local users by email', async () => {
  const { default: db } = await import('../src/utils/prismaClient.js');
  const { default: members } = await import('../src/services/workspaceMembers.js');
  const previous = { env: members.env, client: members.client };
  const key = 'clerk:org_service_fixture:user_target';
  const target = { id: 'user_target', firstName: 'Service target', banned: false, locked: false, primaryEmailAddress: { emailAddress: 'service-clerk@example.test' } };
  const membership = { role: 'org:member', publicUserData: { userId: target.id, firstName: target.firstName, identifier: target.primaryEmailAddress.emailAddress } };
  let present = true;
  const calls = [];
  members.env = { AUTH_PROVIDER: 'clerk', NODE_ENV: 'production', CLERK_ORGANIZATION_ID: 'org_service_fixture' };
  members.client = { organizations: { getOrganizationMembershipList: async input => {
    calls.push(input);
    assert.equal(input.organizationId, 'org_service_fixture');
    const data = present && (!input.userId || input.userId.includes(target.id)) ? [membership] : [];
    return { data, totalCount: data.length };
  } }, users: { getUser: async id => id === target.id ? target : null } };
  const local = await db.user.create({ data: { name: 'Same-address local fixture', email: target.primaryEmailAddress.emailAddress, passwordHash: 'fixture', role: 'admin' } });
  const lead = await db.lead.create({ data: { name: 'Clerk service assignment fixture', mobile: 'no-phone:clerk-service-assignment' } });
  const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.218' };
  const endpoint = `/api/leads/${lead.id}/assign`;
  try {
    const directory = await request('GET', '/api/workspace/members', { headers });
    assert.equal(directory.status, 200);
    assert.equal(directory.body.members[0].key, key);
    const numeric = await request('POST', endpoint, { headers, body: { userId: local.id } });
    assert.equal(numeric.status, 400);
    assert.match(numeric.body.error, /memberKey.*list_users/);
    assert.equal((await request('POST', endpoint, { headers, body: { memberKey: `local:local:${local.id}` } })).status, 403);
    assert.equal((await request('POST', endpoint, { headers, body: { memberKey: 'clerk:org_other:user_target' } })).status, 403);
    assert.equal((await request('POST', endpoint, { headers, body: { memberKey: 'clerk:org_service_fixture:user_missing' } })).status, 409);
    assert.equal((await request('POST', endpoint, { headers, body: { memberKey: key } })).status, 200);
    const saved = await db.lead.findUnique({ where: { id: lead.id } });
    assert.equal(saved.assignedMemberKey, key);
    assert.equal(saved.assignedToId, null);
    target.banned = true;
    assert.equal((await request('POST', endpoint, { headers, body: { memberKey: key } })).status, 409);
    target.banned = false;
    present = false;
    assert.equal((await request('POST', endpoint, { headers, body: { memberKey: key } })).status, 409);
    assert.equal((await request('POST', endpoint, { headers, body: { memberKey: null } })).status, 200);
    assert.equal((await request('POST', `/api/inbox/threads/${lead.id}/assign-self`, { headers })).status, 403);
    assert.ok(calls.length > 0);
  } finally {
    Object.assign(members, previous);
    await db.lead.delete({ where: { id: lead.id } });
    await db.workspaceMember.deleteMany({ where: { key } });
    await db.user.delete({ where: { id: local.id } });
  }
});

// Real routes and a local provider fixture: never send to a live recipient.
describe('YCloud WhatsApp provider', () => {
  let upstream, previousBase, account, prisma, cloud;
  let calls = [], sendFailure = false, wrongNumber = false;
  const key = 'ycloud-test-key-not-live';
  const secret = 'ycloud-test-signing-secret';
  const waba = '123456789012345';
  const phone = '+15550109999';
  const headers = () => ({ ...authHeader(), 'X-Forwarded-For': '192.0.2.211' });
  const sign = (body, signingSecret = secret) => {
    const timestamp = Math.floor(Date.now() / 1000);
    return `t=${timestamp},s=${crypto.createHmac('sha256', signingSecret).update(`${timestamp}.${JSON.stringify(body)}`).digest('hex')}`;
  };
  const postEvent = (body, signingSecret = secret) => request('POST', `/webhook/ycloud/${account.id}`, {
    body, headers: { 'YCloud-Signature': sign(body, signingSecret) },
  });
  before(async () => {
    ({ default: prisma } = await import('../src/utils/prismaClient.js'));
    ({ default: cloud } = await import('../src/services/whatsappCloudApi.js'));
    upstream = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      const body = req.headers['content-type']?.includes('application/json') && raw ? JSON.parse(raw) : raw;
      calls.push({ method: req.method, url: req.url, key: req.headers['x-api-key'], body });
      res.setHeader('Content-Type', 'application/json');
      if (req.url.includes('/phoneNumbers/')) {
        res.end(JSON.stringify({ wabaId: waba, phoneNumber: wrongNumber ? '+15550108888' : phone, verifiedName: 'Fixture Business', qualityRating: 'GREEN' }));
      } else if (req.url.startsWith('/v2/whatsapp/templates?')) {
        const page = new URL(req.url, 'http://fixture.test').searchParams.get('page');
        res.end(JSON.stringify({ items: page === '1' ? Array.from({ length: 100 }, (_, n) => ({
          wabaId: n === 0 ? '999999999999999' : waba, name: `fixture_${n}`, language: 'en', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'BODY', text: 'Hello {{1}}' }],
        })) : [{ wabaId: waba, name: 'last_page', language: 'en_US', status: 'APPROVED', components: [] }] }));
      } else if (req.url.includes('/upload')) res.end(JSON.stringify({ id: 'media-fixture' }));
      else if (req.url.includes('/download/')) { res.setHeader('Content-Type', 'image/png'); res.end(Buffer.from('fixture-image')); }
      else if (req.url === '/v2/whatsapp/messages/sendDirectly') {
        if (sendFailure === 'gateway') {
          res.statusCode = 502;
          return res.end('{}');
        }
        if (sendFailure === 'balance') {
          res.statusCode = 403;
          return res.end(JSON.stringify({ code: 'BALANCE_INSUFFICIENT', message: 'Payment fixture' }));
        } else if (sendFailure === 'thread') {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: { code: 'BAD_REQUEST', requestId: 'req_thread_fixture', whatsappApiError: { code: '131070', message: 'Caller is not thread owner', error_data: { details: 'Another app is controlling this thread now' } } } }));
          return;
        }
        res.end(JSON.stringify(sendFailure ? { id: 'failed-fixture', status: 'failed', errorCode: '131042', errorMessage: 'Payment fixture' } : { id: 'ycloud-message-fixture', wamid: 'wamid.fixture', status: 'sent' }));
      } else { res.statusCode = 404; res.end('{}'); }
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    previousBase = process.env.YCLOUD_API_BASE;
    process.env.YCLOUD_API_BASE = `http://127.0.0.1:${upstream.address().port}/v2`;
    account = await prisma.whatsAppAccount.create({ data: { name: 'YCloud fixture', provider: 'ycloud', enabled: true, hourlyLimit: 100, dailyLimit: 100 } });
  });
  after(async () => {
    if (previousBase === undefined) delete process.env.YCLOUD_API_BASE; else process.env.YCLOUD_API_BASE = previousBase;
    if (upstream) await new Promise(resolve => upstream.close(resolve));
  });

  test('stores independent encrypted secrets, retains blanks and hides every secret in public routes', async () => {
    const saved = await request('PATCH', `/api/whatsapp/accounts/${account.id}/cloud-credentials`, { headers: headers(), body: {
      provider: 'ycloud', ycloudApiKey: key, ycloudWebhookSecret: secret, ycloudWabaId: waba, ycloudPhoneNumber: phone,
    } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.ycloudConfigured, true);
    const stored = await prisma.whatsAppAccount.findUnique({ where: { id: account.id } });
    assert.notEqual(stored.ycloudApiKey, key);
    assert.notEqual(stored.ycloudWebhookSecret, secret);
    assert.equal(cloud.decryptToken(stored.ycloudApiKey), key);
    await request('PATCH', `/api/whatsapp/accounts/${account.id}/cloud-credentials`, { headers: headers(), body: { ycloudApiKey: '', ycloudWebhookSecret: '' } });
    const retained = await prisma.whatsAppAccount.findUnique({ where: { id: account.id } });
    assert.equal(retained.ycloudApiKey, stored.ycloudApiKey);
    for (const response of [saved, await request('GET', '/api/whatsapp/accounts', { headers: headers() }), await request('PUT', `/api/whatsapp/accounts/${account.id}`, { headers: headers(), body: { name: 'YCloud fixture edited' } })]) {
      const json = JSON.stringify(response.body);
      for (const sensitive of [key, secret, stored.ycloudApiKey, stored.ycloudWebhookSecret]) assert.equal(json.includes(sensitive), false);
    }
  });

  test('connection check reads the exact sender and WABA without sending; templates paginate within that WABA', async () => {
    calls = [];
    const result = await cloud.testCredentials(account.id);
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].key, key);
    wrongNumber = true;
    assert.equal((await cloud.testCredentials(account.id)).reason, 'account_mismatch');
    wrongNumber = false;
    const list = await cloud.listApprovedTemplates(account.id);
    assert.equal(list.ok, true);
    assert.equal(list.templates.length, 100);
    assert.equal(list.templates.some(t => t.name === 'fixture_0'), false);
    assert.equal(list.templates.at(-1).name, 'last_page');
  });

  test('dispatches text, templates and uploaded media using YCloud IDs and reports provider failures', async () => {
    calls = [];
    const text = await cloud.sendTextMessage('15550100001', 'Fixture only', account.id);
    assert.equal(text.messageId, 'ycloud-message-fixture');
    assert.equal(calls[0].key, key);
    assert.equal(calls[0].body.from, phone);
    assert.equal(calls[0].body.to, '+15550100001');
    assert.equal(calls[0].body.messaging_product, undefined);
    const template = await cloud.sendCampaignTemplate({ phone: '15550100001', campaignName: 'fixture_template', templateParams: ['Taylor'], accountId: account.id });
    assert.equal(template.success, true);
    assert.equal(calls[1].body.template.components[0].parameters[0].text, 'Taylor');
    const { sendMediaFile } = await import('../src/services/whatsappMedia.js');
    const file = path.join(__dirname, '..', 'data', 'ycloud-fixture.txt');
    fs.writeFileSync(file, 'Fixture only');
    try {
      assert.equal((await sendMediaFile({ address: '15550100001', filePath: file, mimeType: 'text/plain', filename: 'fixture.txt', accountId: account.id })).success, true);
      assert.match(calls[2].url, /media\/\%2B15550109999\/upload/);
      assert.equal(calls[3].body.document.id, 'media-fixture');
    } finally { fs.unlinkSync(file); }
    sendFailure = true;
    assert.equal((await cloud.sendTextMessage('15550100001', 'Fixture only', account.id)).reason, 'payment_issue');
    sendFailure = 'balance';
    const balance = await cloud.sendCampaignTemplate({ phone: '15550100001', campaignName: 'fixture_template', templateParams: ['Taylor'], accountId: account.id });
    assert.equal(balance.reason, 'payment_issue');
    assert.equal(balance.errorCode, 'BALANCE_INSUFFICIENT');
    sendFailure = true;
    const failure = await cloud.sendTextMessage('15550100001', 'Fixture only', account.id);
    assert.equal(failure.reason, 'payment_issue');
    assert.equal(failure.messageId, 'failed-fixture');
    assert.equal(failure.errorCode, '131042');
    assert.equal(failure.rawError, 'Payment fixture');
    sendFailure = false;
  });

  test('one shared quota gates concurrent text, template and media sends before provider calls', async () => {
    calls = [];
    const source = await prisma.whatsAppAccount.findUnique({ where: { id: account.id } });
    const first = await prisma.whatsAppAccount.create({ data: {
      name: 'Limited YCloud fixture', provider: 'ycloud', enabled: true,
      ycloudApiKey: source.ycloudApiKey, ycloudWabaId: waba, ycloudPhoneNumber: phone,
      hourlyLimit: 1, dailyLimit: 9,
    } });
    const attempts = await Promise.all([1, 2, 3, 4].map(() =>
      cloud.sendTextMessage('15550100001', 'Synthetic quota fixture', first.id)));
    assert.equal(attempts.filter(result => result.success).length, 1);
    assert.equal(attempts.filter(result => result.reason === 'whatsapp_hourly_limit').length, 3);
    assert.equal(calls.length, 1);

    const template = await cloud.sendCampaignTemplate({ phone: '15550100001', campaignName: 'fixture_template', accountId: first.id });
    assert.equal(template.reason, 'whatsapp_hourly_limit');
    const { sendMediaFile } = await import('../src/services/whatsappMedia.js');
    const file = path.join(__dirname, '..', 'data', 'quota-media-fixture.txt');
    fs.writeFileSync(file, 'Fixture only');
    try {
      const media = await sendMediaFile({ address: '15550100001', filePath: file, mimeType: 'text/plain', filename: 'fixture.txt', accountId: first.id });
      assert.equal(media.reason, 'whatsapp_hourly_limit');
    } finally {
      fs.unlinkSync(file);
    }
    assert.equal(calls.length, 1, 'quota denial even skips provider media upload');

    const pool = await prisma.leadPool.create({ data: { name: 'Quota fixture', slug: 'quota-fixture' } });
    await prisma.leadPoolWhatsApp.createMany({ data: [first.id, account.id].map(whatsappAccountId => ({ poolId: pool.id, whatsappAccountId })) });
    const { default: manager } = await import('../src/services/whatsapp.js');
    assert.equal(await manager.getNextAccount({ poolId: pool.id }), account.id);
    assert.equal(await manager.getNextAccount({ poolId: pool.id }), account.id);
    const later = await manager.sendMessage('15550100001', 'Synthetic quota fixture', first.id);
    assert.equal(later.reason, 'whatsapp_hourly_limit');
    assert.equal(calls.length, 1, 'explicit sender cannot switch accounts');
  });

  test('quota survives new processes and observes both midnight and rolling-hour boundaries', async () => {
    const sender = await prisma.whatsAppAccount.create({ data: {
      name: 'Persistent quota fixture', hourlyLimit: 1, dailyLimit: 1, enabled: true,
    } });
    const worker = new URL('../src/services/whatsappDispatch.js', import.meta.url).href;
    const dbModule = new URL('../src/utils/prismaClient.js', import.meta.url).href;
    const run = promisify(execFile);
    const attempt = async (time) => {
      const { stdout } = await run(process.execPath, ['--input-type=module', '-e', `
        import { reserveWhatsAppDispatch } from ${JSON.stringify(worker)};
        import db from ${JSON.stringify(dbModule)};
        const result = await reserveWhatsAppDispatch(Number(process.argv[1]), new Date(process.argv[2]));
        console.log(JSON.stringify(result));
        await db.$disconnect();
      `, String(sender.id), time], { env: { ...process.env, BUSINESS_TIMEZONE: 'Asia/Kolkata' } });
      return JSON.parse(stdout.trim().split('\n').at(-1));
    };
    const initial = '2026-11-18T17:45:00.000Z';
    const contenders = await Promise.all([attempt(initial), attempt(initial)]);
    assert.equal(contenders.filter(result => result.reserved).length, 1);
    const sameDay = await attempt('2026-11-18T18:25:00.000Z');
    assert.equal(sameDay.reason, 'whatsapp_daily_limit');
    assert.equal(sameDay.retryAt, '2026-11-18T18:30:00.000Z');
    const midnight = await attempt('2026-11-18T18:30:00.000Z');
    assert.equal(midnight.reason, 'whatsapp_hourly_limit', 'midnight cannot clear the rolling hour');
    assert.equal(midnight.retryAt, '2026-11-18T18:45:00.000Z');
    assert.equal((await attempt('2026-11-18T18:45:00.000Z')).reserved, true);
  });

  test('a gateway error leaves the provider outcome uncertain', async () => {
    calls = [];
    sendFailure = 'gateway';
    try {
      const result = await cloud.sendTextMessage('15550100001', 'Synthetic gateway fixture', account.id);
      assert.equal(result.success, false);
      assert.equal(result.reason, 'confirmation_unknown');
      assert.equal(calls.length, 1);
    } finally {
      sendFailure = false;
    }
  });

  test('thread ownership rejection is actionable and never retried by the transport', async () => {
    calls = [];
    sendFailure = 'thread';
    try {
      const failure = await cloud.sendTextMessage('15550100001', 'Fixture only', account.id);
      assert.equal(failure.success, false);
      assert.equal(failure.reason, 'thread_not_owned');
      assert.equal(failure.errorCode, '131070');
      assert.equal(failure.requestId, 'req_thread_fixture');
      assert.equal(failure.rawError, 'Another app is controlling this thread now');
      assert.equal(calls.length, 1);
    } finally { sendFailure = false; }
  });

  test('rejects unsigned and cross-account events; stores one reply with original time and stops automation', async () => {
    const lead = await prisma.lead.create({ data: { name: 'YCloud fixture recipient', mobile: '15550100002', status: 'contacted', assignedAccount: account.id } });
    const queued = await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'outbound', content: 'Fixture followup', status: 'queued', waAccount: account.id } });
    const time = new Date(Date.now() - 60_000).toISOString();
    const body = { type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id: 'in-yc-1', wamid: 'wamid.in-yc-1', from: '+15550100002', to: phone, wabaId: waba, sendTime: time, type: 'text', text: { body: 'Please stop messaging me' } } };
    assert.equal((await request('POST', `/webhook/ycloud/${account.id}`, { body })).status, 401);
    assert.equal((await postEvent(body, 'wrong-secret')).status, 401);
    const crossAccount = structuredClone(body); crossAccount.whatsappInboundMessage.to = '+15550108888';
    assert.equal((await postEvent(crossAccount)).status, 422);
    assert.equal((await postEvent(body)).status, 200);
    assert.equal((await postEvent(body)).status, 200);
    const rows = await prisma.message.findMany({ where: { waMessageId: 'wamid.in-yc-1' } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sentAt.toISOString(), time);
    assert.equal(rows[0].providerCreatedAt.toISOString(), time);
    assert.equal((await prisma.message.findUnique({ where: { id: queued.id } })).status, 'cancelled');
    const { whatsappSession } = await import('../src/utils/whatsappSession.js');
    assert.equal(whatsappSession(rows, account.id).isOpen, true);
  });

  test('reply persistence and stop rules survive oversized media, and replays preserve later scheduled work', async () => {
    const lead = await prisma.lead.create({ data: { name: 'Attachment fixture', mobile: '15550100004', status: 'contacted', assignedAccount: account.id } });
    const old = await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'outbound', content: 'Old followup', status: 'queued' } });
    const body = { type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id: 'yc-large', wamid: 'wamid.yc-large', from: '+15550100004', to: phone, wabaId: waba, sendTime: new Date().toISOString(), type: 'image', image: { id: 'too-large', mime_type: 'image/png', link: `${process.env.YCLOUD_API_BASE}/whatsapp/media/download/too-large?sig=fixture` } } };
    const previousFetch = global.fetch;
    let downloads = 0;
    global.fetch = async () => { downloads++; return new Response('x', { headers: { 'Content-Length': String(33 * 1024 * 1024) } }); };
    try {
      assert.equal((await postEvent(body)).status, 200);
      const inbound = await prisma.message.findFirst({ where: { waMessageId: 'wamid.yc-large' } });
      assert.ok(inbound);
      assert.equal(inbound.providerStatusReason, 'media_unavailable');
      assert.match(inbound.content, /Attachment unavailable/);
      assert.equal((await prisma.message.findUnique({ where: { id: old.id } })).status, 'cancelled');
      const later = await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'outbound', content: 'New requested reminder', status: 'queued' } });
      assert.equal((await postEvent(body)).status, 200);
      assert.equal((await prisma.message.findUnique({ where: { id: later.id } })).status, 'queued');
      assert.equal(downloads, 1, 'a permanently oversized attachment is not retried forever');
      assert.equal(await prisma.message.count({ where: { waMessageId: 'wamid.yc-large' } }), 1);
    } finally { global.fetch = previousFetch; }
  });

  test('temporary attachment failures retry media after the reply is durable without cancelling newer work', async () => {
    const lead = await prisma.lead.create({ data: { name: 'Retry attachment fixture', mobile: '15550100005', status: 'contacted', assignedAccount: account.id } });
    const old = await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'outbound', content: 'Old followup', status: 'queued' } });
    const body = { type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id: 'yc-retry-media', wamid: 'wamid.yc-retry-media', from: '+15550100005', to: phone, wabaId: waba, sendTime: new Date().toISOString(), type: 'image', image: { id: 'retry', mime_type: 'image/png', link: `${process.env.YCLOUD_API_BASE}/whatsapp/media/download/retry?sig=fixture` } } };
    const previousFetch = global.fetch;
    const { MEDIA_DIR } = await import('../src/services/whatsappMedia.js');
    let downloads = 0;
    global.fetch = async () => ++downloads === 1 ? new Response('', { status: 503 }) : new Response('fixture-image', { headers: { 'Content-Type': 'image/png' } });
    try {
      assert.equal((await postEvent(body)).status, 503);
      assert.equal((await prisma.message.findUnique({ where: { id: old.id } })).status, 'cancelled');
      const inbound = await prisma.message.findFirst({ where: { waMessageId: 'wamid.yc-retry-media' } });
      assert.equal(inbound.providerStatusReason, 'media_pending_retry');
      const later = await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'outbound', content: 'New reminder', status: 'queued' } });
      const existingFiles = fs.readdirSync(MEDIA_DIR).sort();
      await prisma.$executeRaw`CREATE TRIGGER fixture_block_attachment
        BEFORE UPDATE OF mediaUrl ON Message WHEN NEW.mediaUrl IS NOT NULL
        BEGIN SELECT RAISE(ABORT, 'Synthetic database write failure'); END`;
      try {
        assert.equal((await postEvent(body)).status, 503);
        assert.deepEqual(fs.readdirSync(MEDIA_DIR).sort(), existingFiles, 'a failed database update discards its downloaded file');
      } finally {
        await prisma.$executeRaw`DROP TRIGGER fixture_block_attachment`;
      }
      assert.equal((await postEvent(body)).status, 200);
      const completed = await prisma.message.findUnique({ where: { id: inbound.id } });
      assert.ok(completed.mediaUrl);
      assert.equal(completed.providerStatusReason, null);
      assert.equal((await prisma.message.findUnique({ where: { id: later.id } })).status, 'queued');
      fs.unlinkSync(path.join(__dirname, '..', completed.mediaUrl));
    } finally { global.fetch = previousFetch; }
  });

  test('concurrent signed replays keep one attached file and remove losing downloads', async () => {
    const { MEDIA_DIR } = await import('../src/services/whatsappMedia.js');
    const lead = await prisma.lead.create({ data: {
      name: 'Concurrent attachment fixture', mobile: '15550100007', status: 'replied',
    } });
    const messageId = 'wamid.yc-media-race';
    const inbound = await prisma.message.create({ data: {
      leadId: lead.id, direction: 'inbound', channel: 'whatsapp', status: 'received',
      waAccount: account.id, waMessageId: messageId, idempotencyKey: `ycloud-inbound:${messageId}`,
      content: 'Concurrent attachment fixture',
    } });
    const event = { type: 'whatsapp.inbound_message.received', whatsappInboundMessage: {
      wamid: messageId, from: '+15550100007', to: phone, wabaId: waba,
      sendTime: new Date().toISOString(), type: 'image', image: {
        id: 'fixture-race', mime_type: 'image/png',
        link: `${process.env.YCLOUD_API_BASE}/whatsapp/media/download/fixture-race?sig=fixture`,
      },
    } };
    const initialFiles = new Set(fs.readdirSync(MEDIA_DIR));
    const newFiles = () => fs.readdirSync(MEDIA_DIR).filter(file => !initialFiles.has(file));
    const previousFetch = global.fetch;
    const gate = Promise.withResolvers();
    const timeout = setTimeout(gate.resolve, 5_000);
    let downloads = 0;
    global.fetch = async () => {
      if (++downloads === 2) gate.resolve();
      await gate.promise;
      return new Response('Concurrent synthetic attachment');
    };
    try {
      const results = await Promise.all([postEvent(event), postEvent(event)]);
      assert.equal(downloads, 2, 'both requests overlapped while the attachment was missing');
      assert.deepEqual(results.map(result => result.status), [200, 200]);
      const saved = await prisma.message.findUnique({ where: { id: inbound.id } });
      assert.ok(saved.mediaUrl);
      assert.equal(saved.providerStatusReason, null);
      assert.deepEqual(newFiles(), [path.basename(saved.mediaUrl)]);
    } finally {
      clearTimeout(timeout);
      global.fetch = previousFetch;
      for (const file of newFiles()) fs.unlinkSync(path.join(MEDIA_DIR, file));
    }
  });

  test('retains early receipts, deduplicates replays and never downgrades read delivery', async () => {
    const body = { type: 'whatsapp.message.updated', createTime: new Date().toISOString(), whatsappMessage: { id: 'yc-early', from: phone, wabaId: waba, status: 'read', pricingCategory: 'marketing', totalPrice: 0.01 } };
    assert.equal((await postEvent(body)).status, 200);
    assert.equal((await postEvent(body)).status, 200);
    assert.equal(await prisma.whatsAppReceipt.count({ where: { waMessageId: 'yc-early', accountId: account.id } }), 1);
    const lead = await prisma.lead.create({ data: { name: 'Receipt fixture', mobile: '15550100003' } });
    const row = await prisma.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'outbound', content: 'Fixture', status: 'sending', waAccount: account.id, waMessageId: 'yc-early' } });
    const { reconcileMetaReceipts } = await import('../src/services/whatsappDelivery.js');
    await reconcileMetaReceipts('yc-early', account.id);
    const late = structuredClone(body); late.whatsappMessage.status = 'failed'; late.whatsappMessage.errorCode = '131042';
    assert.equal((await postEvent(late)).status, 200);
    const final = await prisma.message.findUnique({ where: { id: row.id } });
    assert.equal(final.status, 'read');
    assert.equal(final.ackStatus, 3);
    assert.equal(final.billable, true);
  });

  test('downloads signed provider media without credentials and rejects arbitrary URLs', async () => {
    const { downloadYCloudInboundMedia } = await import('../src/services/whatsappMedia.js');
    const media = { type: 'image', image: { id: 'fixture-media', mime_type: 'image/png', sha256: crypto.createHash('sha256').update('fixture-image').digest('base64'), link: `${process.env.YCLOUD_API_BASE}/whatsapp/media/download/fixture-media?sig=fixture&payload=fixture` } };
    const stored = await downloadYCloudInboundMedia(media);
    assert.equal(calls.at(-1).key, undefined);
    const target = path.join(__dirname, '..', stored.mediaUrl);
    assert.equal(fs.readFileSync(target).toString(), 'fixture-image');
    fs.unlinkSync(target);
    assert.equal(new URL(calls.at(-1).url, 'http://fixture.test').pathname, '/v2/whatsapp/media/download/fixture-media');
    media.image.sha256 = 'incorrect-checksum';
    await assert.rejects(downloadYCloudInboundMedia(media), /checksum/);
    media.image.link = 'http://127.0.0.1/private';
    await assert.rejects(downloadYCloudInboundMedia(media), /untrusted/);
    media.image.link = `${process.env.YCLOUD_API_BASE}/whatsapp/media/download/other-id?sig=fixture`;
    await assert.rejects(downloadYCloudInboundMedia(media), /untrusted/);
  });
});

describe('Free bulk email verification and send protection', () => {
  let prisma, verifier, previousLookup, previousEnabled;
  const headers = () => ({ ...authHeader(), 'X-Forwarded-For': '192.0.2.217' });
  before(async () => {
    ({ default: prisma } = await import('../src/utils/prismaClient.js'));
    ({ default: verifier } = await import('../src/services/emailVerification.js'));
    previousLookup = verifier.lookupMx;
    previousEnabled = process.env.EMAIL_VERIFICATION_ENABLED;
    verifier.lookupMx = async domain => {
      if (domain.startsWith('blocked.')) return [{ exchange: '.', priority: 0 }];
      if (domain.startsWith('unknown.')) throw Object.assign(new Error('fixture'), { code: 'ETIMEOUT' });
      return [{ exchange: `mx.${domain}`, priority: 10 }];
    };
    verifier.domains.clear();
    process.env.EMAIL_VERIFICATION_ENABLED = 'true';
  });
  after(() => {
    verifier.lookupMx = previousLookup; verifier.domains.clear();
    if (previousEnabled === undefined) delete process.env.EMAIL_VERIFICATION_ENABLED;
    else process.env.EMAIL_VERIFICATION_ENABLED = previousEnabled;
  });
  test('requires authentication and rejects ambiguous or oversized requests', async () => {
    assert.equal((await request('GET', '/api/email/verification/jobs', { headers: { 'X-Forwarded-For': '192.0.2.218' } })).status, 401);
    for (const body of [{}, { allLeads: true, emails: ['a@example.test'] }, { leadIds: ['bad'] }, { emails: [null] }]) {
      assert.equal((await request('POST', '/api/email/verification/jobs', { headers: headers(), body })).status, 400);
    }
  });
  test('runs durable deduplicated batches, keeps unknown separate and retains historical batch results', async () => {
    const beforeMessages = await prisma.message.count();
    const created = await request('POST', '/api/email/verification/jobs', { headers: headers(), body: {
      emails: ['ready@verification.example.test', 'READY@verification.example.test', 'bad@blocked.example.test', 'no@unknown.example.test', 'not-an-address'],
    } });
    assert.equal(created.status, 202);
    assert.equal(created.body.total, 4);
    assert.equal(created.body.emails, undefined, 'job summaries never return the complete private input list');
    let job;
    for (let n = 0; n < 100; n++) {
      job = await prisma.emailVerificationJob.findUnique({ where: { id: created.body.id } });
      if (job.status === 'completed' || job.status === 'failed') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(job.status, 'completed');
    assert.deepEqual(JSON.parse(job.counts), { ready: 1, invalid: 2, unknown: 1 });
    const detail = await request('GET', `/api/email/verification/jobs/${job.id}`, { headers: headers() });
    assert.equal(detail.body.results.length, 4);
    assert.equal(detail.body.results.every(result => result.mailboxVerified === false), true);
    await prisma.emailVerification.update({ where: { email: 'ready@verification.example.test' }, data: { result: JSON.stringify({ status: 'invalid', reason: 'fixture-new-check' }) } });
    const historical = await request('GET', `/api/email/verification/jobs/${job.id}`, { headers: headers() });
    assert.equal(historical.body.results.find(result => result.email === 'ready@verification.example.test').status, 'ready');
    assert.equal(await prisma.message.count(), beforeMessages, 'verification does not queue or send mail');
  });
  test('cache and DNS concurrency stay bounded across unique addresses', async () => {
    let active = 0, peak = 0, calls = 0;
    verifier.domains.clear();
    const lookup = verifier.lookupMx;
    verifier.lookupMx = async domain => {
      calls++; active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 3));
      active--; return [{ exchange: `mx.${domain}` }];
    };
    try {
      await Promise.all(Array.from({ length: 24 }, (_, n) => verifier.verify(`owner@concurrency${n}.example.test`)));
      assert.ok(peak <= 8);
      await verifier.verify('owner@concurrency0.example.test');
      assert.equal(calls, 24, 'fresh durable address results are reused');
      await verifier.verify('another@concurrency0.example.test');
      assert.equal(calls, 24, 'addresses on one domain share DNS work');
    } finally { verifier.lookupMx = lookup; verifier.domains.clear(); }
  });
  test('invalid To, CC and BCC stop sales delivery before sender quota or provider calls', async () => {
    const { default: email } = await import('../src/services/emailService.js');
    const lead = await prisma.lead.create({ data: { name: 'Verification fixture', mobile: 'no-phone:verify-fixture', email: 'to@blocked.send.example.test' } });
    const account = await prisma.emailAccount.create({ data: { name: 'Verifier sender fixture', email: 'sender@example.test', provider: 'brevo', enabled: true, smtpHost: 'api.brevo.test', smtpUser: 'fixture', smtpPass: 'fixture' } });
    const oldRequest = email._brevoRequest;
    let sends = 0;
    email._brevoRequest = async () => { sends++; return { messageId: 'fixture-message' }; };
    try {
      const send = extra => email.sendEmail({ leadId: lead.id, accountId: account.id, subject: 'Fixture', body: 'Fixture only', ...extra });
      await assert.rejects(send({}), error => error.code === 'email_verification_required');
      await prisma.lead.update({ where: { id: lead.id }, data: { email: 'to@allowed.send.example.test' } });
      await assert.rejects(send({ cc: 'CC <cc@blocked.send.example.test>' }), error => error.code === 'email_verification_required');
      await assert.rejects(send({ bcc: 'hidden@unknown.send.example.test' }), error => error.code === 'email_verification_required');
      assert.equal(sends, 0);
      assert.equal((await prisma.emailAccount.findUnique({ where: { id: account.id } })).sentToday, 0);
    } finally { email._brevoRequest = oldRequest; }
  });
  test('protected email previews and dispatch exclude unchecked, expired and invalid addresses without affecting WhatsApp', async () => {
    const { default: campaigns } = await import('../src/services/campaignEngine.js');
    const tag = 'verification-audience-fixture';
    const leads = [];
    for (const [n, email] of ['ready@audience.example.test', 'bad@blocked.audience.example.test', 'unchecked@audience.example.test', 'expired@audience.example.test'].entries()) {
      leads.push(await prisma.lead.create({ data: { name: `Audience fixture ${n}`, mobile: `1555020000${n}`, email, tags: tag, emailMarketingConsent: true } }));
    }
    await verifier.verify(leads[0].email); await verifier.verify(leads[1].email); await verifier.verify(leads[3].email);
    await prisma.emailVerification.update({ where: { email: leads[3].email }, data: { expiresAt: new Date(0) } });
    const emailAudience = await campaigns.getMatchingLeads({ tags: [tag] }, null, 'email');
    assert.deepEqual(emailAudience.map(lead => lead.id), [leads[0].id]);
    assert.equal((await campaigns.getMatchingLeads({ tags: [tag] }, null, 'whatsapp')).length, 4);
  });

  test('bulk provider campaigns fail before creating provider contacts or sending invalid audiences', async () => {
    const { default: marketing } = await import('../src/services/brevoMarketingCampaigns.js');
    const template = { id: 9, name: 'Verification fixture', subject: 'Hi {{name}}', htmlBody: '<p>{{product}}</p><a href="{{ unsubscribe }}">Unsubscribe</a>', textBody: 'Hi {{name}}' };
    await assert.rejects(marketing.dispatchDailyBatch({ date: '2026-10-29', template, countries: ['US'],
      allocations: [{ lead: { email: 'buyer@blocked.bulk.example.test', country: 'US' }, account: { id: 999 } }], validateRecipients: async () => true }),
    error => error.code === 'email_verification_required');
  });
});

describe('IndiaMART signed source boundary', () => {
  test('source readiness is authenticated, exact-page intake stays non-sending, and fresh enquiry email queues once', async () => {
    const { default: db } = await import('../src/utils/prismaClient.js');
    const { default: fresh } = await import('../src/services/freshLeadOutreach.js');
    const source = await db.webhookSource.create({ data: { source: 'indiamart_live', name: 'Page-restricted fixture', apiKey: 'fixture-page-private-key' } });
    const supplier = await db.supplier.create({ data: { name: 'Page fixture supplier', matchTag: 'page-fixture' } });
    const wa = await db.whatsAppAccount.create({ data: { name: 'Page fixture WA', phone: '15555550991', enabled: true } });
    const email = await db.emailAccount.create({ data: { name: 'Page fixture email', email: 'sender@page.example.test', smtpHost: 'smtp.example.test', smtpUser: 'fixture', smtpPass: 'fixture', whatsappAccountId: wa.id } });
    const prior = await db.systemConfig.findUnique({ where: { key: 'indiamart.livePolicy' } });
    const endpoint = '/api/webhooks/indiamart/indiamart_live';
    const headers = { 'x-api-key': source.apiKey, 'X-Forwarded-For': '192.0.2.218' };
    const target = 'https://seller.indiamart.com/blproduct/mypurchasedbl?disp=D';
    const fixtureIds = [];
    try {
      await db.webhookSource.update({ where: { id: source.id }, data: { importSupplierId: supplier.id, importTags: 'page-fixture' } });
      const policy = { sourceId: source.id, sellerId: '10001', enabled: false, armedAt: null, requireExactPage: true,
        enableAfterBaseline: false, whatsappAccountId: wa.id, emailAccountId: email.id, templateName: 'fixture_approved_template' };
      await db.systemConfig.upsert({ where: { key: 'indiamart.livePolicy' }, create: { key: 'indiamart.livePolicy', value: JSON.stringify(policy) }, update: { value: JSON.stringify(policy) } });
      assert.equal((await request('GET', endpoint+'/status', { headers: { 'X-Forwarded-For': '192.0.2.218' } })).status, 401);
      assert.equal((await request('GET', endpoint+'/status', { headers: { ...headers, 'x-api-key': 'wrong' } })).status, 401);
      const readiness = await request('GET', endpoint+'/status', { headers });
      assert.equal(readiness.status, 200); assert.equal(readiness.body.targetUrl, target);
      assert.equal(readiness.body.senderPairConfigured, true); assert.equal(readiness.body.emailFrom, email.email);
      assert.equal(readiness.body.enabled, false); assert.ok(!JSON.stringify(readiness.body).includes(source.apiKey));
      const row = { externalId: '990000001', acquiredAt: new Date().toISOString(), name: 'Page Fixture Buyer', email: 'buyer@page.example.test', product: 'Fixture product', quantity: '2 boxes' };
      const body = { sourceUrl: target, sellerId: '10001', mode: 'baseline', records: [row] };
      assert.equal((await request('POST', endpoint, { headers, body: { ...body, sourceUrl: 'https://seller.indiamart.com/' } })).status, 422);
      assert.equal(await db.connectorReceipt.count({ where: { sourceId: source.id } }), 0);
      const baseline = await request('POST', endpoint, { headers, body });
      assert.equal(baseline.status, 200); assert.equal(baseline.body.automationEnabled, false);
      const baselineLead = await db.lead.findUnique({ where: { id: baseline.body.results[0].leadId } }); fixtureIds.push(baselineLead.id);
      assert.equal(baselineLead.status, 'paused'); assert.match(baselineLead.mobile, /^no-phone:/);
      assert.equal(await db.message.count({ where: { leadId: baselineLead.id } }), 0);
      const lead = await db.lead.create({ data: { name: 'Fresh Fixture Buyer', mobile: 'no-phone:fresh-page-fixture', source: 'indiamart_live', email: 'fresh@page.example.test', product: 'Fixture product', quantity: '2 boxes', country: 'Spain' } });
      fixtureIds.push(lead.id);
      await fresh.queue(lead, { channels: ['email'], emailAccountId: email.id });
      await fresh.queue(lead, { channels: ['email'], emailAccountId: email.id });
      const messages = await db.message.findMany({ where: { leadId: lead.id } });
      assert.equal(messages.length, 1); assert.equal(messages[0].status, 'queued');
      assert.equal(messages[0].emailAccountId, email.id);
      assert.equal(messages[0].emailSubject, 'Your IndiaMART enquiry: Fixture product');
      assert.match(messages[0].content, /noted your requested quantity as 2 boxes/);
      assert.doesNotMatch(messages[0].content, /still need|contacted us earlier/i);
    } finally {
      await db.connectorReceipt.deleteMany({ where: { sourceId: source.id } });
      await db.lead.deleteMany({ where: { id: { in: fixtureIds } } });
      if (prior) await db.systemConfig.update({ where: { key: prior.key }, data: { value: prior.value } });
      else await db.systemConfig.deleteMany({ where: { key: 'indiamart.livePolicy' } });
      await db.webhookSource.delete({ where: { id: source.id } });
      await db.emailAccount.delete({ where: { id: email.id } });
      await db.whatsAppAccount.delete({ where: { id: wa.id } });
      await db.supplier.delete({ where: { id: supplier.id } });
    }
  });
  test('source credentials are required for purchases and health reports; status contains no source secret', async () => {
    const { default: db } = await import('../src/utils/prismaClient.js');
    const source = await db.webhookSource.create({ data: { source: 'indiamart_live', name: 'Fixture IndiaMART', apiKey: 'fixture-private-intake-key' } });
    const post = (suffix, key, body) => request('POST', `/api/webhooks/indiamart/indiamart_live${suffix}`, { body, headers: { 'x-api-key': key, 'X-Forwarded-For': '192.0.2.219' } });
    assert.equal((await post('', 'wrong-key', {})).status, 401);
    assert.equal((await post('/health', 'wrong-key', { state: 'ready' })).status, 401);
    assert.equal((await post('', source.apiKey, { records: [] })).status, 422);
    assert.equal((await post('/health', source.apiKey, { state: 'needs_attention', error: 'Sign-in required', lastCheck: null })).status, 200);
    assert.equal((await post('/health', source.apiKey, { state: 'invalid' })).status, 422);
    assert.equal((await post('/health', source.apiKey, { state: 'ready', localPending: -1 })).status, 422);
    assert.equal((await post('/health', source.apiKey, { state: 'ready', targetUrl: 'https://seller.indiamart.com/' })).status, 422);
    assert.equal((await post('/health', source.apiKey, { state: 'ready', mode: 'login', localPending: 0,
      targetUrl: 'https://seller.indiamart.com/blproduct/mypurchasedbl?disp=D', lastSavedScanAt: null, lastUploadAt: null })).status, 200);
    const response = await request('GET', '/api/system/status', { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.219' } });
    assert.equal(response.status, 200);
    assert.ok(!JSON.stringify(response.body).includes(source.apiKey));
    await db.webhookSource.update({ where: { id: source.id }, data: { enabled: false } });
    assert.equal((await post('/health', source.apiKey, { state: 'ready' })).status, 404);
  });
});

describe('Message interaction identity and reaction boundaries', () => {
  test('quoted WhatsApp sends preserve native targets, reject other threads and keep reactions out of reply counts', async () => {
    const { default: db } = await import('../src/utils/prismaClient.js');
    const { default: manager } = await import('../src/services/whatsapp.js');
    const { recordReaction } = await import('../src/services/messageReactions.js');
    const { recordMetaReceipt, reconcileMetaReceipts } = await import('../src/services/whatsappDelivery.js');
    const account = await db.whatsAppAccount.create({ data: { name: 'Interaction fixture', enabled: true } });
    const lead = await db.lead.create({ data: { name: 'Interaction fixture', mobile: '15550001194', assignedAccount: account.id } });
    const other = await db.lead.create({ data: { name: 'Other interaction fixture', mobile: '15550001195', assignedAccount: account.id } });
    const parent = await db.message.create({ data: { leadId: lead.id, channel: 'whatsapp', waAccount: account.id, direction: 'inbound', status: 'delivered', content: 'A fixture enquiry', waMessageId: 'wamid.INTERACTION_PARENT', sentAt: new Date() } });
    const { default: cloud } = await import('../src/services/whatsappCloudApi.js');
    const oldReaction = cloud.sendReaction;
    let reactionCalls = 0;
    cloud.sendReaction = async (_address, target, emoji, id) => { reactionCalls++; assert.equal(target, parent.waMessageId); assert.equal(emoji, '👍'); assert.equal(id, account.id); return { success: true }; };
    const oldSend = manager.sendMessage;
    const headers = { ...authHeader(), 'X-Forwarded-For': '192.0.2.204' };
    let calls = 0;
    manager.sendMessage = async (_address, _text, id, options) => { calls++; assert.equal(id, account.id); assert.equal(options.replyTo, parent.waMessageId); return { success: true, waMessageId: 'wamid.INTERACTION_REPLY' }; };
    try {
      const send = body => request('POST', '/api/inbox/send', { headers, body: { leadId: lead.id, channel: 'whatsapp', text: 'Fixture reply', replyToMessageId: parent.id, clientMessageId: 'fixture-interaction-001', ...body } });
      assert.equal((await send({ leadId: other.id })).status, 400);
      assert.equal(calls, 0);
      const response = await send({});
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.body.message.quotedMessageId, parent.id);
      assert.equal(response.body.message.quotedRemoteId, parent.waMessageId);
      assert.equal((await send({})).status, 200);
      assert.equal(calls, 1, 'same client key does not resend a quote');
      const reacted = await request('POST', `/api/inbox/threads/${lead.id}/messages/${parent.id}/reaction`, { headers, body: { emoji: '👍' } });
      assert.equal(reacted.status, 200, JSON.stringify(reacted.body));
      assert.equal(reactionCalls, 1);
      assert.equal((await request('POST', `/api/inbox/threads/${lead.id}/messages/${parent.id}/reaction`, { headers, body: { emoji: 'not-an-emoji' } })).status, 400);
      await db.messageReaction.deleteMany({ where: { accountId: account.id } });
      const before = await db.message.count({ where: { leadId: lead.id, direction: 'inbound' } });
      await recordReaction({ channel: 'whatsapp', accountId: account.id, targetId: parent.waMessageId, actorKey: 'business', emoji: '👍', eventAt: new Date('2026-11-05T02:00:00Z') });
      await recordReaction({ channel: 'whatsapp', accountId: account.id, targetId: parent.waMessageId, actorKey: 'business', emoji: '❤️', eventAt: new Date('2026-11-05T01:00:00Z') });
      const thread = await request('GET', `/api/inbox/threads/${lead.id}`, { headers });
      assert.equal(thread.status, 200);
      assert.equal(thread.body.messages.find(m => m.id === parent.id).reactions[0].emoji, '👍', 'stale events do not replace a newer reaction');
      assert.equal(thread.body.messages.find(m => m.id === response.body.message.id).replyToMessageId, parent.id);
      await recordReaction({ channel: 'whatsapp', accountId: account.id, targetId: parent.waMessageId, actorKey: 'business', emoji: '', eventAt: new Date('2026-11-05T03:00:00Z') });
      assert.equal(await db.message.count({ where: { leadId: lead.id, direction: 'inbound' } }), before);
      assert.equal((await request('POST', `/api/inbox/threads/${other.id}/messages/${parent.id}/reaction`, { headers, body: { emoji: '👍' } })).status, 409);
      await recordMetaReceipt({ accountId: account.id, waMessageId: 'ycloud-identity-fixture', nativeMessageId: 'wamid.RECEIPT_FIRST', status: 'sent' });
      const late = await db.message.create({ data: { leadId: lead.id, channel: 'whatsapp', waAccount: account.id, direction: 'outbound', status: 'sent', content: 'Fixture receipt timing', waMessageId: 'ycloud-identity-fixture' } });
      await reconcileMetaReceipts('ycloud-identity-fixture', account.id);
      assert.equal((await db.message.findUnique({ where: { id: late.id } })).providerMessageId, 'wamid.RECEIPT_FIRST');
    } finally {
      manager.sendMessage = oldSend;
      cloud.sendReaction = oldReaction;
      await db.messageReaction.deleteMany({ where: { accountId: account.id, channel: 'whatsapp' } });
      await db.lead.deleteMany({ where: { id: { in: [lead.id, other.id] } } });
      await db.whatsAppAccount.delete({ where: { id: account.id } });
    }
  });
});
