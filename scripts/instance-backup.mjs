#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, backup } from 'node:sqlite';
import dotenv from 'dotenv';
import { databaseFilename, INSTANCE_KEYS, KEY_FILENAME, resolveInstanceSecrets } from '../src/utils/instanceSecrets.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestName = 'manifest.json';
const dbName = 'outboundos.db';
const fixedPaths = new Set([dbName, KEY_FILENAME, 'app.env', 'mcp-oauth.json']);
const validEntry = name => fixedPaths.has(name)
  || /^(?:media\/[^/\\\x00]+|private\/inbound-email\/[a-f0-9]{64}\.mime\.enc)$/.test(name)
  && !['.', '..'].includes(path.posix.basename(name));

async function safeFile(directory, name) {
  let current = directory;
  const parts = name.split('/');
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = await lstat(current).catch(error => {
      if (error.code === 'ENOENT') throw new Error(`Missing required backup file: ${name}`);
      throw error;
    });
    if (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()) {
      throw new Error(`Expected a regular file without symbolic links: ${name}`);
    }
  }
  return current;
}

async function privateCopy(source, target) {
  await mkdir(path.dirname(target), { mode: 0o700, recursive: true });
  await copyFile(source, target, fs.constants.COPYFILE_EXCL);
  await chmod(target, 0o600);
}

async function digest(filename) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

function databaseContents(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const check = db.prepare('PRAGMA integrity_check').all();
    if (check.length !== 1 || check[0].integrity_check !== 'ok') throw new Error('Backup database failed integrity check.');
    const names = new Set();
    for (const [table, column, prefix] of [
      ['Message', 'mediaUrl', 'media/'],
      ['MediaFile', 'path', 'media/'],
      ['InboundEmailReceipt', 'rawPath', 'private/inbound-email/'],
    ]) {
      if (!db.prepare('SELECT 1 FROM sqlite_schema WHERE type = ? AND name = ?').get('table', table)) continue;
      for (const { value } of db.prepare(`SELECT DISTINCT "${column}" AS value FROM "${table}" WHERE "${column}" IS NOT NULL AND "${column}" != ''`).iterate()) {
        if (prefix === 'media/' && !value.startsWith('data/media/')) {
          throw new Error(`Unsupported media path recorded in ${table}. Resolve the existing media reference before backing up.`);
        }
        const name = prefix === 'media/' ? value.slice(5) : prefix + value;
        if (!validEntry(name)) throw new Error(`Invalid attachment reference in ${table}.`);
        names.add(name);
      }
    }
    return names;
  } finally {
    db.close();
  }
}

async function createBackup(options) {
  const configFile = path.resolve(options.env || path.join(root, '.env'));
  let config;
  try {
    config = await readFile(configFile);
  } catch (error) {
    if (options.env || error.code !== 'ENOENT') throw error;
  }
  const env = { ...dotenv.parse(config || ''), ...process.env };
  const source = path.resolve(env.OUTBOUNDOS_DB_FILE || databaseFilename(env));
  const dbDirectory = path.dirname(source);
  const keys = resolveInstanceSecrets(env, path.join(dbDirectory, KEY_FILENAME));
  const missing = INSTANCE_KEYS.filter(key => !keys[key]);
  if (missing.length) throw new Error(`Missing backup keys: ${missing.join(', ')}. Run with the same configuration as the app.`);
  const output = path.resolve(options.output || env.OUTBOUNDOS_BACKUP_DIR || path.join(dbDirectory, 'backups'));
  await mkdir(output, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(path.join(output, '.incomplete-'));
  const destination = path.join(output, `instance-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`);
  try {
    const snapshot = path.join(staging, dbName);
    const db = new DatabaseSync(source, { readOnly: true });
    try {
      await backup(db, snapshot);
    } finally {
      db.close();
    }
    await chmod(snapshot, 0o600);
    const names = databaseContents(snapshot);
    for (const name of names) {
      const dataDirectory = name.startsWith('media/')
        ? path.resolve(options['media-root'] || path.join(root, 'data'))
        : dbDirectory;
      await privateCopy(await safeFile(dataDirectory, name), path.join(staging, name));
    }
    await writeFile(path.join(staging, KEY_FILENAME), `${JSON.stringify(keys, null, 2)}\n`, { mode: 0o600 });
    if (config) {
      await writeFile(path.join(staging, 'app.env'), config, { mode: 0o600 });
      names.add('app.env');
    }
    if (options['mcp-store']) {
      const filename = path.resolve(options['mcp-store']);
      const from = await safeFile(path.dirname(filename), path.basename(filename));
      await privateCopy(from, path.join(staging, 'mcp-oauth.json'));
      names.add('mcp-oauth.json');
    }
    names.add(dbName);
    names.add(KEY_FILENAME);
    const files = [];
    for (const name of [...names].sort()) {
      files.push({ path: name, sha256: await digest(path.join(staging, name)) });
    }
    await writeFile(path.join(staging, manifestName), `${JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files }, null, 2)}\n`, { mode: 0o600 });
    await rename(staging, destination);
    console.log(`Instance backup created: ${destination}`);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function restoreBackup(backupDirectory, destination) {
  const manifest = JSON.parse(await readFile(await safeFile(backupDirectory, manifestName), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('Unsupported backup manifest.');
  const names = new Set();
  for (const file of manifest.files) {
    if (typeof file?.path !== 'string' || !validEntry(file.path) || names.has(file.path)
      || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error('Invalid backup manifest entry.');
    }
    names.add(file.path);
  }
  if (!names.has(dbName) || !names.has(KEY_FILENAME)) throw new Error('Backup must include its database and instance keys.');

  // Exclusive creation prevents an accidental overwrite of a real instance.
  await mkdir(destination, { mode: 0o700 });
  try {
    for (const file of manifest.files) {
      const target = path.join(destination, file.path);
      await privateCopy(await safeFile(backupDirectory, file.path), target);
      if (await digest(target) !== file.sha256) throw new Error(`Checksum mismatch: ${file.path}`);
    }
    const keys = resolveInstanceSecrets({}, path.join(destination, KEY_FILENAME));
    if (INSTANCE_KEYS.some(key => !keys[key])) throw new Error('Incomplete instance secrets in backup.');
    for (const name of databaseContents(path.join(destination, dbName))) {
      if (!names.has(name)) throw new Error(`Missing attachment in backup manifest: ${name}`);
    }
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
  console.log(`Verified restore staged at ${destination}. The app has not started. Review the configuration and disable sending before a rehearsal.`);
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'create') {
    const { values } = parseArgs({ args, options: {
      output: { type: 'string' }, env: { type: 'string' },
      'media-root': { type: 'string' }, 'mcp-store': { type: 'string' },
    } });
    await createBackup(values);
  } else if (command === 'restore' && args.length === 2) {
    await restoreBackup(...args.map(value => path.resolve(value)));
  } else {
    throw new Error('Usage: instance-backup.mjs create [--output DIR] [--env FILE] [--media-root DATA_DIR] [--mcp-store FILE] | restore BACKUP_DIR NEW_DIR');
  }
} catch (error) {
  console.error(`Instance backup: ${error.code || error.message}`);
  process.exitCode = 1;
}
