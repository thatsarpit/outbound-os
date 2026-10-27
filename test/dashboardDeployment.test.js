import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
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
