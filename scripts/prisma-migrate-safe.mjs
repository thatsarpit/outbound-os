#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createHash, randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');
const DEFAULT_SCHEMA_PATH = path.join(APP_DIR, 'prisma', 'schema.prisma');

function parseArgs(argv) {
  const args = { schema: DEFAULT_SCHEMA_PATH };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--schema' && argv[i + 1]) {
      args.schema = path.resolve(APP_DIR, argv[i + 1]);
      i += 1;
      continue;
    }
  }
  return args;
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: APP_DIR,
    env: process.env,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (options.capture) {
    return result;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function parseDatasource(schemaText) {
  const datasourceBlock = schemaText.match(/datasource\s+\w+\s*\{([\s\S]*?)\}/m)?.[1] || '';
  const provider = datasourceBlock.match(/provider\s*=\s*"([^"]+)"/)?.[1] || null;
  const urlLiteral = datasourceBlock.match(/url\s*=\s*"([^"]+)"/)?.[1] || null;
  return { provider, urlLiteral };
}

function readLockProvider(lockPath) {
  if (!fs.existsSync(lockPath)) return null;
  const lockText = fs.readFileSync(lockPath, 'utf8');
  return lockText.match(/provider\s*=\s*"([^"]+)"/)?.[1] || null;
}

function resolveSqliteDbPath(schemaPath, dbUrl) {
  if (!dbUrl || !dbUrl.startsWith('file:')) return null;
  const rawPath = dbUrl.slice('file:'.length);
  if (!rawPath) return null;
  if (path.isAbsolute(rawPath)) return rawPath;
  return path.resolve(path.dirname(schemaPath), rawPath);
}

function toSqliteFileUrl(dbPath) {
  return `file:${dbPath}`;
}

