import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPrismaClient } from '../src/utils/createPrismaClient.js';
import { CampaignEngine } from '../src/services/campaignEngine.js';
import { CampaignScheduler, validateSchedule } from '../src/services/campaignScheduler.js';
import { campaignChannelEligibility, campaignSenderId, hasAllLeadTags } from '../src/utils/campaignAudience.js';
import { suppressedWhatsAppLeads } from '../src/services/whatsappSuppression.js';
import { classifyDeliveryFailure, retryDelayMs, statusForClass, FAILURE_CLASS } from '../src/services/deliveryFailure.js';
import { classifyError } from '../src/services/whatsappCloudApi.js';
import { recoverCampaignRuns } from '../src/services/campaignMetrics.js';

async function fixture(run, hooks = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'outbound-campaign-'));
  const filename = path.join(directory, 'fixture.db');
  const sql = new DatabaseSync(filename);
  const migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(migrations).sort()) {
    const migration = new URL(`${name}/migration.sql`, migrations);
    if (existsSync(migration)) sql.exec(readFileSync(migration, 'utf8'));
  }
  const db = createPrismaClient(`file:${filename}`);
  const calls = { email: [], whatsapp: [], imessage: [], reconcile: [] };
  const engine = new CampaignEngine({
    db, businessHours: () => hooks.businessHours !== false,
    delay: async () => hooks.delay?.({ db, calls }),
    email: {
      _getNextEmailAccount: async () => 5,
      sendEmail: async (args) => {
        calls.email.push(args);
        if (hooks.email) return hooks.email(args, { db, calls });
        await db.message.update({ where: { id: args.existingMessageId }, data: {
          status: 'sent', emailMessageId: `fixture-email-${args.existingMessageId}@example.test`,
        } });
        return { success: true, messageId: `fixture-email-${args.existingMessageId}@example.test` };
      },
    },
    whatsapp: {
      getNextAccount: async () => 8,
      sendCampaignTemplate: async (...args) => {
        calls.whatsapp.push({ kind: 'template', args });
        return hooks.whatsapp?.(...args) || { success: true, accountId: args[3], messageId: `wamid.fixture-${calls.whatsapp.length}` };
      },
      sendMessage: async (...args) => {
        calls.whatsapp.push({ kind: 'text', args });
        return hooks.whatsapp?.(...args) || { success: true, accountId: args[2], messageId: `wamid.fixture-${calls.whatsapp.length}` };
      },
    },
    imessage: { sendMessage: async (...args) => { calls.imessage.push(args); return { success: true, messageId: 'fixture-imessage', accountId: null }; } },
    reconcileReceipts: async (...args) => { calls.reconcile.push(args); await hooks.reconcile?.(...args, db); },
  });
  const createLead = (id, values = {}) => db.lead.create({ data: {
    id, name: `Fixture ${id}`, mobile: `1555777${String(id).padStart(4, '0')}`,
    email: `fixture-${id}@example.test`, ...values,
  } });
  const createCampaign = async (values = {}) => engine.createCampaign({
    name: 'Fixture campaign', messageTemplate: 'Hello {{name}}, {{product}}', channel: 'email', emailSubject: 'Fixture {{name}}', ...values,
  });
  const running = (id) => db.campaign.update({ where: { id }, data: { status: 'running' } });
  const createWa = (id) => db.whatsAppAccount.create({ data: {
    id, name: `Fixture WhatsApp ${id}`, enabled: true, cloudApiToken: 'fixture-not-a-token', cloudApiPhoneId: `fixture-phone-${id}`,
  } });
  try { await run({ db, engine, calls, createLead, createCampaign, running, createWa }); }
  finally { await db.$disconnect(); sql.close(); rmSync(directory, { recursive: true, force: true }); }
}

test('schedule validation uses absolute instants and workspace time across DST', () => {
  const hours = { start: 9, end: 18, timezone: 'Europe/London' };
  const now = new Date('2026-01-01T00:00:00Z');
  for (const scheduledAt of ['2026-03-29T08:30:00Z', '2026-10-25T09:30:00Z']) {
    assert.ok(validateSchedule({ scheduledAt, timezone: 'Europe/London' }, now, hours));
  }
  for (const scheduledAt of ['2026-03-29T07:30:00Z', '2026-10-25T08:30:00Z', '2026-03-29T09:00', 'invalid', '2025-01-01T09:00Z']) {
    assert.throws(() => validateSchedule({ scheduledAt, timezone: 'Europe/London' }, now, hours));
  }
  assert.throws(() => validateSchedule({ scheduledAt: '2026-03-29T09:30:00Z', timezone: 'Mars/Orbit' }, now, hours));
});

test('schedule requires a reviewed audience and cancel returns to editable draft', async () => fixture(async ({ db, engine, createLead, createCampaign }) => {
  const now = new Date();
  const scheduler = new CampaignScheduler({ db, engine, now: () => now, hours: () => ({ start: 0, end: 24, timezone: 'UTC' }) });
  const campaign = await createCampaign();
  const input = { scheduledAt: new Date(+now + 3600000).toISOString(), timezone: 'UTC' };
  await assert.rejects(scheduler.schedule(campaign.id, input), /Populate/);
  await createLead(1);
  await engine.populateCampaign(campaign.id);
  const scheduled = await scheduler.schedule(campaign.id, input);
  assert.equal(scheduled.status, 'scheduled');
  assert.equal(scheduled.scheduleTimezone, 'UTC');
  await assert.rejects(engine.startCampaign(campaign.id), /Cancel the schedule/);
  await scheduler.cancel(campaign.id);
  assert.equal((await db.campaign.findUnique({ where: { id: campaign.id } })).scheduledAt, null);
  await assert.rejects(scheduler.cancel(campaign.id), /Schedule changed/);
}));

