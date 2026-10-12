import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTrackedArtifacts } from '../scripts/check-repo-hygiene.mjs';

test('hygiene rejects nested credentials, SQLite files and generated runtime artifacts', () => {
  const files = ['.env', 'web/.env.production', 'instance-secrets.json', 'mcp-outboundos/oauth-store.json', 'work/clerk-production-instance-private.json', 'prisma/local.db-wal', 'snapshot.sqlite3', 'keys/server.pem', 'backups/a.txt', 'web/dist-demo/assets/app.js', 'data/uploads/a.png', 'web/node_modules/a.js', 'web/.DS_Store'];
  assert.equal(checkTrackedArtifacts(files).length, files.length);
});

test('hygiene preserves examples, implementation scripts and sanitized fixtures', () => {
  assert.deepEqual(checkTrackedArtifacts(['.env.example', 'web/.env.example', 'scripts/backup.sh', 'src/services/csvExporter.js', 'docs/validation/wordpress-webhook.json', 'test/fixtures/formSubmissions.js', 'docs/screenshots/inbox.png']), []);
});
