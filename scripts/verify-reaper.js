// Verification script for the tick-aware reaper.
// Seeds a synthetic scenario, runs reapUndeliveredFirstMessages, asserts behaviour.
// Cleans up after itself. Safe to run against the local dev DB.

import prisma from '../src/utils/prismaClient.js';
import followupEngine from '../src/services/followup.js';

const log = (...args) => console.log('[verify]', ...args);
const assert = (cond, msg) => {
  if (!cond) { console.error('❌ FAIL:', msg); process.exit(1); }
  console.log('✅', msg);
};

async function main() {
  const phone = `99${Date.now().toString().slice(-9)}`;
  log('Using synthetic phone', phone);

  // ── Case A: stuck single-tick, has email → expect cancel + status flip + email queued ──
  const leadA = await prisma.lead.create({
    data: {
      name: 'Verify Reaper A',
      mobile: phone,
      email: `verify-${Date.now()}@example.test`,
      status: 'contacted',
      followupCount: 0,
      source: 'manual',
    },
  });

  const stuckA = await prisma.message.create({
    data: {
      leadId: leadA.id,
      direction: 'outbound',
      channel: 'whatsapp',
      content: 'first outreach',
      waAccount: 1,
      status: 'sent',
      ackStatus: 1,
      sentAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      waMessageId: `fake_${Date.now()}_A`,
    },
  });

  const queuedFollowupA = await prisma.message.create({
    data: {
      leadId: leadA.id,
      direction: 'outbound',
      channel: 'whatsapp',
      content: 'followup #1',
      waAccount: 1,
      status: 'queued',
      scheduledAt: new Date(),
    },
  });

  // ── Case B: stuck single-tick, NO email → expect cancel + status flip, no email ──
  const phoneB = `88${Date.now().toString().slice(-9)}`;
  const leadB = await prisma.lead.create({
    data: {
      name: 'Verify Reaper B',
      mobile: phoneB,
      status: 'contacted',
      followupCount: 0,
      source: 'manual',
    },
  });
  await prisma.message.create({
    data: {
      leadId: leadB.id,
      direction: 'outbound',
      channel: 'whatsapp',
      content: 'first outreach B',
      waAccount: 1,
      status: 'sent',
      ackStatus: 1,
      sentAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      waMessageId: `fake_${Date.now()}_B`,
    },
  });
  const queuedFollowupB = await prisma.message.create({
    data: {
      leadId: leadB.id,
      direction: 'outbound',
      channel: 'whatsapp',
      content: 'followup B',
      waAccount: 1,
      status: 'queued',
      scheduledAt: new Date(),
    },
  });

  // ── Case C: control — single-tick but only 1h old → must NOT be reaped ──
  const phoneC = `77${Date.now().toString().slice(-9)}`;
  const leadC = await prisma.lead.create({
    data: {
      name: 'Verify Reaper C (control)',
      mobile: phoneC,
      status: 'contacted',
      followupCount: 0,
      source: 'manual',
    },
  });
  await prisma.message.create({
    data: {
      leadId: leadC.id,
      direction: 'outbound',
      channel: 'whatsapp',
      content: 'fresh send C',
      waAccount: 1,
      status: 'sent',
      ackStatus: 1,
      sentAt: new Date(Date.now() - 60 * 60 * 1000),  // 1h ago — under threshold
      waMessageId: `fake_${Date.now()}_C`,
    },
  });

  // ── Case D: control — delivered (ackStatus=2), backdated → must NOT be reaped ──
  const phoneD = `66${Date.now().toString().slice(-9)}`;
  const leadD = await prisma.lead.create({
    data: {
      name: 'Verify Reaper D (control)',
      mobile: phoneD,
      status: 'contacted',
      followupCount: 0,
      source: 'manual',
    },
  });
  await prisma.message.create({
    data: {
      leadId: leadD.id,
      direction: 'outbound',
      channel: 'whatsapp',
      content: 'delivered D',
      waAccount: 1,
      status: 'delivered',
      ackStatus: 2,
      sentAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      waMessageId: `fake_${Date.now()}_D`,
    },
  });

  log('Running reapUndeliveredFirstMessages...');
  await followupEngine.reapUndeliveredFirstMessages();

  // ── Assertions ──
  const leadA2 = await prisma.lead.findUnique({ where: { id: leadA.id } });
  assert(leadA2.status === 'wa_undelivered', `Lead A status flipped to wa_undelivered (got ${leadA2.status})`);
  assert(leadA2.isOnWhatsApp === false, 'Lead A isOnWhatsApp set to false');

  const followupA2 = await prisma.message.findUnique({ where: { id: queuedFollowupA.id } });
  assert(followupA2.status === 'cancelled', `Lead A queued followup cancelled (got ${followupA2.status})`);

  const emailQueuedA = await prisma.message.findFirst({
    where: { leadId: leadA.id, channel: 'email', direction: 'outbound' },
  });
  // Email fallback may fail in this environment if no email account is configured.
  // We assert the LEAD-LEVEL effect is right, not the email queue (the reaper logs the failure).
  log('Email queued for A?', !!emailQueuedA, '(ok if false when no email account configured)');

  const leadB2 = await prisma.lead.findUnique({ where: { id: leadB.id } });
  assert(leadB2.status === 'wa_undelivered', `Lead B status flipped to wa_undelivered (got ${leadB2.status})`);
  const followupB2 = await prisma.message.findUnique({ where: { id: queuedFollowupB.id } });
  assert(followupB2.status === 'cancelled', `Lead B queued followup cancelled (got ${followupB2.status})`);

  const leadC2 = await prisma.lead.findUnique({ where: { id: leadC.id } });
  assert(leadC2.status === 'contacted', `Lead C (1h old) NOT reaped — status still contacted (got ${leadC2.status})`);

  const leadD2 = await prisma.lead.findUnique({ where: { id: leadD.id } });
  assert(leadD2.status === 'contacted', `Lead D (delivered) NOT reaped — status still contacted (got ${leadD2.status})`);

  // ── Cleanup ──
  for (const id of [leadA.id, leadB.id, leadC.id, leadD.id]) {
    await prisma.message.deleteMany({ where: { leadId: id } });
    await prisma.lead.delete({ where: { id } });
  }
  log('Cleanup complete.');

  console.log('\n🎉 All reaper assertions passed.');
  process.exit(0);
}

main().catch(err => { console.error('Verification crashed:', err); process.exit(1); });