test('schedule rejects changed drafts and removed recipients after a review', async () => fixture(async ({ db, engine, createLead, createCampaign }) => {
  const now = new Date();
  const scheduler = new CampaignScheduler({ db, engine, now: () => now, hours: () => ({ start: 0, end: 24, timezone: 'UTC' }) });
  const first = await createLead(1);
  await createLead(2);
  const campaign = await createCampaign();
  await engine.populateCampaign(campaign.id);
  const before = await db.campaign.findUnique({ where: { id: campaign.id } });
  const after = await db.campaign.update({ where: { id: campaign.id }, data: { messageTemplate: 'Fixture edit', updatedAt: new Date(+before.updatedAt + 1) } });
  const input = { scheduledAt: new Date(+now + 3600000).toISOString(), timezone: 'UTC' };
  await assert.rejects(scheduler.schedule(campaign.id, {
    ...input, review: { updatedAt: before.updatedAt.toISOString(), recipientCount: 2 },
  }), { statusCode: 409 });
  await db.campaignLead.deleteMany({ where: { campaignId: campaign.id, leadId: first.id } });
  await assert.rejects(scheduler.schedule(campaign.id, {
    ...input, review: { updatedAt: after.updatedAt.toISOString(), recipientCount: 2 },
  }), { statusCode: 409 });
  const scheduled = await scheduler.schedule(campaign.id, {
    ...input, review: { updatedAt: after.updatedAt.toISOString(), recipientCount: 1 },
  });
  assert.equal(scheduled.status, 'scheduled');
}));

test('two due workers claim a scheduled campaign only once; stale reschedule cannot launch', async () => fixture(async ({ db, engine, createLead, createCampaign }) => {
  const now = new Date();
  const scheduler = new CampaignScheduler({ db, engine, now: () => new Date(+now - 3600000), hours: () => ({ start: 0, end: 24, timezone: 'UTC' }) });
  const campaign = await createCampaign();
  await createLead(1); await engine.populateCampaign(campaign.id);
  const old = await scheduler.schedule(campaign.id, { scheduledAt: new Date(+now - 60000).toISOString(), timezone: 'UTC' });
  await scheduler.schedule(campaign.id, { scheduledAt: new Date(+now + 60000).toISOString(), timezone: 'UTC' });
  await assert.rejects(engine.startCampaign(campaign.id, { expectedSchedule: old }));
  await scheduler.schedule(campaign.id, { scheduledAt: new Date(+now - 60000).toISOString(), timezone: 'UTC' });
  let starts = 0;
  engine._executeCampaign = async () => { starts++ };
  scheduler.now = () => now;
  await Promise.all([scheduler.processDue(), scheduler.processDue()]);
  assert.equal(starts, 1);
  assert.equal((await db.campaign.findUnique({ where: { id: campaign.id } })).status, 'running');
}));

test('late and out-of-hours launches pause for review without sending', async () => fixture(async ({ db, engine, createLead, createCampaign, calls }) => {
  await createLead(1);
  const campaign = await createCampaign(); await engine.populateCampaign(campaign.id);
  await db.campaign.update({ where: { id: campaign.id }, data: { status: 'scheduled', scheduleTimezone: 'UTC', scheduledAt: new Date(Date.now() - 7200000) } });
  const scheduler = new CampaignScheduler({ db, engine });
  await scheduler.processDue();
  assert.match((await db.campaign.findUnique({ where: { id: campaign.id } })).scheduleError, /missed/);
  await db.campaign.update({ where: { id: campaign.id }, data: { status: 'scheduled', scheduledAt: new Date(Date.now() - 1000) } });
  engine.businessHours = () => false;
  await scheduler.processDue();
  assert.match((await db.campaign.findUnique({ where: { id: campaign.id } })).scheduleError, /Outside/);
  assert.equal(calls.email.length, 0);
}));

test('startup quarantines interrupted scheduled attempts without requeueing them', async () => fixture(async ({ db, engine, createLead, createCampaign }) => {
  const lead = await createLead(1); const campaign = await createCampaign(); await engine.populateCampaign(campaign.id);
  await db.campaign.update({ where: { id: campaign.id }, data: { status: 'running', scheduleTimezone: 'UTC', scheduledAt: new Date() } });
  await db.campaignLead.updateMany({ where: { campaignId: campaign.id }, data: { status: 'sending' } });
  await db.message.create({ data: { leadId: lead.id, campaignId: campaign.id, direction: 'outbound', channel: 'email', content: 'Fixture', status: 'sending' } });
  const scheduler = new CampaignScheduler({ db, engine, hours: () => ({ start: 0, end: 24, timezone: 'UTC' }) });
  assert.deepEqual(await scheduler.recoverInterrupted(), { paused: 1 });
  assert.equal((await db.message.findFirst({ where: { campaignId: campaign.id } })).status, 'unconfirmed');
  assert.equal((await db.campaignLead.findFirst({ where: { campaignId: campaign.id } })).status, 'failed');
  await assert.rejects(scheduler.schedule(campaign.id, { scheduledAt: new Date(Date.now() + 3600000).toISOString(), timezone: 'UTC' }), /already has send attempts/);
}));

test('a stale population request cannot add recipients to a reviewed schedule', async () => fixture(async ({ db, engine, createLead, createCampaign }) => {
  const now = new Date();
  const scheduler = new CampaignScheduler({ db, engine, now: () => now, hours: () => ({ start: 0, end: 24, timezone: 'UTC' }) });
  const first = await createLead(1);
  const campaign = await createCampaign();
  await engine.populateCampaign(campaign.id);
  const later = await createLead(2);
  engine.getAudience = async () => {
    await scheduler.schedule(campaign.id, { scheduledAt: new Date(+now + 3600000).toISOString(), timezone: 'UTC' });
    return { leads: [first, later], excludedCount: 0, exclusionCounts: {} };
  };
  await assert.rejects(engine.populateCampaign(campaign.id), /Campaign changed/);
  assert.equal(await db.campaignLead.count({ where: { campaignId: campaign.id } }), 1);
}));

