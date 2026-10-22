import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { sqliteDatabaseUrl } from '../prisma/database-url.mjs';
import { createPrismaClient } from '../src/utils/createPrismaClient.js';

test('SQLite URLs preserve schema-relative paths regardless of the working directory', () => {
  const expected = fileURLToPath(new URL('../data/fixture.db', import.meta.url));
  assert.equal(sqliteDatabaseUrl('file:../data/fixture.db'), `file:${expected}`);
  assert.equal(sqliteDatabaseUrl(`file:${expected}`), `file:${expected}`);
  for (const invalid of ['', 'postgres://example.test/db', 'file:', 'file:db?mode=ro']) {
    assert.throws(() => sqliteDatabaseUrl(invalid), /DATABASE_URL/);
  }
});

test('Prisma reads legacy millisecond dates, writes the same format and rolls back transactions', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'outbound-prisma-'));
  const filename = path.join(directory, 'fixture.db');
  const legacy = new DatabaseSync(filename);
  const timestamp = Date.parse('2026-01-02T03:04:05.678Z');
  legacy.exec(`CREATE TABLE User (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, passwordHash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'agent', phone TEXT UNIQUE, enabled BOOLEAN NOT NULL DEFAULT 1, lastLoginAt DATETIME, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)`);
  legacy.prepare('INSERT INTO User (email, name, passwordHash, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)').run('legacy@example.test', 'unchanged', 'fixture', timestamp, timestamp);
  legacy.close();
  const prisma = createPrismaClient(`file:${filename}`);
  try {
    const row = await prisma.user.findUnique({ where: { email: 'legacy@example.test' } });
    assert.equal(row.updatedAt.toISOString(), new Date(timestamp).toISOString());
    assert.equal(row.name, 'unchanged');
    await prisma.user.create({ data: { email: 'new@example.test', name: 'fixture', passwordHash: 'fixture', updatedAt: new Date(timestamp) } });
    const raw = await prisma.$queryRaw`SELECT typeof(updatedAt) AS format, updatedAt FROM User WHERE email = 'new@example.test'`;
    assert.equal(raw[0].format, 'integer');
    assert.equal(Number(raw[0].updatedAt), timestamp);
    await assert.rejects(prisma.$transaction(async transaction => {
      await transaction.user.create({ data: { email: 'rollback@example.test', name: 'fixture', passwordHash: 'fixture' } });
      throw new Error('synthetic rollback');
    }), /synthetic rollback/);
    assert.equal(await prisma.user.count({ where: { email: 'rollback@example.test' } }), 0);
    await assert.rejects(prisma.$transaction([
      prisma.user.create({ data: { email: 'array@example.test', name: 'fixture', passwordHash: 'fixture' } }),
      prisma.user.create({ data: { email: 'legacy@example.test', name: 'duplicate', passwordHash: 'fixture' } }),
    ]));
    assert.equal(await prisma.user.count({ where: { email: 'array@example.test' } }), 0);
  } finally {
    await prisma.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  }
});
