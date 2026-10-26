import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));

// Only a newly allocated scratch database is ever passed to Prisma. Ignore the
// caller's DATABASE_URL, and invoke the installed CLI without npm/npx downloads.
export function checkSchemaParity() {
  const cli = path.join(root, 'node_modules/prisma/build/index.js');
  if (!existsSync(cli)) throw new Error('Installed Prisma CLI is required; run this gate in CI after npm ci');
  const directory = mkdtempSync(path.join(tmpdir(), 'outbound-schema-parity-'));
  const filename = path.join(directory, 'parity.db');
  const env = { ...process.env, DATABASE_URL: `file:${filename}` };
  const invoke = args => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    if (result.error) throw result.error;
    return result;
  };
  const diffArgs = ['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--script', '--exit-code'];
  let db;
  try {
    const deploy = invoke(['migrate', 'deploy']);
    assert.equal(deploy.status, 0, `Isolated migration deployment failed:\n${deploy.stdout}\n${deploy.stderr}`);
    db = new DatabaseSync(filename);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    const inventory = verifySqlOnlyObjects(db);
    // These objects were checked above. Remove only that exact inventory from
    // this disposable database so unsupported features cannot skew Prisma diff.
    for (const row of inventory) db.exec(`DROP ${row.type.toUpperCase()} "${row.name.replaceAll('"', '""')}"`);
    db.close(); db = null;
    const clean = invoke(diffArgs);
    assert.equal(clean.status, 0, `Prisma schema/migration drift (or CLI failure):\n${clean.stdout}\n${clean.stderr}`);
    // A negative control proves that this invocation actually detects drift;
    // client generation or a silently ineffective comparison cannot pass it.
    db = new DatabaseSync(filename);
    db.exec('ALTER TABLE "HermesEventBatch" ADD COLUMN "syntheticParityProbe" TEXT');
    db.close(); db = null;
    const dirty = invoke(diffArgs);
    assert.equal(dirty.status, 2, `Prisma failed to detect the intentional schema mutation:\n${dirty.stdout}\n${dirty.stderr}`);
    return { parity: true, negativeControl: true, sqlOnlyObjects: inventory.length };
  } finally {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(checkSchemaParity()));
}

function sqlOnlyObjects(db) {
  const rows = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE type = 'trigger' OR type = 'view' OR type = 'index' ORDER BY name").all();
  return rows.filter(row => row.type !== 'index' || (row.sql && db.prepare('SELECT partial FROM pragma_index_list(?) WHERE name = ?').get(row.tbl_name, row.name)?.partial === 1));
}

// Prisma cannot represent these objects. Compare their actual DDL to the reviewed
// migration independently instead of treating an empty Prisma diff as coverage.
export function verifySqlOnlyObjects(db) {
  const expectedDb = new DatabaseSync(':memory:');
  try {
    expectedDb.exec('CREATE TABLE Message (id INTEGER); CREATE TABLE InboundEmailReceipt (id INTEGER)');
    expectedDb.exec(readFileSync(new URL('../prisma/migrations/20261025180000_hermes_shadow_events/migration.sql', import.meta.url), 'utf8'));
    const expected = sqlOnlyObjects(expectedDb);
    assert.equal(expected.length, 5, 'Review the SQL-only inventory when extending this migration');
    const actual = sqlOnlyObjects(db);
    assert.deepEqual(actual, expected, 'SQL-only schema drift');
    return actual;
  } finally { expectedDb.close(); }
}
