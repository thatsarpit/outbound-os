#!/usr/bin/env node
import 'dotenv/config';

import emailService from '../src/services/emailService.js';
import prisma from '../src/utils/prismaClient.js';
import {
  buildDefaultEmailSignature,
  buildProjectEmailAddress,
  resolvePublicSiteConfig,
} from '../src/utils/publicSiteConfig.js';

function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function printHelp() {
  const { contactEmail, siteUrl, mailDomain } = resolvePublicSiteConfig(process.env);
  console.log(`
Email account CLI

Usage:
  npm run email:cli -- list
  npm run email:cli -- providers
  npm run email:create -- --local-part hello --provider zoho --smtp-user hello@${mailDomain} --smtp-pass <app-password>
  npm run email:cli -- system --id 1
  npm run email:cli -- test --id 1
  npm run email:cli -- delete --id 1

Commands:
  list        Show configured email accounts
  providers   Show built-in SMTP/IMAP presets
  create      Create a new account
  system      Show or set the preferred system sender
  test        Verify SMTP for an account
  delete      Delete an account

Create options:
  --email <address>              Full sender email address
  --local-part <name>            Local part to build against ${mailDomain}
  --name <label>                 Display label stored in the app
  --provider <id>                gmail | outlook | zoho | custom
  --smtp-user <value>            SMTP username
  --smtp-pass <value>            SMTP password or app password
  --smtp-host <host>             Required for custom provider
  --smtp-port <port>             Custom SMTP port
  --smtp-secure <true|false>     SMTP TLS-on-connect
  --imap-user <value>            IMAP username
  --imap-pass <value>            IMAP password
  --imap-host <host>             Custom IMAP host
  --imap-port <port>             Custom IMAP port
  --imap-secure <true|false>     IMAP secure flag
  --sender-name <value>          From-header display name
  --signature <html>             Custom HTML signature
  --daily-limit <number>         Daily send cap
  --hourly-limit <number>        Hourly send cap
  --enabled <true|false>         Account enabled flag after creation
  --system                       Mark the created account as the default system sender
  --test                         Verify SMTP immediately after create
  --dry-run                      Print resolved values without writing
  --help                         Show this help

Defaults:
  Site URL: ${siteUrl}
  Contact email: ${contactEmail}
`);
}

function parseBool(value, fallback = undefined) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseIntOrUndefined(value, label) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be an integer.`);
  }
  return parsed;
}

function resolveAccountEmail(args) {
  if (args.email) return String(args.email).trim().toLowerCase();
  if (args['local-part']) {
    return buildProjectEmailAddress(args['local-part'], process.env);
  }
  throw new Error('Provide either --email or --local-part.');
}

function resolveCompanyName() {
  return String(
    process.env.DASHBOARD_BRAND_NAME
      || process.env.BUSINESS_NAME
      || 'Outbound OS'
  ).trim();
}

async function listAccounts() {
  const accounts = await emailService.listAccounts();

  if (accounts.length === 0) {
    console.log('No email accounts configured.');
    return;
  }

  for (const account of accounts) {
    console.log(
      [
        `#${account.id}`,
        account.email,
        `provider=${account.provider}`,
        `status=${account.status}`,
        `enabled=${account.enabled}`,
        `sentToday=${account.sentToday}/${account.dailyLimit}`,
      ].join(' | ')
    );
  }
}

function listProviders() {
  const presets = emailService.getProviderPresets();
  for (const [provider, preset] of Object.entries(presets)) {
    console.log(
      [
        provider,
        `smtp=${preset.smtpHost}:${preset.smtpPort}`,
        `imap=${preset.imapHost}:${preset.imapPort}`,
      ].join(' | ')
    );
  }
}

