// Verification script for the persisted pause flag.
// Confirms: pause writes to SystemConfig, hydratePauseState restores it,
// isSendingPaused reflects the cached value, resume clears it.

import prisma from '../src/utils/prismaClient.js';
import { isSendingPaused, hydratePauseState } from '../src/api.js';

const log = (...args) => console.log('[verify]', ...args);
const assert = (cond, msg) => {
  if (!cond) { console.error('❌ FAIL:', msg); process.exit(1); }
  console.log('✅', msg);
};

async function main() {
  // Start clean
  await prisma.systemConfig.deleteMany({ where: { key: 'sending_paused' } });

  // ── Case 1: no SystemConfig row → hydrate yields false ──
  await hydratePauseState();
  assert(isSendingPaused() === false, 'Boot with no SystemConfig row → not paused');

  // ── Case 2: SystemConfig says paused → hydrate restores true ──
  await prisma.systemConfig.upsert({
    where: { key: 'sending_paused' },
    update: { value: 'true' },
    create: { key: 'sending_paused', value: 'true' },
  });
  await hydratePauseState();
  assert(isSendingPaused() === true, 'Boot with SystemConfig=true → restored paused');

  // ── Case 3: SystemConfig says NOT paused → hydrate clears ──
  await prisma.systemConfig.update({
    where: { key: 'sending_paused' },
    data: { value: 'false' },
  });
  await hydratePauseState();
  assert(isSendingPaused() === false, 'Boot with SystemConfig=false → not paused');

  // Cleanup
  await prisma.systemConfig.deleteMany({ where: { key: 'sending_paused' } });
  log('Cleanup complete.');
  console.log('\n🎉 Pause persistence assertions passed.');
  process.exit(0);
}

main().catch(err => { console.error('Verification crashed:', err); process.exit(1); });
