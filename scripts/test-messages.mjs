/**
 * Test script — generates sample messages for HOT, WARM, and COLD leads
 * and prints them to the console so you can review tone and content.
 *
 * Usage: node scripts/test-messages.mjs
 */

import { getMessage } from '../src/templates/messages.js';

const sampleLeads = {
  HOT: {
    name: 'Maninder Singh',
    product: 'Tricosilk Pro Hair Solution Minoxidil Finasteride (60ml)',
    quantity: '10 Bottle',
    strength: '5%',
    country: 'Canada',
    leadTier: 'HOT',
  },
  WARM: {
    name: 'Sabrina Rodgers',
    product: 'Stainless hex bolts M8',
    quantity: '5 Box',
    strength: '10 mg',
    country: 'United Kingdom',
    leadTier: 'WARM',
  },
  COLD: {
    name: 'Thurman Jenrette',
    product: 'Cenforce 150 Tablets',
    quantity: '300 Box',
    strength: '150 mg',
    country: 'United States Of America',
    leadTier: 'COLD',
  },
};

const emoticons = { HOT: '🔥', WARM: '♨️', COLD: '❄️' };

for (const [tier, lead] of Object.entries(sampleLeads)) {
  const maxSteps = tier === 'HOT' ? 5 : tier === 'WARM' ? 4 : 2;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${emoticons[tier]} ${tier} LEAD: ${lead.name} (${lead.country})`);
  console.log(`   Product: ${lead.product} | Qty: ${lead.quantity}`);
  console.log('═'.repeat(60));

  for (let step = 1; step <= maxSteps; step++) {
    const msg = getMessage(tier, step, lead);
    const label = step === 1 ? '📩 Initial (sent now)' :
      step === 2 ? '⏰ Follow-up 2 (4hr)' :
      step === 3 ? '⏰ Follow-up 3 (24hr)' :
      step === 4 ? '⏰ Follow-up 4 (48hr)' : '⏰ Follow-up 5 (72hr)';

    console.log(`\n${label}:`);
    if (Array.isArray(msg)) {
      msg.forEach((m, i) => console.log(`  Part ${i+1}: "${m}"`));
    } else {
      console.log(`  "${msg}"`);
    }
  }
}

console.log(`\n${'═'.repeat(60)}`);
console.log('✅ Message template test complete');