test('worker ignores legacy schedule rows until they are explicitly scheduled', async () => fixture(async ({ db, engine, createCampaign }) => {
  const campaign = await createCampaign();
  await db.campaign.update({ where: { id: campaign.id }, data: { status: 'scheduled', scheduledAt: new Date(Date.now() - 1000) } });
  const scheduler = new CampaignScheduler({ db, engine });
  assert.deepEqual(await scheduler.processDue(), { checked: 0 });
  assert.equal((await db.campaign.findUnique({ where: { id: campaign.id } })).status, 'scheduled');
}));

test('provider payment refusal pauses the run and leaves later recipients pending', async () => fixture(async ({ db, engine, calls, createLead, createCampaign, createWa, running }) => {
  await createLead(1);
  await createLead(2);
  await createWa(8);
  const campaign = await createCampaign({ channel: 'whatsapp', whatsappSenderAccountId: 8, waCampaignName: 'fixture_template' });
  await engine.populateCampaign(campaign.id);
  await engine._executeCampaign(await running(campaign.id));
  const result = await db.campaign.findUnique({ where: { id: campaign.id } });
  assert.equal(result.status, 'paused');
  assert.match(result.scheduleError, /balance/);
  assert.equal(calls.whatsapp.length, 1);
  assert.equal(await db.campaignLead.count({ where: { campaignId: campaign.id, status: 'pending' } }), 1);
  const attempt = await db.message.findFirst({ where: { campaignId: campaign.id } });
  assert.equal(attempt.providerStatusReason, 'payment_issue');
}, { whatsapp: () => ({ success: false, reason: 'payment_issue', errorCode: 'BALANCE_INSUFFICIENT' }) }));

test('audience caps apply after exclusions and repeated population cannot expand the approved cap', async () => fixture(async ({ db, engine, createLead, createCampaign }) => {
  await createLead(1, { status: 'paused', score: 100 });
  await createLead(2, { score: 90 });
  await createLead(3, { score: 80 });
  const filter = { limit: 1 };
  const preview = await engine.getAudience(filter, null, 'email');
  assert.deepEqual(preview.leads.map(row => row.id), [2]);
  assert.equal(preview.limitExcludedCount, 1);
  const campaign = await createCampaign({ targetFilter: filter });
  await engine.populateCampaign(campaign.id);
  await db.lead.update({ where: { id: 2 }, data: { status: 'paused' } });
  await engine.populateCampaign(campaign.id);
  assert.equal(await db.campaignLead.count({ where: { campaignId: campaign.id } }), 1);
  assert.equal((await db.campaignLead.findFirst({ where: { campaignId: campaign.id } })).leadId, 2);
}));

test('default-sender audience suppression follows each lead assignment', async () => fixture(async ({ db, engine, createLead, createCampaign, createWa }) => {
  await createWa(8); await createWa(9);
  await createLead(1, { assignedAccount: 9 });
  await createLead(2, { assignedAccount: 8 });
  for (const leadId of [1,2]) await db.message.create({ data: { leadId, direction: 'outbound', channel: 'whatsapp', waAccount: 8,
    content: 'Fixture opt-out', status: 'failed', providerErrorCode: '131050' } });
  const preview=await engine.getAudience({},null,'whatsapp');
  assert.deepEqual(preview.leads.map(row=>row.id),[1]);
  const campaign=await createCampaign({channel:'whatsapp',waCampaignName:'fixture_approved'});
  await engine.populateCampaign(campaign.id);
  assert.deepEqual((await db.campaignLead.findMany({where:{campaignId:campaign.id}})).map(row=>row.leadId),[1]);
}));

test('receipt opt-outs suppress previews and live dispatch only for the affected WhatsApp sender', async () => fixture(async ({ db, engine, calls, createLead, createCampaign, createWa, running }) => {
  await createWa(8); await createWa(9);
  await createLead(1);
  const campaign = await createCampaign({ channel: 'whatsapp', waCampaignName: 'fixture_approved', whatsappSenderAccountId: 8 });
  await engine.populateCampaign(campaign.id);
  const message = await db.message.create({ data: { leadId: 1, direction: 'outbound', channel: 'whatsapp', waAccount: 8,
    waMessageId: 'fixture-optout', content: 'Fixture only', status: 'failed' } });
  await db.whatsAppReceipt.create({ data: { eventKey: 'fixture-optout', accountId: 8, waMessageId: message.waMessageId, status: 'failed', failureCode: 131050 } });
  // Even a later read must not erase the immutable opt-out evidence.
  await db.message.update({ where: { id: message.id }, data: { status: 'read', providerErrorCode: null } });
  assert.deepEqual([...(await suppressedWhatsAppLeads(db, [1], 8))], [1]);
  assert.equal((await suppressedWhatsAppLeads(db, [1], 9)).size, 0);
  const preview = await engine.getAudience({}, null, 'whatsapp', 8);
  assert.equal(preview.leads.length, 0);
  assert.equal(preview.exclusionCounts['whatsapp:whatsapp_marketing_opted_out'], 1);
  assert.equal((await engine.getAudience({}, null, 'email')).leads.length, 1);
  await running(campaign.id); await engine._executeCampaign(campaign);
  assert.equal(calls.whatsapp.length, 0);
  assert.equal((await db.campaignLead.findFirst({ where: { campaignId: campaign.id } })).skipReason, 'whatsapp:whatsapp_marketing_opted_out');
}));

