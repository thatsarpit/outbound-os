import path from 'node:path';
import { fileURLToPath } from 'node:url';

const schemaDirectory = fileURLToPath(new URL('.', import.meta.url));

/** Keep Prisma 6's schema-relative SQLite paths when using a driver adapter. */
export function sqliteDatabaseUrl(value = process.env.DATABASE_URL) {
  if (typeof value !== 'string' || !value.startsWith('file:') || !value.slice(5)) {
    throw new Error('DATABASE_URL must be a non-empty file: SQLite URL');
  }
  const filename = value.slice(5);
  if (/[?#]/.test(filename)) {
    throw new Error('SQLite DATABASE_URL query parameters and fragments are not supported');
  }
  return `file:${path.resolve(schemaDirectory, filename)}`;
}
