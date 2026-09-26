#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const envPath = path.resolve(root, process.argv[2] || '.env');

function parseEnv(content) {
  const out = {};
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const problems = [];
const warnings = [];

if (!fs.existsSync(envPath)) {
  problems.push(`Environment file is missing: ${path.relative(root, envPath)}`);
} else {
  const env = parseEnv(fs.readFileSync(envPath, 'utf8'));

  const required = ['DATABASE_URL', 'CLERK_SECRET_KEY'];
  for (const key of required) {
    if (!env[key]) problems.push(`${key} is missing`);
  }

  const clerkSecretKey = env.CLERK_SECRET_KEY || '';
  const clerkPublishableKey = env.CLERK_PUBLISHABLE_KEY || '';
  const jwtSecret = env.JWT_SECRET || '';
  const leadSyncKey = env.LEAD_SYNC_ENCRYPTION_KEY || '';
  if (clerkSecretKey && !clerkSecretKey.startsWith('sk_live_')) {
    problems.push('CLERK_SECRET_KEY must use a Clerk production key (sk_live_)');
  }
  if (clerkPublishableKey && !clerkPublishableKey.startsWith('pk_live_')) {
    problems.push('CLERK_PUBLISHABLE_KEY must use a Clerk production key (pk_live_)');
  }
  if (jwtSecret && jwtSecret.length < 24) {
    problems.push('JWT_SECRET must be at least 24 characters, or blank to have one generated');
  }

  const nodeEnv = (env.NODE_ENV || '').toLowerCase();
  if (nodeEnv !== 'production') {
    warnings.push(`NODE_ENV is "${env.NODE_ENV || 'unset'}" (recommended: production)`);
  }
  if (!leadSyncKey) {
    warnings.push('LEAD_SYNC_ENCRYPTION_KEY is blank: one will be generated into data/instance-secrets.json — back that file up with the database');
  } else if (leadSyncKey.length < 24) {
    problems.push('LEAD_SYNC_ENCRYPTION_KEY must be at least 24 characters');
  }

  const db = env.DATABASE_URL || '';
  if (db && !db.startsWith('file:')) {
    problems.push('DATABASE_URL must use file: because the checked-in Prisma schema uses SQLite');
  }

  const corsOrigin = env.CORS_ORIGIN || '';
  // Unset is normal: the image serves the dashboard and API from one origin.
  if (corsOrigin && corsOrigin.split(',').some((origin) => !origin.trim().startsWith('https://'))) {
    warnings.push('Every CORS_ORIGIN entry should use HTTPS in production');
  }

  if ((env.AISENSY_API_KEY || env.AISENSY_PROJECT_ID) && !env.AISENSY_WEBHOOK_SECRET) {
    warnings.push('AISENSY_WEBHOOK_SECRET is missing; the inbound webhook will be unauthenticated');
  }

  const brand = env.DASHBOARD_BRAND_NAME || '';
  if (!brand) warnings.push('DASHBOARD_BRAND_NAME not set (using runtime defaults)');
}

const favicon = path.join(root, 'web', 'public', 'favicon-app.svg');
if (!fs.existsSync(favicon)) problems.push('Missing frontend asset: web/public/favicon-app.svg');

if (problems.length === 0) {
  console.log('Preflight OK');
} else {
  console.error('Preflight FAILED');
  for (const issue of problems) console.error(`- ${issue}`);
}

if (warnings.length > 0) {
  console.log('Preflight WARNINGS');
  for (const warning of warnings) console.log(`- ${warning}`);
}

process.exit(problems.length > 0 ? 1 : 0);
