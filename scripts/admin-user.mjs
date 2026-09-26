#!/usr/bin/env node
import 'dotenv/config';

import prisma from '../src/utils/prismaClient.js';
import { hashPassword } from '../src/auth/rbac.js';

const VALID_ROLES = new Set(['admin', 'manager', 'agent', 'viewer']);

function parseArgs(argv) {
  const parsed = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      parsed._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function deriveName(email) {
  const localPart = normalizeEmail(email).split('@')[0] || 'workspace-admin';
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ') || 'Workspace Admin';
}

function resolveRole(args, fallback = 'agent') {
  const requestedRole = String(args.role || '').trim().toLowerCase();
  if (requestedRole) {
    if (!VALID_ROLES.has(requestedRole)) {
      throw new Error(`Invalid role "${requestedRole}". Use one of: ${Array.from(VALID_ROLES).join(', ')}`);
    }
    return requestedRole;
  }

  if (args.admin) return 'admin';
  return fallback;
}

function resolveEnabled(args, fallback = true) {
  if (args.enable) return true;
  if (args.disable) return false;
  return fallback;
}

function usage() {
  console.log(`
Usage:
  node scripts/admin-user.mjs list
  node scripts/admin-user.mjs upsert --email <email> [--password <password>] [--name <name>] [--role <role>] [--enable|--disable] [--set-report-recipient] [--dry-run]

Examples:
  node scripts/admin-user.mjs list
  node scripts/admin-user.mjs upsert --email admin@example.com --password "..." --name "Admin" --role admin --set-report-recipient
  node scripts/admin-user.mjs upsert --email ops@example.com --password "..." --admin
`);
}

async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      enabled: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  if (users.length === 0) {
    console.log('No users found.');
    return;
  }

  console.table(users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    enabled: user.enabled,
    lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : '',
    createdAt: new Date(user.createdAt).toISOString(),
  })));
}

async function upsertUser(args) {
  const email = normalizeEmail(args.email);
  if (!email) throw new Error('Missing required --email');

  const existing = await prisma.user.findUnique({ where: { email } });
  const role = resolveRole(args, existing?.role || 'agent');
  const enabled = resolveEnabled(args, existing?.enabled ?? true);
  const name = String(args.name || args['full-name'] || existing?.name || deriveName(email)).trim();
  const password = String(args.password || '');

  if (!existing && !password) {
    throw new Error('Creating a new user requires --password');
  }

  const nextValues = {
    email,
    name,
    role,
    enabled,
    willResetPassword: Boolean(password),
    setReportRecipient: Boolean(args['set-report-recipient']),
  };

  if (args['dry-run']) {
    console.log(JSON.stringify({
      mode: existing ? 'update' : 'create',
      existing: existing ? {
        id: existing.id,
        email: existing.email,
        name: existing.name,
        role: existing.role,
        enabled: existing.enabled,
      } : null,
      next: nextValues,
    }, null, 2));
    return;
  }

  const data = { name, role, enabled };
  if (password) data.passwordHash = hashPassword(password);

  const user = existing
    ? await prisma.user.update({
      where: { id: existing.id },
      data,
      select: { id: true, email: true, name: true, role: true, enabled: true, lastLoginAt: true },
    })
    : await prisma.user.create({
      data: { email, ...data, passwordHash: hashPassword(password) },
      select: { id: true, email: true, name: true, role: true, enabled: true, lastLoginAt: true },
    });

  if (args['set-report-recipient']) {
    await prisma.systemConfig.upsert({
      where: { key: 'reports.admin_email' },
      update: { value: email },
      create: { key: 'reports.admin_email', value: email },
    });
  }

  console.log(JSON.stringify({
    mode: existing ? 'updated' : 'created',
    user,
    reportRecipient: args['set-report-recipient'] ? email : undefined,
  }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'list';

  if (command === 'help' || args.help) {
    usage();
    return;
  }

  if (command === 'list') {
    await listUsers();
    return;
  }

  if (command === 'upsert') {
    await upsertUser(args);
    return;
  }

  throw new Error(`Unknown command "${command}"`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    usage();
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
