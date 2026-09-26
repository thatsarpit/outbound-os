#!/usr/bin/env node
/**
 * Reset a dashboard user's password.
 *
 * Reads the new password from stdin rather than argv so it never lands in
 * shell history or a process listing.
 *
 *   node scripts/reset-password.mjs admin@example.com
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from './../src/auth/rbac.js';
import readline from 'node:readline';

const email = process.argv[2];
if (!email) {
  console.error('usage: node scripts/reset-password.mjs <email>');
  process.exit(1);
}

const prisma = new PrismaClient();
const user = await prisma.user.findFirst({ where: { email } });
if (!user) {
  console.error(`No user with email ${email}`);
  await prisma.$disconnect();
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

// Hide the typed characters.
const mute = () => { rl.output.write = () => {}; };
process.stdout.write(`New password for ${email}: `);
mute();
const pw = (await ask('')).trim();
rl.close();
process.stdout.write('\n');

if (pw.length < 8) {
  console.error('Password must be at least 8 characters.');
  await prisma.$disconnect();
  process.exit(1);
}

await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(pw) } });
console.log(`Password updated for ${email} (${user.role}).`);
await prisma.$disconnect();
