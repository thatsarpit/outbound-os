import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dashboardDeployment, verifyDashboard } from '../scripts/deploy-dashboard.mjs';

test('dashboard deployment selects the directory containing Pages functions and requires an explicit verification origin', () => {
  const plan = dashboardDeployment(['--project-name', 'synthetic-app', '--branch', 'main', '--verify-url', 'https://app.example.test']);
  assert.equal(path.basename(path.normalize(plan.cwd)), 'web');
  assert.deepEqual(plan.args, ['pages', 'deploy', 'dist', '--project-name', 'synthetic-app', '--branch', 'main']);
  assert.equal(plan.origin, 'https://app.example.test');
  assert.throws(() => dashboardDeployment(['--project-name', 'synthetic-app']), /verify-url/);
});

test('dashboard verification rejects a successful SPA fallback in place of API JSON', async () => {
  await assert.rejects(verifyDashboard('https://app.example.test', async () => new Response('<html>SPA fallback</html>', { headers: { 'content-type': 'text/html' } })), /must return JSON/);
  let calls = 0;
  await verifyDashboard('https://app.example.test', async () => ++calls === 1
    ? Response.json({ provider: 'clerk' })
    : Response.json({ error: 'Unauthorized' }, { status: 401 }));
  assert.equal(calls, 2);
});

test('archived builds use their build stamp and reject a mismatched release tag', async t => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'outboundos-build-'));
  t.after(() => rm(fixture, { force: true, recursive: true }));
  const modulePath = path.join(fixture, 'shared', 'buildInfo.js');
  await cp(new URL('../shared/buildInfo.js', import.meta.url), modulePath);
  await writeFile(path.join(fixture, 'VERSION'), '0.5.0\n');
  const { readBuildInfo } = await import(pathToFileURL(modulePath));
  const stamp = path.join(fixture, '.outboundos-build');
  const revision = 'a'.repeat(40);

  assert.deepEqual(readBuildInfo(), { version: '0.5.0', revision: null, channel: 'local' });
  await writeFile(stamp, `${revision}\n\n`);
  assert.deepEqual(readBuildInfo(), { version: '0.5.0', revision, channel: 'development' });
  await writeFile(stamp, `${revision}\nv0.5.0\n`);
  assert.deepEqual(readBuildInfo(), { version: '0.5.0', revision, channel: 'release' });
  await writeFile(stamp, `${revision}\nv0.4.0\n`);
  assert.throws(readBuildInfo, /release tag matching VERSION/);
});
