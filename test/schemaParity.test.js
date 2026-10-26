import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const cliAvailable = existsSync(new URL('../node_modules/prisma/build/index.js', import.meta.url));

test('parity runner fails closed without installed Prisma instead of downloading dependencies', { skip: cliAvailable }, async () => {
  const { checkSchemaParity } = await import('../scripts/check-schema-parity.mjs');
  assert.equal(typeof checkSchemaParity, 'function');
  assert.throws(() => checkSchemaParity(), /Installed Prisma CLI is required/);
});

test('installed Prisma proves clean parity and detects an intentional schema mutation', { skip: !cliAvailable }, async () => {
  const { checkSchemaParity } = await import('../scripts/check-schema-parity.mjs');
  assert.deepEqual(checkSchemaParity(), { parity: true, negativeControl: true, sqlOnlyObjects: 5 });
});

function migrated() {
  const db = new DatabaseSync(':memory:');
  const root = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(root).sort()) {
    const file = new URL(`${name}/migration.sql`, root);
    if (existsSync(file)) db.exec(readFileSync(file, 'utf8'));
  }
  return db;
}

test('event timestamp dbgenerated expression matches the SQLite introspected default', () => {
  const db = migrated();
  try {
    const actual = db.prepare('PRAGMA table_info("HermesInboundEvent")').all().find(row => row.name === 'createdAt').dflt_value;
    const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
    const model = schema.match(/model HermesInboundEvent \{([\s\S]*?)\n\}/)[1];
    const declared = model.match(/createdAt BigInt @default\(dbgenerated\("([^"]+)"\)\)/)[1];
    assert.equal(declared, actual, 'Use the introspected default expression, without SQLite DDL wrapper parentheses');
  } finally { db.close(); }
});

test('parity gate separately verifies all four triggers and the active-conversation partial index', async () => {
  const { verifySqlOnlyObjects } = await import('../scripts/check-schema-parity.mjs');
  const db = migrated();
  try {
    const inventory = verifySqlOnlyObjects(db);
    assert.equal(inventory.filter(row => row.type === 'trigger').length, 4);
    assert.equal(inventory.filter(row => row.type === 'index').length, 1);
    db.exec('DROP TRIGGER hermes_inbound_email_upgrade');
    assert.throws(() => verifySqlOnlyObjects(db), /SQL-only schema drift/);
  } finally { db.close(); }
});

for (const [name, mutation] of [
  ['changed trigger body', 'DROP TRIGGER hermes_inbound_email_upgrade; CREATE TRIGGER hermes_inbound_email_upgrade AFTER UPDATE ON Message BEGIN SELECT 1; END'],
  ['changed partial-index predicate', 'DROP INDEX HermesEventBatch_active_conversation; CREATE UNIQUE INDEX HermesEventBatch_active_conversation ON HermesEventBatch(conversationKey) WHERE state = \'pending\''],
  ['missing partial index', 'DROP INDEX HermesEventBatch_active_conversation'],
  ['extra trigger', 'CREATE TRIGGER synthetic_extra_trigger AFTER INSERT ON Message BEGIN SELECT 1; END'],
  ['extra view', 'CREATE VIEW synthetic_extra_view AS SELECT id FROM HermesEventBatch'],
]) {
  test(`SQL-only inventory rejects ${name}`, async () => {
    const { verifySqlOnlyObjects } = await import('../scripts/check-schema-parity.mjs');
    const db = migrated();
    try {
      db.exec(mutation);
      assert.throws(() => verifySqlOnlyObjects(db), /SQL-only schema drift/);
    } finally { db.close(); }
  });
}
