/** Reproduce the documented proxy against an isolated CRM + Debian Nginx.
 * This never attaches to a production network, database or provider account.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(path.join(os.tmpdir(), 'outbound-proxy-'));
chmodSync(temp, 0o755);
const suffix = randomBytes(4).toString('hex');
const app = `outbound-proxy-app-${suffix}`;
const proxy = `outbound-proxy-nginx-${suffix}`;
const token = randomBytes(32).toString('hex');
const image = process.env.OUTBOUNDOS_PROXY_TEST_IMAGE || 'outbound-os:ci';
const docker = (...args) => {
  try { return execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 }).trim(); }
  catch (error) { throw new Error(`Docker ${args[0]} failed: ${String(error.stderr || 'command timed out').trim()}`); }
};

function request(port, endpoint, headers = {}, stream = false) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const req = http.get({ hostname: '127.0.0.1', port, path: endpoint, headers: { Host: 'crm.example.com', ...headers } }, res => {
      let text = '';
      res.on('data', chunk => {
        text += chunk;
        if (stream && text.includes('"type":"connected"')) {
          resolve({ status: res.statusCode, headers: res.headers, text, elapsedMs: Date.now() - started });
          req.destroy();
        }
      });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text, elapsedMs: Date.now() - started }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('Proxy response timed out')));
    req.on('error', reject);
  });
}

try {
  const source = readFileSync(path.join(root, 'website/lib/setup-examples.ts'), 'utf8');
  const config = source.match(/export const nginxExample = `([\s\S]*?)`/)?.[1];
  assert.ok(config, 'documented Nginx example exists');
  writeFileSync(path.join(temp, 'nginx.conf'), config);
  writeFileSync(path.join(temp, 'server.mjs'), `import app from '/app/src/api.js';\napp.get('/api/proxy-proof', (req, res) => res.json({ ip: req.ip, protocol: req.protocol, host: req.get('host') }));\napp.listen(3001, '0.0.0.0');\n`);
  docker('run', '-d', '--name', app, '--label', 'outboundos.test=nginx', '-p', '127.0.0.1::80',
    '-e', 'DATABASE_URL=file:/app/data/proxy-test.db', '-e', 'NODE_ENV=test', '-e', 'AUTH_PROVIDER=local',
    '-e', 'TRUST_PROXY=loopback', '-e', `MCP_SERVICE_TOKEN=${token}`, '-e', `JWT_SECRET=${randomBytes(32).toString('hex')}`,
    '-v', `${temp}:/verification:ro`, image, 'sh', '-c', 'npx prisma migrate deploy >/dev/null && node /verification/server.mjs');
  docker('run', '-d', '--name', proxy, '--label', 'outboundos.test=nginx', '--network', `container:${app}`,
    '-v', `${path.join(temp, 'nginx.conf')}:/etc/nginx/conf.d/default.conf:ro`, 'nginx:stable-bookworm');
  const port = Number(docker('port', app, '80/tcp').split(':').at(-1));
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { healthy = (await request(port, '/healthz')).status === 200; } catch { /* The containers are still starting. */ }
    if (healthy) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(healthy, 'app booted through the Nginx proxy');
  const headers = { Authorization: `Bearer ${token}`, 'X-Forwarded-For': '192.0.2.55', 'X-Forwarded-Proto': 'https' };
  const response = await request(port, '/api/proxy-proof', headers);
  assert.equal(response.status, 200);
  const forwarded = JSON.parse(response.text);
  assert.equal(forwarded.host, 'crm.example.com');
  assert.equal(forwarded.protocol, 'http', 'Nginx overwrites a spoofed forwarded scheme');
  assert.notEqual(forwarded.ip, '192.0.2.55', 'trust stops at the real client, not its forged header');
  const unauthorized = await request(port, '/api/events');
  assert.equal(unauthorized.status, 401);
  const event = await request(port, `/api/events?token=${token}`, {}, true);
  assert.equal(event.status, 200);
  assert.match(event.headers['content-type'], /text\/event-stream/);
  assert.ok(event.elapsedMs < 2000, 'SSE first event arrives without buffering');
  assert.equal(event.headers['cache-control'], 'no-cache');
  const nginxVersion = docker('exec', proxy, 'sh', '-c', 'nginx -v 2>&1');
  const distro = docker('exec', proxy, 'sh', '-c', '. /etc/os-release; printf "%s" "$PRETTY_NAME"');
  const result = { testedAt: new Date().toISOString().slice(0, 10), environment: { distro, nginxVersion, deployment: 'isolated local Docker containers', appImage: image }, checks: { healthStatus: 200, forwardedHost: forwarded.host, forwardedProtocol: forwarded.protocol, forgedClientIpRejected: true, unauthenticatedSseStatus: 401, authenticatedSseStatus: 200, firstEventMs: event.elapsedMs, eventStreamUnbuffered: true }, limitations: ['Certbot certificate issuance and DNS require the installation\'s real public domain and were not exercised.'] };
  console.log(JSON.stringify(result, null, 2));
} finally {
  for (const name of [proxy, app]) { try { docker('rm', '-f', name); } catch { /* Also runs after a failed boot or assertion. */ } }
  rmSync(temp, { recursive: true, force: true });
}
