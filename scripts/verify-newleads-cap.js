// Verification: per-account newLeadsPerDay budget gating in getNextAccount.
// Asserts: (1) account with budget gets picked; (2) account at cap is skipped
// when forInitialOutreach=true but still picked for follow-ups.

import prisma from '../src/utils/prismaClient.js';
import whatsappManager from '../src/services/whatsapp.js';

const log = (...args) => console.log('[verify]', ...args);
const assert = (cond, msg) => {
  if (!cond) { console.error('❌ FAIL:', msg); process.exit(1); }
  console.log('✅', msg);
};

// Mimic an active client in memory — getNextAccount filters by isReady, and
// the real Chrome boot won't run in this script. Seeding isReady directly
// keeps the test scoped to the budget logic.
function fakeReady(accountId) {
  whatsappManager.isReady.set(accountId, true);
  whatsappManager.clients.set(accountId, { /* stub */ });
  whatsappManager.hourlySent.set(accountId, 0);
  whatsappManager.pausedUntil.set(accountId, 0);
}

async function main() {
  // Clean slate — drop any prior verify accounts.
  await prisma.whatsAppAccount.deleteMany({ where: { name: { startsWith: 'verify-newleads-' } } });

  // Two accounts: A at its cap, B with budget left.
  const accountA = await prisma.whatsAppAccount.create({
    data: {
      name: 'verify-newleads-A',
      phone: '', status: 'connected', enabled: true,
      hourlyLimit: 3, dailyLimit: 20, newLeadsPerDay: 5,
      newLeadsContactedToday: 5,   // ← at cap
      messagesSentToday: 5,
    },
  });
  const accountB = await prisma.whatsAppAccount.create({
    data: {
      name: 'verify-newleads-B',
      phone: '', status: 'connected', enabled: true,
      hourlyLimit: 3, dailyLimit: 20, newLeadsPerDay: 5,
      newLeadsContactedToday: 0,   // ← has budget
      messagesSentToday: 0,
    },
  });
  fakeReady(accountA.id);
  fakeReady(accountB.id);
  log(`Seeded A=${accountA.id} (at cap) and B=${accountB.id} (has budget)`);

  // forInitialOutreach=true should skip A and return B.
  whatsappManager._lastAccountIndex = 0;
  const pickedForInitial = await whatsappManager.getNextAccount({ forInitialOutreach: true });
  assert(pickedForInitial === accountB.id, `forInitialOutreach picks B (got ${pickedForInitial}, expected ${accountB.id})`);

  // forInitialOutreach=false should be allowed to use A (no new-lead gate for follow-ups).
  // Both A and B are eligible; round-robin advances after first pick, so test by exhausting B's
  // daily limit and confirming follow-up picker can still use A.
  await prisma.whatsAppAccount.update({
    where: { id: accountB.id },
    data: { messagesSentToday: 20 },   // ← B hit daily ceiling
  });
  whatsappManager._lastAccountIndex = 0;
  const pickedForFollowup = await whatsappManager.getNextAccount({ forInitialOutreach: false });
  assert(pickedForFollowup === accountA.id, `Follow-up picker uses A despite cap (got ${pickedForFollowup}, expected ${accountA.id})`);

  // forInitialOutreach with BOTH accounts exhausted → returns null
  await prisma.whatsAppAccount.update({
    where: { id: accountB.id },
    data: { newLeadsContactedToday: 5 },
  });
  whatsappManager._lastAccountIndex = 0;
  const exhausted = await whatsappManager.getNextAccount({ forInitialOutreach: true });
  assert(exhausted === null, `Both accounts at cap → getNextAccount returns null (got ${exhausted})`);

  // Daily reset clears the counter.
  await whatsappManager.resetDailyCounters();
  const afterReset = await prisma.whatsAppAccount.findUnique({ where: { id: accountA.id } });
  assert(afterReset.newLeadsContactedToday === 0, `Daily reset clears newLeadsContactedToday (got ${afterReset.newLeadsContactedToday})`);
  assert(afterReset.messagesSentToday === 0, `Daily reset clears messagesSentToday (got ${afterReset.messagesSentToday})`);

  // updateAccount clamps over-limit input.
  const clamped = await whatsappManager.updateAccount(accountA.id, { dailyLimit: 100, hourlyLimit: 50, newLeadsPerDay: 99 });
  assert(clamped.dailyLimit === 20, `updateAccount clamps dailyLimit to 20 (got ${clamped.dailyLimit})`);
  assert(clamped.hourlyLimit === 3, `updateAccount clamps hourlyLimit to 3 (got ${clamped.hourlyLimit})`);
  assert(clamped.newLeadsPerDay === 10, `updateAccount clamps newLeadsPerDay to 10 (got ${clamped.newLeadsPerDay})`);

  // Cleanup
  await prisma.whatsAppAccount.deleteMany({ where: { name: { startsWith: 'verify-newleads-' } } });
  log('Cleanup complete.');
  console.log('\n🎉 New-lead budget + cap assertions passed.');
  process.exit(0);
}

main().catch(err => { console.error('Verification crashed:', err); process.exit(1); });