test('campaign persists template parameters before provider I/O and advances outbound activity', async () => fixture(async ({ db, engine, createLead, createCampaign, createWa, running }) => {
  await createWa(8); await createLead(1, { name: 'Fixture Person', country: 'Australia', mobile: '61400000001' });
  const campaign = await createCampaign({ channel: 'whatsapp', waCampaignName: 'fixture_approved', whatsappSenderAccountId: 8 });
  engine.whatsapp.sendCampaignTemplate = async () => {
    const staged = await db.message.findFirst({ where: { campaignId: campaign.id } });
    assert.equal(staged.status, 'sending');
    assert.equal(staged.waCampaignName, 'fixture_approved');
    assert.deepEqual(JSON.parse(staged.waTemplateParams), ['Fixture', 'Australia']);
    return { success: true, accountId: 8, messageId: 'fixture-envelope' };
  };
  await engine.populateCampaign(campaign.id); await running(campaign.id); await engine._executeCampaign(campaign);
  const row = await db.message.findFirst({ where: { campaignId: campaign.id } });
  assert.equal(row.waCampaignName, 'fixture_approved');
  assert.deepEqual(JSON.parse(row.waTemplateParams), ['Fixture', 'Australia']);
  const lead = await db.lead.findUnique({ where: { id: 1 } });
  assert.ok(lead.lastMessageAt >= row.sentAt);
}));

test('campaign metrics keep replies in accepted totals and surface asynchronous delivery failures', async () => fixture(async ({ db, engine, createLead, createCampaign }) => {
  await createLead(1); await createLead(2);
  const campaign = await createCampaign(); await engine.populateCampaign(campaign.id);
  await db.campaignLead.updateMany({ where: { campaignId: campaign.id }, data: { status: 'replied', sentAt: new Date() } });
  await db.message.create({ data: { leadId: 1, campaignId: campaign.id, direction: 'outbound', channel: 'whatsapp', content: 'Fixture', status: 'failed', sentAt: new Date() } });
  await db.message.create({ data: { leadId: 2, campaignId: campaign.id, direction: 'outbound', channel: 'whatsapp', content: 'Fixture', status: 'read', sentAt: new Date() } });
  const result = await engine.getCampaign(campaign.id);
  assert.equal(result.sentCount, 2); assert.equal(result.failedCount, 1);
  assert.equal(result.delivery.delivered, 1); assert.equal(result.delivery.read, 1);
  assert.equal(result.variantACount, 2);
}));

test('launch outside sending hours fails before changing campaign state', async () => fixture(async ({ db, engine, createLead, createCampaign, calls }) => {
  await createLead(1); const campaign = await createCampaign(); await engine.populateCampaign(campaign.id);
  await assert.rejects(engine.startCampaign(campaign.id), error => error.statusCode === 409 && error.reason === 'outside_business_hours');
  assert.equal((await db.campaign.findUnique({ where: { id: campaign.id } })).status, 'draft');
  assert.equal(calls.email.length, 0);
}, { businessHours: false }));

test('restart pauses claimed campaign work and an explicit resume never redispatches uncertain attempts', async () => fixture(async ({ db, engine, createLead, createCampaign, createWa, calls, running }) => {
  await createWa(8); await createLead(1);
  const campaign = await createCampaign({ channel: 'whatsapp', waCampaignName: 'fixture_approved', whatsappSenderAccountId: 8 });
  await engine.populateCampaign(campaign.id); await running(campaign.id);
  await db.campaignLead.updateMany({ where: { campaignId: campaign.id }, data: { status: 'sending' } });
  const message = await db.message.create({ data: { leadId: 1, campaignId: campaign.id, direction: 'outbound', channel: 'whatsapp', content: 'Fixture', status: 'sending' } });
  assert.deepEqual(await recoverCampaignRuns(db), { paused: 1 });
  assert.equal((await db.message.findUnique({ where: { id: message.id } })).status, 'unconfirmed');
  assert.equal((await db.campaign.findUnique({ where: { id: campaign.id } })).status, 'paused');
  await running(campaign.id); await engine._executeCampaign(campaign);
  assert.equal(calls.whatsapp.length, 0);
}));

test('campaign phone validation rejects structural country mismatches without breaking BSUID recipients', () => {
  for (const [country, mobile] of [['United Kingdom', '123456'], ['UK', '44123456789012'], ['Australia', '6161000000000']]) {
    assert.equal(campaignChannelEligibility({ status: 'new', country, mobile }, 'whatsapp').reason, 'whatsapp_invalid_number');
  }
  for (const [country, mobile] of [['United Kingdom', '447000000001'], ['Australia', '61400000001']]) {
    assert.equal(campaignChannelEligibility({ status: 'new', country, mobile }, 'whatsapp').eligible, true);
  }
  assert.equal(campaignChannelEligibility({ status: 'new', country: 'Australia', mobile: 'no-phone:fixture', waUserId: 'AU.fixture123' }, 'whatsapp').eligible, true);
});

test('campaign tags use case-insensitive whole tokens and all requested tags', () => {
  assert.equal(hasAllLeadTags(' bulk, UK-Retail ', 'uk'), false);
  assert.equal(hasAllLeadTags('bulk, UK, retail', ['uk', ' RETAIL ']), true);
  assert.equal(hasAllLeadTags('uk', 'uk,retail'), false);
  assert.equal(hasAllLeadTags(null, null), true);
});

