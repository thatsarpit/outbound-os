import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureInstanceSecrets, KEY_FILENAME } from '../src/utils/instanceSecrets.js';
import { InboundEmailSpool } from '../src/utils/inboundEmailSpool.js';

const bootstrap = new URL('../src/utils/instanceSecrets.js', import.meta.url).href;
const backupScript = fileURLToPath(new URL('../scripts/instance-backup.mjs', import.meta.url));
const fixtureKey = 'synthetic-recovery-fixture-key-with-no-external-access';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'outbound-instance-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, env: { DATABASE_URL: `file:${path.join(directory, 'fixture.db')}` } };
}

test('a migrated empty database initializes once even when two processes start together', async t => {
  const { directory, env } = fixture(t);
  const db = new DatabaseSync(env.DATABASE_URL.slice(5));
  db.exec('CREATE TABLE _prisma_migrations (id); INSERT INTO _prisma_migrations VALUES (1); CREATE TABLE Lead (id)');
  db.close();
  const initialize = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `import { ensureInstanceSecrets } from '${bootstrap}'; ensureInstanceSecrets();`],
      { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    child.stderr.on('data', chunk => errors += chunk);
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(errors)));
  });
  await Promise.all([initialize(), initialize()]);
  const file = path.join(directory, KEY_FILENAME);
  const original = fs.readFileSync(file, 'utf8');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  ensureInstanceSecrets(env);
  assert.equal(env.LEAD_SYNC_ENCRYPTION_KEY, JSON.parse(original).LEAD_SYNC_ENCRYPTION_KEY);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('startup preserves corrupt keys and refuses to replace keys for an existing workspace', t => {
  const { directory, env } = fixture(t);
  const db = new DatabaseSync(env.DATABASE_URL.slice(5));
  db.exec('CREATE TABLE Lead (id); INSERT INTO Lead VALUES (1)');
  db.close();
  const file = path.join(directory, KEY_FILENAME);
  assert.throws(() => ensureInstanceSecrets(env), /Missing instance keys/);
  assert.equal(fs.existsSync(file), false);
  fs.writeFileSync(file, '{truncated');
  assert.throws(() => ensureInstanceSecrets(env), /Invalid instance secret file/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{truncated');
  ensureInstanceSecrets({ ...env, JWT_SECRET: fixtureKey, LEAD_SYNC_ENCRYPTION_KEY: fixtureKey });
});

test('startup does not expose runtime keys when the store cannot be published', t => {
  const { directory, env } = fixture(t);
  const failedPublish = t.mock.method(fs, 'linkSync', () => {
    throw Object.assign(new Error('Synthetic disk write failure'), { code: 'ENOSPC' });
  });
  assert.throws(() => ensureInstanceSecrets(env), /Cannot save instance secrets .*ENOSPC/);
  assert.equal(env.JWT_SECRET, undefined);
  assert.equal(env.LEAD_SYNC_ENCRYPTION_KEY, undefined);
  assert.deepEqual(fs.readdirSync(directory), []);
  failedPublish.mock.restore();
});

test('restore verifies SQLite, attachments, encryption and external keys without the source volume', async t => {
  const { directory, env } = fixture(t);
  const source = path.join(directory, 'source');
  const media = path.join(source, 'media');
  fs.mkdirSync(media, { recursive: true });
  fs.writeFileSync(path.join(media, 'fixture.pdf'), 'synthetic attachment');
  const dbPath = path.join(source, 'fixture.db');
  const mailDirectory = path.join(source, 'private', 'inbound-email');
  const spool = new InboundEmailSpool({ directory: mailDirectory, secret: fixtureKey });
  const dedupe = 'synthetic-mail';
  const object = await spool.store(dedupe, Buffer.from('original email'));
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE MediaFile (path); INSERT INTO MediaFile VALUES ('data/media/fixture.pdf'); CREATE TABLE InboundEmailReceipt (rawPath)");
  db.prepare('INSERT INTO InboundEmailReceipt VALUES (?)').run(object);
  db.close();
  const mcpStore = path.join(source, 'synthetic-oauth.json');
  fs.writeFileSync(mcpStore, '{"fixture":true}');
  const config = path.join(source, 'synthetic.env');
  fs.writeFileSync(config, 'BUSINESS_NAME=Fixture Business\n');
  const output = path.join(directory, 'off-host-copy');
  const cli = (...args) => spawnSync(process.execPath, [backupScript, ...args], {
    env: { ...env, DATABASE_URL: `file:${dbPath}`, JWT_SECRET: fixtureKey, LEAD_SYNC_ENCRYPTION_KEY: fixtureKey },
    encoding: 'utf8',
  });
  const create = () => cli('create', '--media-root', source, '--output', output, '--env', config, '--mcp-store', mcpStore);
  let result = create();
  assert.equal(result.status, 0, result.stderr);
  const [backup] = fs.readdirSync(output);
  assert.equal(fs.statSync(path.join(output, backup, KEY_FILENAME)).mode & 0o777, 0o600);
  fs.rmSync(path.join(media, 'fixture.pdf'));
  result = create();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing required backup file: media\/fixture.pdf/);
  assert.deepEqual(fs.readdirSync(output), [backup]);
  fs.rmSync(source, { recursive: true });
  const restored = path.join(directory, 'restored');
  result = cli('restore', path.join(output, backup), restored);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(restored, 'media', 'fixture.pdf'), 'utf8'), 'synthetic attachment');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(restored, 'mcp-oauth.json'), 'utf8')), { fixture: true });
  assert.equal(fs.readFileSync(path.join(restored, 'app.env'), 'utf8'), 'BUSINESS_NAME=Fixture Business\n');
  const restoredDb = new DatabaseSync(path.join(restored, 'outboundos.db'), { readOnly: true });
  try {
    assert.equal(restoredDb.prepare('SELECT rawPath FROM InboundEmailReceipt').get().rawPath, object);
  } finally {
    restoredDb.close();
  }
  const keys = JSON.parse(fs.readFileSync(path.join(restored, KEY_FILENAME), 'utf8'));
  const recoveredSpool = new InboundEmailSpool({ directory: path.join(restored, 'private', 'inbound-email'), secret: keys.LEAD_SYNC_ENCRYPTION_KEY });
  assert.equal((await recoveredSpool.read(object, dedupe)).toString(), 'original email');
  assert.notEqual(cli('restore', path.join(output, backup), restored).status, 0);
  const damaged = path.join(directory, 'damaged-restore');
  fs.appendFileSync(path.join(output, backup, 'media', 'fixture.pdf'), 'changed');
  assert.match(cli('restore', path.join(output, backup), damaged).stderr, /Checksum mismatch/);
  assert.equal(fs.existsSync(damaged), false);
});
