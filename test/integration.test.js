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
    assert.equal(res.body.reason, 'campaign_senders_required');

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
        data: { name: 'Media number', provider: 'meta', cloudApiPhoneId: 'PNID-MEDIA', enabled: true },
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
            from: '15551230099', from_user_id: 'US.55512300990001', id: 'wamid.PHOTO-IN-1', timestamp: '1790000500',
            type: 'image', image: { id: 'media-photo-1', mime_type: 'image/jpeg' },
          }],
        } }] }],
      };
      await deliver(payload);
      const inbound = await prisma.message.findFirst({ where: { waMessageId: 'wamid.PHOTO-IN-1', direction: 'inbound' } });
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

      // 4. Outside the 24-hour window the error says what to do.
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
        status: 'sent', waMessageId: 'wamid.PRICED-1',
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
  test('AiSensy webhook is closed until a secret is set', async () => {
    const fake = { topic: 'message.sender.user', data: { message: { phone_number: '15550002222', message_content: { text: 'fake reply' } } } };
    const res = await request('POST', '/webhook/whatsapp-cloud', { body: fake });
    assert.equal(res.status, 401);
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

    const photos = await prisma.message.findMany({ where: { leadId: lead.id, direction: 'inbound' } });
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
      cloudApiToken: cloudApi.encryptToken('test-template-account-token'),
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

  test('reports invalid IDs, unknown accounts, AiSensy and missing WABA clearly', async () => {
    const { default: prisma } = await import('../src/utils/prismaClient.js');
    const aisensy = await prisma.whatsAppAccount.create({ data: { name: 'AiSensy template test', provider: 'aisensy' } });
    const meta = await prisma.whatsAppAccount.create({ data: { name: 'Missing WABA template test', provider: 'meta' } });
    try {
      const get = (id) => request('GET', `/api/whatsapp/accounts/${id}/templates`, { headers: { ...authHeader(), 'X-Forwarded-For': '192.0.2.60' } });
      assert.equal((await get('1abc')).status, 400);
      assert.equal((await get(999999999)).status, 404);
      const unsupported = await get(aisensy.id);
      assert.equal(unsupported.status, 422);
      assert.match(unsupported.body.error, /AiSensy/);
      const missing = await get(meta.id);
      assert.equal(missing.status, 422);
      assert.match(missing.body.error, /Business Account ID/);
    } finally {
      await prisma.whatsAppAccount.deleteMany({ where: { id: { in: [aisensy.id, meta.id] } } });
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
    const input = { date: '2026-10-12', account, leads: [lead], state: { campaignId: 123, sentAt: '2026-10-12T01:00:00Z' } };
    await campaigns._recordAcceptedCampaign(input);
    await campaigns._recordAcceptedCampaign(input);
    assert.equal(await prisma.message.count({ where: { leadId: lead.id } }), 1);
    assert.equal((await prisma.emailAccount.findUnique({ where: { id: account.id } })).sentToday, 1);
  } finally {
    await prisma.message.deleteMany({ where: { leadId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
    await prisma.emailAccount.delete({ where: { id: account.id } });
    await prisma.systemConfig.deleteMany({ where: { key: { startsWith: `email.daily.brevo.batch.2026-10-12.${account.id}` } } });
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
    assert.equal(inbound.emailAccountId, accounts[1].id);
    assert.equal((await prisma.emailAccount.findUnique({ where: { id: accounts[0].id } })).lastSyncAt.getTime(), before.getTime());
    assert.equal(await prisma.message.count({ where: { leadId: lead.id, status: 'queued' } }), 0);
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'replied');
    brokenDownload = false;
    await email.syncInbox(accounts[0].id);
    await email.syncInbox(accounts[0].id);
    inbound = await prisma.message.findUnique({ where: { id: inbound.id } });
    assert.equal(inbound.status, 'delivered');
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
