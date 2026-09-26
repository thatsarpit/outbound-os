/**
 * Loads .env and makes sure the two instance secrets exist before any module
 * reads them:
 *
 *   JWT_SECRET                signs sign-in sessions
 *   LEAD_SYNC_ENCRYPTION_KEY  encrypts stored channel credentials
 *
 * If either is missing, or still the placeholder from .env.example, a strong
 * random value is generated once and kept in instance-secrets.json next to the
 * database. A copied example config must never mean a publicly known signing
 * key — anyone with the source could forge an admin session. Keeping the file
 * beside the database means the secrets travel with the data they protect:
 * restore one without the other and stored credentials cannot be decrypted.
 *
 * Values set in the environment always win. Import this first.
 */

import dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PLACEHOLDERS = new Set(['', 'change-me-to-a-random-64-char-string', 'changeme', 'change-me']);
const MANAGED = ['JWT_SECRET', 'LEAD_SYNC_ENCRYPTION_KEY'];

function dataDirectory() {
  const url = String(process.env.DATABASE_URL || '');
  if (url.startsWith('file:')) {
    const file = url.slice('file:'.length).split('?')[0];
    // Prisma resolves a relative SQLite path from the prisma/ folder.
    const resolved = path.isAbsolute(file) ? file : path.resolve(process.cwd(), 'prisma', file);
    return path.dirname(resolved);
  }
  return path.resolve(process.cwd(), 'data');
}

function ensureInstanceSecrets() {
  const missing = MANAGED.filter((key) => PLACEHOLDERS.has(String(process.env[key] || '').trim()));
  if (missing.length === 0) return;

  const dir = dataDirectory();
  const file = path.join(dir, 'instance-secrets.json');
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // First boot, or unreadable: generate below.
  }

  let changed = false;
  for (const key of missing) {
    if (!stored[key] || PLACEHOLDERS.has(stored[key])) {
      stored[key] = randomBytes(32).toString('hex');
      changed = true;
    }
    process.env[key] = stored[key];
  }

  if (changed) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
      console.warn(`🔐 Generated ${missing.join(' and ')} and saved them to ${file}. Back this file up with the database.`);
    } catch (error) {
      // Still safe (the values are random), but they will change on restart:
      // sessions end and stored credentials would need re-entering.
      console.error(`⚠️ Could not save generated secrets to ${file}: ${error.message}. Set ${missing.join(' and ')} in .env.`);
    }
  }
}

ensureInstanceSecrets();
