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
import { execSync } from 'node:child_process';
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

    // Push schema to test DB. The package script performs this outside the
    // Node test runner on macOS, where Prisma's schema engine is more reliable.
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
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
        source: "indiamart",
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
});

// ── System Health ────────────────────────────────────────────────────────────

describe('System endpoints', () => {
  test('GET /api/system/health returns health info', async () => {
    const res = await request('GET', '/api/system/health', { headers: authHeader() });
    assert.equal(res.status, 200);
    assert.ok(res.body.cpu !== undefined || res.body.status !== undefined);
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

  test('repairs legacy daily delivery mode instead of choosing transactional email', async () => {
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
    assert.equal(res.body.reason, 'exactly_two_campaign_senders_required');

    const mode = await prisma.systemConfig.findUnique({ where: { key: 'email.daily.delivery_mode' } });
    const messagesAfter = await prisma.message.count({ where: { channel: 'email' } });
    assert.equal(mode.value, 'brevo_marketing');
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

  test('a disabled user is locked out even with a valid token', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const ok = await request('POST', '/api/auth/login', { body: { email, password } });
    await prisma.user.update({ where: { email }, data: { enabled: false } });
    const me = await request('GET', '/api/auth/me', { headers: { Authorization: `Bearer ${ok.body.token}` } });
    assert.equal(me.status, 401);
    await prisma.user.update({ where: { email }, data: { enabled: true } });
  });

  test('changing a password needs the current one', async () => {
    const ok = await request('POST', '/api/auth/login', { body: { email, password } });
    const headers = { Authorization: `Bearer ${ok.body.token}` };
    const bad = await request('POST', '/api/auth/change-password', {
      headers, body: { currentPassword: 'nope', newPassword: 'a much longer new password' },
    });
    assert.equal(bad.status, 401);
    const good = await request('POST', '/api/auth/change-password', {
      headers, body: { currentPassword: password, newPassword: 'a much longer new password' },
    });
    assert.equal(good.status, 200);
    const relogin = await request('POST', '/api/auth/login', { body: { email, password: 'a much longer new password' } });
    assert.equal(relogin.status, 200);
  });

  test('the live-updates stream accepts the token in its URL, and only that route does', async () => {
    const ok = await request('POST', '/api/auth/login', { body: { email, password: 'a much longer new password' } });
    const token = encodeURIComponent(ok.body.token);
    const stream = await new Promise((resolve, reject) => {
      const req = http.get(new URL(`/api/events?token=${token}`, baseUrl), (res) => {
        resolve(res.statusCode);
        res.destroy();
      });
      req.on('error', reject);
    });
    assert.equal(stream, 200);
    const elsewhere = await request('GET', `/api/leads?token=${token}`);
    assert.equal(elsewhere.status, 401);
  });

  test('rejects requests with no session', async () => {
    const res = await request('GET', '/api/leads');
    assert.equal(res.status, 401);
  });
});

// ── Website form submissions ─────────────────────────────────────────────────

describe('Lead webhook from a plain HTML form', () => {
  test('accepts a form-encoded post and creates the lead', async () => {
    const source = await request('POST', '/api/webhooks/sources/from-preset', {
      headers: authHeader(),
      body: { presetId: 'website', name: 'Contact form' },
    });
    assert.equal(source.status, 200);
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
      },
    });
    assert.equal(save.status, 200);
    assert.equal(save.body.BUSINESS_NAME, 'Harbor Supply Co.');
    assert.equal(save.body.DEFAULT_COUNTRY_CODE, '44');
    assert.equal(save.body.NOT_A_FIELD, undefined);

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