async function createAccount(args) {
  const email = resolveAccountEmail(args);
  const provider = String(args.provider || 'custom').trim().toLowerCase();
  const companyName = resolveCompanyName();
  const resolved = {
    email,
    name: String(args.name || email).trim(),
    provider,
    smtpHost: args['smtp-host'] ? String(args['smtp-host']).trim() : undefined,
    smtpPort: parseIntOrUndefined(args['smtp-port'], 'smtp-port'),
    smtpSecure: parseBool(args['smtp-secure']),
    smtpUser: String(args['smtp-user'] || email).trim(),
    smtpPass: String(args['smtp-pass'] || '').trim(),
    imapHost: args['imap-host'] ? String(args['imap-host']).trim() : undefined,
    imapPort: parseIntOrUndefined(args['imap-port'], 'imap-port'),
    imapSecure: parseBool(args['imap-secure']),
    imapUser: args['imap-user'] ? String(args['imap-user']).trim() : undefined,
    imapPass: args['imap-pass'] ? String(args['imap-pass']).trim() : undefined,
    senderName: String(args['sender-name'] || companyName).trim(),
    signature: args.signature
      ? String(args.signature).trim()
      : buildDefaultEmailSignature({
          senderName: String(args['sender-name'] || companyName).trim(),
          companyName,
          env: process.env,
        }),
    dailyLimit: parseIntOrUndefined(args['daily-limit'], 'daily-limit'),
    hourlyLimit: parseIntOrUndefined(args['hourly-limit'], 'hourly-limit'),
    enabled: parseBool(args.enabled),
  };

  if (!resolved.smtpPass) {
    throw new Error('--smtp-pass is required.');
  }

  if (provider === 'custom' && !resolved.smtpHost) {
    throw new Error('Custom provider requires --smtp-host.');
  }

  if (args['dry-run']) {
    console.log(JSON.stringify({
      action: 'create-email-account',
      system: Boolean(args.system),
      ...resolved,
      smtpPass: '***',
    }, null, 2));
    return;
  }

  const created = await emailService.createAccount(resolved);

  if (resolved.enabled !== undefined) {
    await emailService.updateAccount(created.id, { enabled: resolved.enabled });
  }

  if (args.system) {
    await emailService.setSystemSenderAccount({ accountId: created.id });
  }

  console.log(`Created email account #${created.id}: ${created.email} (${created.provider})`);
  if (args.system) {
    console.log(`Marked account #${created.id} as the preferred system sender.`);
  }

  if (args.test) {
    const result = await emailService.testConnection(created.id);
    if (!result.success) {
      throw new Error(`SMTP verification failed for account #${created.id}: ${result.error}`);
    }
    console.log(`SMTP verification passed for account #${created.id}.`);
  }
}

async function testAccount(args) {
  const id = parseIntOrUndefined(args.id, 'id');
  if (!id) throw new Error('Provide --id for test.');

  const result = await emailService.testConnection(id);
  if (!result.success) {
    throw new Error(result.error || `SMTP verification failed for account #${id}.`);
  }
  console.log(`SMTP verification passed for account #${id}.`);
}

async function deleteAccount(args) {
  const id = parseIntOrUndefined(args.id, 'id');
  if (!id) throw new Error('Provide --id for delete.');

  await emailService.deleteAccount(id);
  console.log(`Deleted email account #${id}.`);
}

async function manageSystemAccount(args) {
  if (args.clear) {
    await emailService.clearSystemSenderAccount();
    console.log('Cleared preferred system sender.');
    return;
  }

  if (args.id || args.email) {
    const account = await emailService.setSystemSenderAccount({
      accountId: parseIntOrUndefined(args.id, 'id'),
      email: args.email ? String(args.email).trim() : '',
    });
    console.log(`Preferred system sender set to ${account.email} (#${account.id}).`);
    return;
  }

  const account = await emailService.getSystemSenderAccount();
  if (!account) {
    console.log('No preferred system sender resolved.');
    return;
  }

  console.log(
    [
      `#${account.id}`,
      account.email,
      `provider=${account.provider}`,
      `status=${account.status}`,
      `enabled=${account.enabled}`,
    ].join(' | ')
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = String(args._[0] || '').trim().toLowerCase();

  if (!command || args.help || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'list') {
    await listAccounts();
    return;
  }

  if (command === 'providers') {
    listProviders();
    return;
  }

  if (command === 'create') {
    await createAccount(args);
    return;
  }

  if (command === 'system') {
    await manageSystemAccount(args);
    return;
  }

  if (command === 'test') {
    await testAccount(args);
    return;
  }

  if (command === 'delete') {
    await deleteAccount(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main()
  .catch((error) => {
    console.error(`Email CLI failed: ${error.message || error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
