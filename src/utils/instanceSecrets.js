import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sqliteDatabaseUrl } from '../../prisma/database-url.mjs';

const PLACEHOLDERS = new Set(['', 'change-me-to-a-random-64-char-string', 'changeme', 'change-me']);
export const INSTANCE_KEYS = ['JWT_SECRET', 'LEAD_SYNC_ENCRYPTION_KEY'];
export const KEY_FILENAME = 'instance-secrets.json';

export function databaseFilename(env = process.env) {
  return sqliteDatabaseUrl(env.DATABASE_URL || 'file:../data/outboundos.db').slice(5);
}

function configured(value) {
  return typeof value === 'string' && !PLACEHOLDERS.has(value.trim());
}

function readStore(filename) {
  let contents;
  try {
    contents = fs.readFileSync(filename, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot read ${filename} (${error.code || 'read error'}). Restore the original instance secrets or provide both keys in the environment.`);
  }
  try {
    const value = JSON.parse(contents);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new Error(`Invalid instance secret file at ${filename}. Restore the original file or provide both keys in the environment.`);
  }
}

export function resolveInstanceSecrets(env, filename) {
  const stored = INSTANCE_KEYS.every(key => configured(env[key])) ? {} : readStore(filename);
  return Object.fromEntries(INSTANCE_KEYS.map(key => [
    key, configured(env[key]) ? env[key] : configured(stored?.[key]) ? stored[key] : undefined,
  ]));
}

// Fresh installs may already have an empty schema because Docker and manual
// installs run Prisma migrations before the application starts.
function containsInstanceData(database) {
  try {
    if (fs.statSync(database).size === 0 && !fs.existsSync(`${database}-wal`)) return false;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name != '_prisma_migrations'").all();
    return tables.some(({ name }) => db.prepare(`SELECT 1 FROM "${name.replaceAll('"', '""')}" LIMIT 1`).get());
  } finally {
    db.close();
  }
}

function publishStore(filename, values) {
  const dir = path.dirname(filename);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const staging = fs.mkdtempSync(path.join(dir, '.instance-keys-'));
  try {
    const temporary = path.join(staging, KEY_FILENAME);
    fs.writeFileSync(temporary, `${JSON.stringify(values, null, 2)}\n`, {
      mode: 0o600, flag: 'wx', flush: true,
    });
    // Publish the complete file without replacing keys another process stored.
    fs.linkSync(temporary, filename);
    const parent = fs.openSync(dir, 'r');
    try {
      fs.fsyncSync(parent);
    } finally {
      fs.closeSync(parent);
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function ensureInstanceSecrets(env = process.env) {
  const database = databaseFilename(env);
  const filename = path.join(path.dirname(database), KEY_FILENAME);
  let values = resolveInstanceSecrets(env, filename);
  const missing = INSTANCE_KEYS.filter(key => !values[key]);
  if (missing.length) {
    // A process may have just initialized this instance between our first
    // read and the database inspection. Read the complete file again.
    let hasData;
    try {
      hasData = containsInstanceData(database);
    } catch {
      throw new Error(`Cannot verify that ${database} is a new database. Provide its original instance secrets before starting.`);
    }
    const stored = readStore(filename);
    values = resolveInstanceSecrets(env, filename);
    const absent = INSTANCE_KEYS.filter(key => !values[key]);
    if (absent.length) {
      if (hasData || stored) {
        throw new Error(`Missing instance keys (${absent.join(', ')}). Restore the original ${KEY_FILENAME} or supply the original keys before starting.`);
      }
      const generated = Object.fromEntries(absent.map(key => [key, randomBytes(32).toString('hex')]));
      try {
        publishStore(filename, generated);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw new Error(`Cannot save instance secrets to ${filename} (${error.code || 'write error'}). Check storage permissions and free space, or supply both keys in the environment.`);
        }
      }
      values = resolveInstanceSecrets(env, filename);
      if (INSTANCE_KEYS.some(key => !values[key])) {
        throw new Error('Instance key initialization is incomplete. Check the supplied keys before starting.');
      }
    }
  }
  Object.assign(env, values);
}