test('channel eligibility does not confuse WhatsApp reachability with other channels', () => {
  const lead = { status: 'wa_unavailable', mobile: '15557770001', email: 'fixture@example.test', isOnWhatsApp: false };
  assert.equal(campaignChannelEligibility(lead, 'email').eligible, true);
  assert.equal(campaignChannelEligibility(lead, 'imessage').eligible, true);
  assert.equal(campaignChannelEligibility(lead, 'whatsapp').eligible, false);
  assert.equal(campaignChannelEligibility({ ...lead, emailOptOut: true }, 'email').reason, 'email_opted_out');
  for (const emailStatus of ['bounced', 'complained', 'unsubscribed', 'suppressed']) {
    assert.equal(campaignChannelEligibility({ ...lead, emailStatus }, 'email').reason, `email_${emailStatus}`);
  }
  assert.equal(campaignChannelEligibility({ ...lead, mobile: 'no-phone:fixture' }, 'imessage').eligible, false);
  assert.equal(campaignChannelEligibility({ ...lead, status: 'paused' }, 'email').eligible, false);
  assert.equal(campaignChannelEligibility({ ...lead, status: 'new', repliedAt: new Date() }, 'email').eligible, false);
  assert.equal(campaignChannelEligibility({ status: 'new', mobile: 'no-phone:fixture', waUserId: 'US.fixture123' }, 'whatsapp').eligible, true);
});

test('campaign sender selectors keep legacy mixed-channel email IDs out of WhatsApp', () => {
  assert.equal(campaignSenderId({ channel: 'both', senderAccountId: 5 }, 'email'), 5);
  assert.equal(campaignSenderId({ channel: 'both', senderAccountId: 5 }, 'whatsapp'), null);
  assert.equal(campaignSenderId({ channel: 'whatsapp', senderAccountId: 5 }, 'whatsapp'), 5);
  assert.equal(campaignSenderId({ channel: 'both', senderAccountId: 5, emailSenderAccountId: 6, whatsappSenderAccountId: 8 }, 'email'), 6);
  assert.equal(campaignSenderId({ channel: 'both', senderAccountId: 5, whatsappSenderAccountId: 8 }, 'whatsapp'), 8);
});

test('audience preview and population include email-only contacts and remain idempotent', async () => fixture(async ({ db, engine, createLead, createCampaign }) => {
  const emailOnly = await createLead(1, { mobile: 'no-phone:fixture', isOnWhatsApp: false, tags: 'uk' });
  await createLead(2, { tags: 'bulk' });
  await createLead(3, { tags: 'uk-retail' });
  await createLead(4, { tags: 'uk', emailOptOut: true });
  await createLead(5, { tags: 'UK', status: 'paused' });
  const filter = { tags: ' UK ' };
  const preview = await engine.getAudience(filter, null, 'email');
  assert.deepEqual(preview.leads.map((lead) => lead.id), [emailOnly.id]);
  assert.equal(preview.matchedCount, 3);
  assert.equal(preview.excludedCount, 2);
  assert.deepEqual(preview.exclusionCounts, { 'email:email_opted_out': 1, 'email:lead_paused': 1 });
  const both = await engine.getAudience(filter, null, 'both');
  assert.equal(both.leads.length, 2);
  assert.equal(both.excludedCount, 1);
  assert.deepEqual(both.exclusionCounts, { 'email:lead_paused': 1, 'whatsapp:lead_paused': 1 });
  assert.equal((await engine.getMatchingLeads(filter, null, 'whatsapp')).length, 1, 'email opt-out alone does not suppress WhatsApp');
  const campaign = await createCampaign({ targetFilter: filter });
  assert.deepEqual(await engine.populateCampaign(campaign.id), { added: 1, total: 1, excludedCount: 2, exclusionCounts: { 'email:email_opted_out': 1, 'email:lead_paused': 1 } });
  assert.deepEqual(await engine.populateCampaign(campaign.id), { added: 0, total: 1, excludedCount: 2, exclusionCounts: { 'email:email_opted_out': 1, 'email:lead_paused': 1 } });
  assert.equal((await db.campaign.findUnique({ where: { id: campaign.id } })).totalLeads, 1);
  assert.equal(await db.campaignLead.count({ where: { campaignId: campaign.id } }), 1);
}));

test('approved WhatsApp template round-trips and accepted provider IDs reconcile early receipts', async () => fixture(async ({ db, engine, calls, createLead, createCampaign, running, createWa }) => {
  await createWa(8);
  await createLead(1);
  const campaign = await createCampaign({ channel: 'whatsapp', waCampaignName: ' fixture_approved ', whatsappSenderAccountId: 8 });
  assert.equal(campaign.waCampaignName, 'fixture_approved');
  assert.equal(campaign.whatsappSenderAccountId, 8);
  await engine.populateCampaign(campaign.id);
  await running(campaign.id);
  await engine._executeCampaign(campaign);
  assert.equal(calls.whatsapp.length, 1);
  assert.equal(calls.whatsapp[0].kind, 'template');
  assert.equal(calls.whatsapp[0].args[1], 'fixture_approved');
  const message = await db.message.findFirst({ where: { campaignId: campaign.id } });
  assert.equal(message.waMessageId, 'wamid.fixture-1');
  assert.deepEqual(calls.reconcile, [[message.waMessageId, 8]]);
  assert.equal(message.status, 'read', 'reconciled delivery must not regress to sent');
}, { reconcile: async (messageId, accountId, db) => {
  const message = await db.message.findFirst({ where: { waMessageId: messageId, waAccount: accountId } });
  assert.ok(message, 'provider ID and sender must be durable before receipt replay');
  await db.message.update({ where: { id: message.id }, data: { status: 'read', ackStatus: 3 } });
} }));

test('free-text WhatsApp campaigns require an account-scoped open customer window', async () => fixture(async ({ db, engine, calls, createLead, createCampaign, running, createWa }) => {
  await createWa(8);
  await createLead(1);
  const campaign = await createCampaign({ channel: 'whatsapp', whatsappSenderAccountId: 8 });
  await engine.populateCampaign(campaign.id);
  await running(campaign.id);
  await engine._executeCampaign(campaign);
  assert.equal(calls.whatsapp.length, 0);
  const recipient = await db.campaignLead.findFirst({ where: { campaignId: campaign.id } });
  assert.equal(recipient.status, 'skipped');
  assert.equal(recipient.skipReason, 'whatsapp:re_engagement_required');
}));

