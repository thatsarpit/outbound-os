import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPrismaClient } from '../src/utils/createPrismaClient.js';
import { importConnectorRecords } from '../src/services/connectorImport.js';

async function fixture(run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'outbound-connector-'));
  const filename = path.join(directory, 'fixture.db');
  const sql = new DatabaseSync(filename);
  const root = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(root).sort()) {
    const migration = new URL(`${name}/migration.sql`, root);
    if (existsSync(migration)) sql.exec(readFileSync(migration, 'utf8'));
  }
  const prisma = createPrismaClient(`file:${filename}`);
  try { await run({ sql, prisma }); }
  finally {
    await prisma.$disconnect();
    sql.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function observe(prisma) {
  const reads = { candidateCounts: [], hydrated: [], suppliers: 0 };
  const db = {
    $transaction: (operation, options) => prisma.$transaction((tx) => operation(new Proxy(tx, {
      get(target, key) {
        if (key === '$queryRawUnsafe') return async (...args) => {
          const rows = await target.$queryRawUnsafe(...args);
          reads.candidateCounts.push(rows.length);
          return rows;
        };
        if (key === 'lead') return new Proxy(target.lead, {
          get(delegate, method) {
            if (method === 'findMany') return async (args) => {
              assert.ok(args.where.id.in.length <= 300, 'only bounded candidate IDs are hydrated');
              assert.ok(args.select && !args.select.messages, 'only matching/fill fields are read');
              const rows = await delegate.findMany(args);
              reads.hydrated.push(rows.length);
              return rows;
            };
            return delegate[method];
          },
        });
        if (key === 'supplier') return new Proxy(target.supplier, {
          get(delegate, method) {
            if (method === 'findMany') return async (...args) => { reads.suppliers++; return delegate.findMany(...args); };
            return delegate[method];
          },
        });
        return target[key];
      },
    })), options),
  };
  return { db, reads };
}

test('connector matching hydrates bounded candidates despite thousands of unrelated and duplicate contacts', async () => fixture(async ({ sql, prisma }) => {
  sql.exec('BEGIN');
  const insert = sql.prepare('INSERT INTO Lead (name, mobile, email, updatedAt) VALUES (?, ?, ?, 0)');
  for (let index = 0; index < 5000; index++) insert.run('Unrelated fixture', `1555${String(index).padStart(7, '0')}`, `unrelated-${index}@example.test`);
  for (let index = 0; index < 1000; index++) insert.run('Duplicate fixture', `1666${String(index).padStart(7, '0')}`, 'duplicate@example.test');
  sql.exec('COMMIT');
  const supplier = await prisma.supplier.create({ data: { name: 'Fixture supplier', matchTag: 'fixture-origin' } });
  const source = await prisma.webhookSource.create({ data: { name: 'Fixture source', source: 'bounded-fixture', apiKey: 'fixture-key', importSupplierId: supplier.id } });
  const formatted = await prisma.lead.create({ data: { name: 'Formatted', mobile: '00+44/(7700) 900171', email: 'FORMATTED@example.test', status: 'replied', emailOptOut: true } });
  const placeholder = await prisma.lead.create({ data: { name: 'Email-only', mobile: 'no-phone:15557770001', email: 'placeholder@example.test', status: 'paused' } });
  await prisma.lead.create({ data: { name: 'Other workspace', mobile: '15558880001', email: 'other-workspace@example.test', tenantId: 2 } });
  const { db, reads } = observe(prisma);
  const result = await importConnectorRecords(db, source, [
    { externalId: 'formatted', mobile: '+44 7700 900171', email: 'formatted@example.test', company: 'Filled company' },
    { externalId: 'duplicates', email: 'duplicate@example.test' },
    { externalId: 'placeholder', mobile: '15557770001' },
    { externalId: 'tenant', email: 'other-workspace@example.test' },
    { externalId: 'new-buyer-1', mobile: '15559990001', email: 'new@example.test' },
    { externalId: 'new-buyer-2', email: 'NEW@example.test' },
    { externalId: 'new-buyer-2', email: 'NEW@example.test' },
  ]);
  assert.deepEqual(result.map((row) => row.state), ['matched', 'conflict', 'created', 'created', 'created', 'matched', 'matched']);
  assert.equal(result[0].leadId, formatted.id);
  assert.notEqual(result[2].leadId, placeholder.id, 'digits in a no-phone placeholder are never a phone match');
  assert.equal(result[4].leadId, result[5].leadId, 'new contacts remain visible to later rows in the batch');
  assert.equal(result[6].replay, true, 'repeated IDs within one batch reuse the newly recorded receipt');
  assert.deepEqual(reads.hydrated, [3], 'one genuine contact and two duplicate IDs; no workspace hydration');
  assert.ok(reads.candidateCounts.every((count) => count <= 3));
  const unchanged = await prisma.lead.findUnique({ where: { id: formatted.id } });
  assert.equal(unchanged.status, 'replied');
  assert.equal(unchanged.emailOptOut, true);
  assert.equal(unchanged.company, 'Filled company');
  const supplierReads = reads.suppliers;
  const candidateReads = reads.candidateCounts.length;
  await prisma.supplier.update({ where: { id: supplier.id }, data: { enabled: false } });
  const replay = await importConnectorRecords(db, source, [{ externalId: 'formatted', email: 'changed@example.test' }]);
  assert.equal(replay[0].replay, true);
  assert.equal(reads.suppliers, supplierReads, 'accepted-only replays do not query active suppliers');
  assert.equal(reads.candidateCounts.length, candidateReads, 'accepted-only replays do not query contacts');
}));

test('connector candidate matching retains Unicode email rules, split identities and supplier conflicts', async () => fixture(async ({ prisma }) => {
  const supplier = await prisma.supplier.create({ data: { name: 'Fixture supplier' } });
  const other = await prisma.supplier.create({ data: { name: 'Other supplier', matchTag: 'other-origin' } });
  const source = await prisma.webhookSource.create({ data: { name: 'Fixture source', source: 'identities-fixture', apiKey: 'fixture-key', importSupplierId: supplier.id } });
  const unicode = await prisma.lead.create({ data: { name: 'Unicode', mobile: 'no-phone:unicode', email: '\u00a0\u212aAREN@EXAMPLE.TEST\t' } });
  await prisma.lead.create({ data: { name: 'Phone identity', mobile: '+1 555 777 0011', email: 'phone@example.test' } });
  await prisma.lead.create({ data: { name: 'Email identity', mobile: '15557770012', email: 'split@example.test' } });
  await prisma.lead.create({ data: { name: 'Other owner', mobile: '15557770013', tags: 'other-origin', originSupplierId: other.id } });
  const { db } = observe(prisma);
  const result = await importConnectorRecords(db, source, [
    { externalId: 'unicode', email: 'karen@example.test' },
    { externalId: 'split', mobile: '15557770011', email: 'split@example.test' },
    { externalId: 'owner', mobile: '15557770013' },
  ]);
  assert.equal(result[0].state, 'matched');
  assert.equal(result[0].leadId, unicode.id);
  assert.equal(result[1].state, 'conflict');
  assert.equal(result[2].state, 'conflict');
  assert.equal(await prisma.lead.count(), 4);
}));

test('connector matching quarantines an oversized exceptional email set instead of guessing', async () => fixture(async ({ sql, prisma }) => {
  sql.exec('BEGIN');
  const insert = sql.prepare('INSERT INTO Lead (name, mobile, email, updatedAt) VALUES (?, ?, ?, 0)');
  for (let index = 0; index < 201; index++) insert.run('Exceptional fixture', `no-phone:unicode-${index}`, `\u212a-${index}@example.test`);
  sql.exec('COMMIT');
  const supplier = await prisma.supplier.create({ data: { name: 'Fixture supplier' } });
  const source = await prisma.webhookSource.create({ data: { name: 'Fixture source', source: 'unicode-overflow-fixture', apiKey: 'fixture-key', importSupplierId: supplier.id } });
  const { db, reads } = observe(prisma);
  const result = await importConnectorRecords(db, source, [{ externalId: 'uncertain', email: 'k-200@example.test' }]);
  assert.equal(result[0].state, 'conflict');
  assert.match(result[0].reason, /require review/);
  assert.deepEqual(reads.hydrated, []);
  assert.equal(await prisma.lead.count(), 201);
}));
