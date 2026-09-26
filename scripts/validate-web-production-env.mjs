#!/usr/bin/env node

const publishableKey = String(process.env.VITE_CLERK_PUBLISHABLE_KEY || '').trim();
const problems = [];

if (!publishableKey) {
  problems.push('VITE_CLERK_PUBLISHABLE_KEY is missing');
} else if (!publishableKey.startsWith('pk_live_')) {
  problems.push('VITE_CLERK_PUBLISHABLE_KEY must use a Clerk production key (pk_live_)');
}

if (problems.length > 0) {
  console.error('Production web build blocked:');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error('Use `npm run build` for local development builds.');
  process.exit(1);
}

console.log('Production web environment validated (Clerk live key detected).');