test('live reply or pause while earlier recipients wait prevents every later provider request', async () => {
  for (const status of ['replied', 'paused', 'closed']) {
    await fixture(async ({ db, engine, calls, createLead, createCampaign, running }) => {
      await createLead(1);
      await createLead(2);
      const campaign = await createCampaign();
      await engine.populateCampaign(campaign.id);
      await running(campaign.id);
      await engine._executeCampaign(campaign);
      assert.equal(calls.email.length, 1, status);
      const recipient = await db.campaignLead.findFirst({ where: { campaignId: campaign.id, leadId: 2 } });
      assert.equal(recipient.status, 'skipped', status);
      assert.equal(recipient.skipReason, `email:lead_${status}`);
    }, { delay: async ({ db }) => db.lead.update({ where: { id: 2 }, data: { status } }) });
  }
});

test('mixed campaigns send independent channels once and use typed senders', async () => fixture(async ({ db, engine, calls, createLead, createCampaign, running, createWa }) => {
  await createWa(5);
  await createWa(8);
  await createLead(1);
  const campaign = await createCampaign({ channel: 'both', senderAccountId: 5, emailSenderAccountId: 6,
    whatsappSenderAccountId: 8, waCampaignName: 'fixture_approved' });
  await engine.populateCampaign(campaign.id);
  await running(campaign.id);
  await engine._executeCampaign(campaign);
  assert.equal(calls.email[0].accountId, 6);
  assert.equal(calls.whatsapp[0].args[3], 8);
  const recipients = await db.campaignLead.findMany({ where: { campaignId: campaign.id } });
  assert.equal(recipients.length, 1);
  assert.equal(recipients[0].status, 'sent');
  const after = await db.campaign.findUnique({ where: { id: campaign.id } });
  assert.equal(after.sentCount, 1, 'a both-channel recipient counts once');
  const messages = await db.message.findMany({ where: { campaignId: campaign.id } });
  assert.deepEqual(messages.map((message) => message.channel).sort(), ['email', 'whatsapp']);
  assert.ok(messages.every((message) => message.status === 'sent'));
  await db.campaignLead.update({ where: { id: recipients[0].id }, data: { status: 'pending' } });
  await running(campaign.id);
  await engine._executeCampaign(campaign);
  assert.equal(calls.email.length, 1, 'accepted email is not resent after resume');
  assert.equal(calls.whatsapp.length, 1, 'accepted WhatsApp is not resent after resume');
}));

test('a reply after the email leg suppresses the WhatsApp leg of the same recipient', async () => fixture(async ({ db, engine, calls, createLead, createCampaign, running, createWa }) => {
  await createWa(8);
  await createLead(1);
  const campaign = await createCampaign({ channel: 'both', waCampaignName: 'fixture_approved' });
  await engine.populateCampaign(campaign.id);
  await running(campaign.id);
  await engine._executeCampaign(campaign);
  assert.equal(calls.email.length, 1);
  assert.equal(calls.whatsapp.length, 0);
  const lead = await db.lead.findUnique({ where: { id: 1 } });
  assert.equal(lead.status, 'replied');
  const recipient = await db.campaignLead.findFirst({ where: { campaignId: campaign.id } });
  assert.equal(recipient.status, 'sent');
  assert.equal(recipient.skipReason, 'whatsapp:lead_replied');
}, { delay: async ({ db }) => db.lead.update({ where: { id: 1 }, data: { status: 'replied', repliedAt: new Date() } }) }));

test('unconfirmed WhatsApp sends remain visible and never resend on a resumed claim', async () => fixture(async ({ db, engine, calls, createLead, createCampaign, running, createWa }) => {
  await createWa(8);
  await createLead(1);
  const campaign = await createCampaign({ channel: 'whatsapp', waCampaignName: 'fixture_approved' });
  await engine.populateCampaign(campaign.id);
  await running(campaign.id);
  await engine._executeCampaign(campaign);
  const message = await db.message.findFirst({ where: { campaignId: campaign.id } });
  assert.equal(message.status, 'unconfirmed');
  const recipient = await db.campaignLead.findFirst({ where: { campaignId: campaign.id } });
  await db.campaignLead.update({ where: { id: recipient.id }, data: { status: 'pending' } });
  await running(campaign.id);
  await engine._executeCampaign(campaign);
  assert.equal(calls.whatsapp.length, 1);
}, { whatsapp: () => ({ success: false, reason: 'timeout' }) }));

test('closed business hours release the pending recipient without a provider request', async () => fixture(async ({ db, engine, calls, createLead, createCampaign, running }) => {
  await createLead(1);
  const campaign = await createCampaign();
  await engine.populateCampaign(campaign.id);
  await running(campaign.id);
  await engine._executeCampaign(campaign);
  assert.equal(calls.email.length, 0);
  assert.equal((await db.campaignLead.findFirst({ where: { campaignId: campaign.id } })).status, 'pending');
  assert.equal((await db.campaign.findUnique({ where: { id: campaign.id } })).status, 'paused');
}, { businessHours: false }));


test('preview explains replied-owner exclusion without altering campaign protections', async () => fixture(async ({ engine, createLead, createCampaign }) => {
  const lead = await createLead(1, { status: 'new', repliedAt: new Date(), tags: 'owner_qa', maxFollowups: 0, emailMarketingConsent: false });
  const result = await engine.getAudience({ tags: 'owner_qa' }, null, 'whatsapp');
  assert.equal(result.matchedCount, 1);
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.exclusionCounts, { 'whatsapp:customer_replied': 1 });
  assert.equal(result.excludedSample[0].id, lead.id);
  const campaign = await createCampaign({ channel: 'whatsapp', targetFilter: { tags: 'owner_qa' } });
  assert.equal((await engine.populateCampaign(campaign.id)).total, 0);
  await assert.rejects(engine.getAudience({ poolId: 1 }, null, 'whatsapp'), error => error.statusCode === 400);
}));

