import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { checkReleaseVersion } from './check-release-version.mjs';

const web = fileURLToPath(new URL('../web/', import.meta.url));
const productionOrigin = 'https://app.outboundos.space';
export function dashboardDeployment(input) {
  const args = [...input];
  const at = args.indexOf('--verify-url');
  if (at < 0 || !args[at + 1]) throw new Error('Supply --verify-url with the deployed dashboard origin.');
  const url = new URL(args[at + 1]);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('The dashboard verification URL must be an HTTPS origin.');
  }
  args.splice(at, 2);
  if (!args.includes('--project-name')) throw new Error('Supply an explicit --project-name.');
  if (!existsSync(path.join(web, 'functions/api/[[path]].ts'))) throw new Error('The Pages API function is missing.');
  // Wrangler discovers functions from cwd, not the dist argument. Deploying
  // web/dist from the repository root silently drops the same-origin API.
  return { cwd: web, args: ['pages', 'deploy', 'dist', ...args], origin: url.origin };
}

export async function verifyDashboard(origin, fetcher = fetch) {
  const response = await fetcher(new URL('/api/auth/config', origin), { cache: 'no-store' });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Dashboard API verification failed: /api/auth/config must return JSON, not the SPA HTML.');
  }
  const auth = await response.json();
  if (!['clerk', 'local'].includes(auth.provider)) throw new Error('Dashboard API returned an invalid sign-in configuration.');
  const protectedResponse = await fetcher(new URL('/api/stats/overview', origin), { cache: 'no-store' });
  if (![401, 403].includes(protectedResponse.status) || !protectedResponse.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Dashboard protected API verification failed: unauthenticated requests must reach the API guard.');
  }
}

export function verifyDashboardBuild(actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error('Dashboard build does not match the tagged release. Build it again from the release checkout.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = dashboardDeployment(process.argv.slice(2));
  if (!existsSync(path.join(plan.cwd, 'dist/index.html'))) throw new Error('Build the production dashboard before deploying.');
  const projectName = plan.args[plan.args.indexOf('--project-name') + 1];
  const branchAt = plan.args.indexOf('--branch');
  const publicProduction = projectName === 'outboundos-app' &&
    (branchAt < 0 || plan.args[branchAt + 1] === 'main');
  const release = publicProduction ? checkReleaseVersion() : null;
  if (release) {
    const hashAt = plan.args.indexOf('--commit-hash');
    if (hashAt < 0 || plan.args[hashAt + 1] !== release.revision || plan.origin !== productionOrigin) {
      throw new Error('Pass the tagged source revision as --commit-hash and verify the production dashboard.');
    }
    verifyDashboardBuild(JSON.parse(readFileSync(path.join(plan.cwd, 'dist/outboundos-build.json'), 'utf8')), release);
  }
  const deployed = spawnSync('wrangler', plan.args, { cwd: plan.cwd, stdio: 'inherit' });
  if (deployed.status !== 0) process.exit(deployed.status || 1);
  await verifyDashboard(plan.origin);
  if (release) {
    const url = new URL('/outboundos-build.json', plan.origin);
    url.searchParams.set('revision', release.revision);
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('The production dashboard did not return its build details.');
    verifyDashboardBuild(await response.json(), release);
  }
  console.log('Dashboard deployed with its Pages API function; public and protected API checks passed.');
}
