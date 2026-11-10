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
  engine.getMatchingLeads = async () => {
    await scheduler.schedule(campaign.id, { scheduledAt: new Date(+now + 3600000).toISOString(), timezone: 'UTC' });
    return [first, later];
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
  assert.deepEqual((await engine.getMatchingLeads(filter, null, 'email')).map((lead) => lead.id), [emailOnly.id]);
  assert.equal((await engine.getMatchingLeads(filter, null, 'whatsapp')).length, 1, 'email opt-out alone does not suppress WhatsApp');
  const campaign = await createCampaign({ targetFilter: filter });
  assert.deepEqual(await engine.populateCampaign(campaign.id), { added: 1, total: 1 });
  assert.deepEqual(await engine.populateCampaign(campaign.id), { added: 0, total: 1 });
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