test('stale receipt cleanup preserves pauses, disabled followups, replies and newer delivery evidence', async () => fixture(async ({ db, createLead }) => {
  const { reapStaleWhatsAppMessages } = await import('../src/services/undeliveredReaper.js');
  const old = new Date(Date.now() - 5 * 3600000);
  const cases = [{ status: 'paused' }, { maxFollowups: 0 }, {}, {}, {}, {}, { repliedAt: new Date() }];
  for (let i = 0; i < cases.length; i++) {
    await createLead(i + 1, { status: 'contacted', isOnWhatsApp: true, maxFollowups: 3, ...cases[i] });
    await db.message.create({ data: { leadId: i + 1, direction: 'outbound', channel: 'whatsapp', content: 'Fixture initial', status: i === 2 ? 'failed' : 'sent', sentAt: old, createdAt: old } });
  }
  await db.message.create({ data: { leadId: 4, direction: 'outbound', content: 'Fixture delivered', status: 'read', ackStatus: 3 } });
  await db.message.create({ data: { leadId: 5, direction: 'inbound', content: 'Fixture reply', status: 'delivered' } });
  const queued = await db.message.create({ data: { leadId: 6, direction: 'outbound', channel: 'whatsapp', content: 'Fixture followup', status: 'queued', createdAt: old } });
  const changed = await reapStaleWhatsAppMessages(db);
  assert.deepEqual(changed.map(lead => lead.id), [6]);
  assert.equal((await db.message.findUnique({ where: { id: queued.id } })).status, 'cancelled');
  assert.equal(changed[0].isOnWhatsApp, true, 'missing receipt must not mark a number unavailable');
  assert.equal((await db.lead.findUnique({ where: { id: 1 } })).status, 'paused');
  assert.equal((await db.lead.findUnique({ where: { id: 2 } })).maxFollowups, 0);
  await db.lead.update({ where: { id: 6 }, data: { status: 'paused' } });
  assert.deepEqual(await reapStaleWhatsAppMessages(db), []);
}));

test('stale receipt cleanup cannot overwrite a pause made after selection', async () => fixture(async ({ db, createLead }) => {
  const { reapStaleWhatsAppMessages } = await import('../src/services/undeliveredReaper.js');
  await createLead(1, { status: 'contacted', maxFollowups: 3 });
  await db.message.create({ data: { leadId: 1, direction: 'outbound', content: 'Fixture initial', status: 'sent', sentAt: new Date(Date.now() - 5 * 3600000) } });
  const raced = { $transaction: (...args) => db.$transaction(...args), message: { findMany: async args => {
    const candidates = await db.message.findMany(args);
    await db.lead.update({ where: { id: 1 }, data: { status: 'paused' } });
    return candidates;
  } } };
  assert.deepEqual(await reapStaleWhatsAppMessages(raced), []);
  assert.equal((await db.lead.findUnique({ where: { id: 1 } })).status, 'paused');
}));


test('pair throttling is temporary, explicit marketing opt-outs are not, and marketing retry backoff cannot undershoot 24h', () => {
  assert.equal(classifyDeliveryFailure({ errorCode: '131056' }).retryable, true);
  assert.equal(classifyDeliveryFailure({ errorCode: '131050' }).retryable, false);
  for (let i = 0; i < 100; i++) assert.ok(retryDelayMs(1, '131049') >= 24 * 3600000);
});

test('an unpaid balance is billing, never authentication, and never the recipient\'s fault', () => {
  // Meta can deliver the payment-issue code over HTTP 403; reading the status
  // first used to report it as auth_failed and skip the campaign billing pause.
  assert.equal(classifyError(403, 131042, 'Business eligibility payment issue'), 'payment_issue');
  assert.equal(classifyError(403, undefined, 'Forbidden'), 'auth_failed');
  assert.equal(classifyError(400, 190, 'Access token has expired'), 'auth_failed');

  const billing = classifyDeliveryFailure({ errorCode: '131042' });
  assert.equal(billing.cls, FAILURE_CLASS.BILLING);
  assert.equal(billing.retryable, false);
  assert.equal(statusForClass(billing.cls), 'failed');
});

test('a country marketing pause is policy, a per-recipient limit stays retryable', () => {
  const pausePraise = 'Marketing messages to United States phone numbers are currently paused';
  assert.equal(classifyError(400, 131049, pausePraise), 'marketing_country_restricted');
  assert.equal(classifyError(400, 131049, 'not delivered to maintain healthy ecosystem engagement'), 'marketing_limit');

  const paused = classifyDeliveryFailure({ errorCode: '131049', detail: pausePraise });
  assert.equal(paused.cls, FAILURE_CLASS.POLICY);
  assert.equal(paused.retryable, false);
  assert.equal(statusForClass(paused.cls), 'failed');
  // The sync path's stored reason token alone is enough to re-classify.
  assert.equal(classifyDeliveryFailure({ reason: 'marketing_country_restricted' }).cls, FAILURE_CLASS.POLICY);

  assert.equal(classifyDeliveryFailure({ errorCode: '131049' }).retryable, true);
  const experiment = classifyDeliveryFailure({ errorCode: '130472' });
  assert.equal(experiment.retryable, true);
  for (let i = 0; i < 100; i++) assert.ok(retryDelayMs(1, '130472') >= 24 * 3600000);
});

