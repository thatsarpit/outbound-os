import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { harness } from './helpers/hermesHarness.js';

// Isolate singleton imports, dotenv, logs and identity files from the checkout.
test('synthetic real-ingress scenarios run in a private child with no inherited credentials', { timeout: 45000 }, async () => {
  const f = harness();
  try {
    const result = await promisify(execFile)(process.execPath,
      ['--test-reporter=tap', new URL('./fixtures/hermesIngressScenarios.js', import.meta.url).pathname], {
        cwd: f.directory, timeout: 35000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
        env: { PATH: process.env.PATH, TMPDIR: f.directory, NODE_ENV: 'test',
          DATABASE_URL: `file:${f.senderFile}`, DOTENV_CONFIG_PATH: `${f.directory}/absent.env` },
      });
    assert.match(result.stdout, /# fail 0/);
    assert.match(result.stdout, /# pass [1-9]/);
    process.stdout.write(result.stdout);
  } finally { await f.close(); }
});
