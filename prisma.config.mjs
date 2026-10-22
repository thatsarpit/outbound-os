import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { sqliteDatabaseUrl } from './prisma/database-url.mjs';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Generating the client does not need a database. Commands which connect
  // still fail when DATABASE_URL is missing rather than creating another DB.
  datasource: process.env.DATABASE_URL ? { url: sqliteDatabaseUrl() } : undefined,
});