test('a temporary pair limit cannot become durable campaign suppression', async () => fixture(async ({ db, engine, createLead }) => {
  await createLead(1);
  await db.message.create({ data: { leadId: 1, direction: 'outbound', channel: 'whatsapp', waAccount: 8,
    waMessageId: 'fixture-pair-limit', content: 'Fixture only', status: 'failed', providerErrorCode: '131056' } });
  await db.whatsAppReceipt.create({ data: { eventKey: 'fixture-pair-limit', accountId: 8, waMessageId: 'fixture-pair-limit', status: 'failed', failureCode: 131056 } });
  assert.equal((await suppressedWhatsAppLeads(db, [1], 8)).size, 0);
  assert.equal((await engine.getAudience({}, null, 'whatsapp', 8)).leads.length, 1);
}));

test('synchronous template rejection retains provider diagnostics and explicit opt-outs block the next campaign', async () => fixture(async ({ db, engine, createLead, createCampaign, createWa, running }) => {
  await createWa(8); await createLead(1);
  const campaign = await createCampaign({ channel: 'whatsapp', waCampaignName: 'fixture_approved', whatsappSenderAccountId: 8 });
  await engine.populateCampaign(campaign.id); await running(campaign.id); await engine._executeCampaign(campaign);
  const message = await db.message.findFirst({ where: { campaignId: campaign.id } });
  assert.equal(message.providerErrorCode, '131050'); assert.equal(message.providerRequestId, 'fixture-request');
  assert.equal((await engine.getAudience({}, null, 'whatsapp', 8)).leads.length, 0);
}, { whatsapp: () => ({ success: false, reason: 'whatsapp_marketing_opted_out', errorCode: '131050', error: 'Synthetic opt-out', requestId: 'fixture-request' }) }));

test('reply received during the send delay retains attribution and cannot be overwritten by completion', async () => fixture(async ({ db, engine, createLead, createCampaign, running }) => {
  await createLead(1);
  const campaign = await createCampaign(); await engine.populateCampaign(campaign.id); await running(campaign.id);
  await engine._executeCampaign(campaign);
  const recipient = await db.campaignLead.findFirst({ where: { campaignId: campaign.id } });
  assert.equal(recipient.status, 'replied');
  assert.ok(recipient.sentAt);
  const result = await engine.getCampaign(campaign.id);
  assert.equal(result.sentCount, 1); assert.equal(result.replyCount, 1);
}, { delay: async ({ db }) => {
  const recipient = await db.campaignLead.findFirst();
  assert.equal(recipient.status, 'sent', 'acceptance must be visible before waiting');
  await db.campaignLead.update({ where: { id: recipient.id }, data: { status: 'replied' } });
  await db.campaign.update({ where: { id: recipient.campaignId }, data: { replyCount: { increment: 1 } } });
} }));

test('restart recovers a claimed recipient even when the operator paused its campaign before the crash', async () => fixture(async ({ db, createLead, createCampaign, engine }) => {
  await createLead(1); const campaign = await createCampaign(); await engine.populateCampaign(campaign.id);
  await db.campaign.update({ where: { id: campaign.id }, data: { status: 'paused' } });
  await db.campaignLead.updateMany({ where: { campaignId: campaign.id }, data: { status: 'sending' } });
  const message = await db.message.create({ data: { leadId: 1, campaignId: campaign.id, direction: 'outbound', channel: 'email', content: 'Synthetic', status: 'sending' } });
  await recoverCampaignRuns(db);
  assert.equal((await db.campaignLead.findFirst({ where: { campaignId: campaign.id } })).status, 'pending');
  assert.equal((await db.message.findUnique({ where: { id: message.id } })).status, 'unconfirmed');
  assert.equal((await db.campaign.findUnique({ where: { id: campaign.id } })).status, 'paused');
}));

test('legacy overpopulated drafts cannot bypass the launch cap', async () => fixture(async ({ db, createLead, createCampaign, engine, calls }) => {
  await createLead(1); await createLead(2);
  const campaign = await createCampaign({ targetFilter: { limit: 1 } });
  for (const leadId of [1, 2]) await db.campaignLead.create({ data: { campaignId: campaign.id, leadId } });
  await assert.rejects(engine.startCampaign(campaign.id), error => error.reason === 'audience_limit_exceeded');
  assert.equal((await db.campaign.findUnique({ where: { id: campaign.id } })).status, 'draft');
  assert.equal(calls.email.length, 0);
}));

test('audience edits made during population cannot silently select a stale country', async () => fixture(async ({ db, createLead, createCampaign, engine }) => {
  await createLead(1, { country: 'Australia' });
  const campaign = await createCampaign({ targetFilter: { country: 'Australia' } });
  const original = engine.getAudience.bind(engine);
  engine.getAudience = async (...args) => {
    const result = await original(...args);
    await db.campaign.update({ where: { id: campaign.id }, data: { targetFilter: JSON.stringify({ country: 'United Kingdom' }) } });
    return result;
  };
  await assert.rejects(engine.populateCampaign(campaign.id), error => error.statusCode === 409);
  assert.equal(await db.campaignLead.count({ where: { campaignId: campaign.id } }), 0);
}));


test('completion preserves the original acceptance time rather than the end of the send delay', async () => fixture(async ({ db, engine, createLead, createCampaign, running }) => {
  await createLead(1); const campaign = await createCampaign(); await engine.populateCampaign(campaign.id); await running(campaign.id);
  let acceptedAt;
  engine.delay = async () => { acceptedAt = (await db.campaignLead.findFirst()).sentAt; await new Promise(resolve => setTimeout(resolve, 15)); };
  await engine._executeCampaign(campaign);
  assert.equal((await db.campaignLead.findFirst()).sentAt.getTime(), acceptedAt.getTime());
}));
