import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPrismaClient } from '../src/utils/createPrismaClient.js';
import { CampaignEngine } from '../src/services/campaignEngine.js';
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
