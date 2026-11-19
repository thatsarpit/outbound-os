#!/usr/bin/env node
import 'dotenv/config';

import prisma from '../src/utils/prismaClient.js';
import { hashPassword } from '../src/auth/rbac.js';
import { localPasswordError } from '../shared/localPassword.js';
import { readLocalPassword } from './read-local-password.mjs';

try {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run reset-password -- <email>');
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No local user with email ${email}.`);
  const password = await readLocalPassword(`New password for ${email}: `);
  const error = localPasswordError(password);
  if (error) throw new Error(error);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password) } });
  console.log(`Password updated for ${email}. Previous local sessions are signed out.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
