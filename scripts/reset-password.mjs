#!/usr/bin/env node
import 'dotenv/config';

import prisma from '../src/utils/prismaClient.js';
import { hashPassword } from '../src/auth/rbac.js';
import { localPasswordError } from '../shared/localPassword.js';
import { readLocalPassword } from './read-local-password.mjs';

try {
  const [address, mode, ...extra] = process.argv.slice(2);
  const email = address?.trim().toLowerCase();
  if (!email || extra.length || (mode && !['--initial', '--status'].includes(mode))) {
    throw new Error('Usage: npm run reset-password -- <email> [--initial|--status]');
  }
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, enabled: true, passwordHash: true },
  });
  if (!user) throw new Error(`No local user with email ${email}.`);
  if (mode && (!user.enabled || user.role !== 'admin')) throw new Error('This account is not an enabled local admin.');
  if (mode === '--status') {
    console.log(user.passwordHash ? 'configured' : 'needs-password');
  } else {
    if (mode === '--initial' && user.passwordHash) throw new Error('The first password is already set. Sign in with it or use the regular reset command.');
    const password = await readLocalPassword(`New password for ${email}: `);
    const error = localPasswordError(password);
    if (error) throw new Error(error);
    const updated = await prisma.user.updateMany({
      where: { id: user.id, ...(mode === '--initial' ? { enabled: true, role: 'admin', passwordHash: '' } : {}) },
      data: { passwordHash: hashPassword(password) },
    });
    if (updated.count !== 1) throw new Error('The account changed while setting the password. Review the account and try again.');
    console.log(`Password updated for ${email}. Previous local sessions are signed out.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
