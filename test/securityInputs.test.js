import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import csvImporter from '../src/services/csvImporter.js';
import { trackingUrlFor } from '../src/routes/sales.js';
import { browserMutationGuard } from '../src/utils/browserMutation.js';

test('cookie mutations require a trusted origin while bearer clients remain supported', () => {
  const guard = browserMutationGuard(['https://app.example.test']);
  for (const fixture of [
    { origin: 'https://evil.example.test', expected: 403 },
    { expected: 403 },
    { origin: 'https://app.example.test', expected: 200 },
    { origin: 'https://api.example.test', expected: 200 },
    { authorization: 'Bearer fixture', origin: 'https://client.example.test', expected: 200 },
  ]) {
    let status = 200;
    const headers = { cookie: '__session=fixture', ...fixture };
    const req = { method: 'POST', path: '/settings', headers, protocol: 'https',
      get: key => key === 'host' ? 'api.example.test' : headers[key] };
    const res = { status: code => { status = code; return res; }, json: () => {} };
    guard(req, res, () => {});
    assert.equal(status, fixture.expected);
  }
});

test('CSV headers cannot change object prototypes or invoke inherited carrier methods', () => {
  const { rows } = csvImporter.parseCSV('__proto__,constructor,name\npollution,unexpected,Ada');
  assert.equal(Object.getPrototypeOf(rows[0]), null);
  assert.equal(rows[0].__proto__, 'pollution');
  assert.equal(rows[0].name, 'Ada');
  assert.equal({}.pollution, undefined);
  assert.throws(() => csvImporter.parseCSV({ length: 100000000 }), /must be text/);
  for (const carrier of ['constructor', 'toString', '__proto__']) assert.equal(trackingUrlFor(carrier, '123'), null);
});

test('untrusted log messages cannot create extra file or terminal log entries', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'outbound-logs-'));
  try {
    const moduleUrl = new URL('../src/utils/logger.js', import.meta.url).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import logger from ${JSON.stringify(moduleUrl)}; logger.info('untrusted\\nFORGED\\rentry'); logger.end();`],
    { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim().split('\n').length, 1);
    const log = readFileSync(path.join(directory, 'outbound-os.log'), 'utf8');
    assert.equal(log.trim().split('\n').length, 1);
    assert.ok(log.includes('untrusted\\nFORGED\\rentry'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