function listMigrationDirectories(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function querySqlite(dbPath, sql) {
  const result = spawnSync('sqlite3', [dbPath, sql], {
    cwd: APP_DIR,
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail(result.stderr?.trim() || `sqlite3 query failed for ${dbPath}`);
  }
  return String(result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function execSqlite(dbPath, sql) {
  const result = spawnSync('sqlite3', [dbPath], {
    cwd: APP_DIR,
    env: process.env,
    encoding: 'utf8',
    input: sql,
  });
  if (result.status !== 0) {
    fail(result.stderr?.trim() || `sqlite3 execution failed for ${dbPath}`);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function ensureSqliteMigrationsTable(dbPath) {
  execSqlite(dbPath, `
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    );
  `);
}

function manuallyBootstrapSqliteMigrations(dbPath, migrationsDir, migrationDirs) {
  console.log(`🧱 Bootstrapping fresh SQLite database with ${migrationDirs.length} migration(s)...`);
  ensureSqliteMigrationsTable(dbPath);

  for (const migrationName of migrationDirs) {
    const migrationFile = path.join(migrationsDir, migrationName, 'migration.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    execSqlite(dbPath, sql);

    const startedAt = Date.now();
    const finishedAt = startedAt;
    execSqlite(dbPath, `
      INSERT INTO "_prisma_migrations" (
        "id",
        "checksum",
        "finished_at",
        "migration_name",
        "logs",
        "rolled_back_at",
        "started_at",
        "applied_steps_count"
      ) VALUES (
        '${escapeSqlLiteral(randomUUID())}',
        '${escapeSqlLiteral(sha256(sql))}',
        ${finishedAt},
        '${escapeSqlLiteral(migrationName)}',
        NULL,
        NULL,
        ${startedAt},
        1
      );
    `);
  }
}

function detectSchemaDiff(dbUrl, schemaPath) {
  const result = runCommand('npx', [
    'prisma',
    'migrate',
    'diff',
    '--from-url',
    dbUrl,
    '--to-schema-datamodel',
    schemaPath,
    '--exit-code',
  ], { capture: true });

  if (result.status === 0) return 'none';
  if (result.status === 2) return 'diff';

  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  fail('Unable to determine schema drift before applying migrations.');
}

function resolveAppliedMigration(schemaPath, migrationName) {
  runCommand('npx', [
    'prisma',
    'migrate',
    'resolve',
    '--schema',
    schemaPath,
    '--applied',
    migrationName,
  ]);
}

function runDbPush(schemaPath, reason) {
  console.warn(`⚠️  ${reason}`);
  runCommand('npx', [
    'prisma',
    'db',
    'push',
    '--schema',
    schemaPath,
    '--accept-data-loss',
  ]);
}

function main() {
  const { schema } = parseArgs(process.argv);
  if (!fs.existsSync(schema)) {
    fail(`Prisma schema not found at ${schema}`);
  }

  const prismaDir = path.dirname(schema);
  const migrationsDir = path.join(prismaDir, 'migrations');
  const lockPath = path.join(prismaDir, 'migration_lock.toml');

  const schemaText = fs.readFileSync(schema, 'utf8');
  const { provider, urlLiteral } = parseDatasource(schemaText);
  const lockProvider = readLockProvider(lockPath);
  const migrationDirs = listMigrationDirectories(migrationsDir);

  if (!migrationDirs.length) {
    runDbPush(schema, 'No Prisma migrations found; falling back to prisma db push.');
    return;
  }

  if (provider && lockProvider && provider !== lockProvider) {
    runDbPush(
      schema,
      `Schema provider ${provider} does not match migration provider ${lockProvider}; falling back to prisma db push.`,
    );
    return;
  }

  if (provider !== 'sqlite') {
    console.warn(`⚠️  Safe baseline detection is only implemented for sqlite. Running prisma migrate deploy for provider ${provider || 'unknown'}.`);
    runCommand('npx', ['prisma', 'migrate', 'deploy', '--schema', schema]);
    return;
  }

  const dbUrl = process.env.DATABASE_URL || urlLiteral;
  const dbPath = resolveSqliteDbPath(schema, dbUrl);
  if (!dbPath || !fs.existsSync(dbPath)) {
    if (!dbPath) {
      fail('Unable to resolve SQLite database path from schema.');
    }
    manuallyBootstrapSqliteMigrations(dbPath, migrationsDir, migrationDirs);
    console.log('🗄  Verifying Prisma migration state...');
    runCommand('npx', ['prisma', 'migrate', 'deploy', '--schema', schema]);
    return;
  }

  const tables = querySqlite(
    dbPath,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
  );
  const appTables = tables.filter((name) => name !== '_prisma_migrations');
  const hasMigrationTable = tables.includes('_prisma_migrations');
  const appliedMigrations = hasMigrationTable
    ? new Set(querySqlite(dbPath, "SELECT migration_name FROM _prisma_migrations ORDER BY migration_name;"))
    : new Set();

  if (appTables.length === 0 && !hasMigrationTable) {
    manuallyBootstrapSqliteMigrations(dbPath, migrationsDir, migrationDirs);
    console.log('🗄  Verifying Prisma migration state...');
    runCommand('npx', ['prisma', 'migrate', 'deploy', '--schema', schema]);
    return;
  }

  if (appTables.length > 0) {
    const pendingMigrations = migrationDirs.filter((name) => !appliedMigrations.has(name));
    if (pendingMigrations.length > 0) {
      const diffState = detectSchemaDiff(toSqliteFileUrl(dbPath), schema);
      if (diffState === 'none') {
        console.log(`🧭 Existing database already matches the current schema. Resolving ${pendingMigrations.length} migration(s) as applied...`);
        for (const migrationName of pendingMigrations) {
          resolveAppliedMigration(schema, migrationName);
        }
      } else if (!appliedMigrations.has(migrationDirs[0])) {
        console.log(`🧭 Existing database detected without Prisma history. Resolving baseline ${migrationDirs[0]} as applied...`);
        resolveAppliedMigration(schema, migrationDirs[0]);
      }
    }
  }

  console.log('🗄  Applying Prisma migrations...');
  runCommand('npx', ['prisma', 'migrate', 'deploy', '--schema', schema]);
}

main();
