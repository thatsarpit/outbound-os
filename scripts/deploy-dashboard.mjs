import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const web = fileURLToPath(new URL('../web/', import.meta.url));
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = dashboardDeployment(process.argv.slice(2));
  if (!existsSync(path.join(plan.cwd, 'dist/index.html'))) throw new Error('Build the production dashboard before deploying.');
  const deployed = spawnSync('wrangler', plan.args, { cwd: plan.cwd, stdio: 'inherit' });
  if (deployed.status !== 0) process.exit(deployed.status || 1);
  await verifyDashboard(plan.origin);
  console.log('Dashboard deployed with its Pages API function; public and protected API checks passed.');
}
