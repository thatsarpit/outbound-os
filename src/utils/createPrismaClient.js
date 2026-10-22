import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { sqliteDatabaseUrl } from '../../prisma/database-url.mjs';

export function createPrismaClient(databaseUrl) {
  const adapter = new PrismaBetterSqlite3({
    // Resolve on connection, preserving Prisma's lazy initialization for
    // scripts and pure unit tests which never access the database.
    get url() { return sqliteDatabaseUrl(databaseUrl ?? process.env.DATABASE_URL); },
  }, {
    // Existing SQLite DateTime columns contain milliseconds, not ISO strings.
    timestampFormat: 'unixepoch-ms',
  });
  return new PrismaClient({ adapter });
}
