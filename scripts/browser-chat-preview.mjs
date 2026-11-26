import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { once } from 'node:events';

const dashboardPort = 4185;
const sitePort = 4184;
const dashboard = `http://127.0.0.1:${dashboardPort}`;
const site = `http://127.0.0.1:${sitePort}`;
const widget = 'preview-support';
if (!existsSync(new URL('../web/dist/index.html', import.meta.url))) {
  console.error('Build the dashboard first with npm run build --prefix web.');
  process.exit(1);
}
const scratch = mkdtempSync(join(tmpdir(), 'outboundos-chat-preview-'));
const database = join(scratch, 'preview.db');
process.chdir(scratch);
Object.assign(process.env, {
  NODE_ENV: 'test', AUTH_PROVIDER: 'local', DATABASE_URL: `file:${database}`,
  JWT_SECRET: randomBytes(32).toString('hex'), MCP_SERVICE_TOKEN: '',
  CLERK_SECRET_KEY: '', CLERK_PUBLISHABLE_KEY: '', OUTBOUNDOS_WORKSPACES: '', OUTBOUNDOS_WORKSPACE_ID: '',
  OUTBOUNDOS_AGENT_INBOUND_SINCE: '', WEB_PUSH_PUBLIC_KEY: '',
  OUTBOUNDOS_BROWSER_CHAT: 'true',
  OUTBOUNDOS_CHAT_WIDGETS: JSON.stringify({ [widget]: {
    title: 'Northstar Support', welcome: 'Tell us what you need help with and we’ll pick it up here.',
    accent: '#4358bd', origins: [site],
  } }),
});
const sql = new DatabaseSync(database);
const migrations = new URL('../prisma/migrations/', import.meta.url);
for (const name of readdirSync(migrations).sort()) {
  const file = new URL(`${name}/migration.sql`, migrations);
  if (existsSync(file)) sql.exec(readFileSync(file, 'utf8'));
}
sql.close();

const { default: db } = await import('../src/utils/prismaClient.js');
const { signToken } = await import('../src/auth/rbac.js');
const { default: app } = await import('../src/api.js');
const agent = await db.user.create({ data: {
  name: 'Preview operator', email: 'agent@example.test', role: 'admin', passwordHash: randomBytes(32).toString('hex'),
} });
const preview = express();
preview.get('/preview-operator', (_req, res) => {
  res.set('Cache-Control', 'no-store').type('html').send(`<!doctype html><meta charset="utf-8"><title>Opening agent Inbox</title><script>
localStorage.setItem('outboundos_session', ${JSON.stringify(signToken(agent))});
location.replace('/inbox');
</script>`);
});
preview.use(app);
const crm = preview.listen(dashboardPort, '127.0.0.1');
await once(crm, 'listening');
const demo = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.url !== '/') {
    res.writeHead(404).end('Preview page unavailable.');
    return;
  }

  const staff = `${dashboard}/preview-operator`;
  res.end(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Northstar Support | Outbound OS preview</title><link rel="icon" href="data:,">
<style>
:root{color-scheme:light;font-family:system-ui;color:#132036;background:#f1f4fa}
body{margin:0}main{max-width:840px;margin:auto;padding:clamp(24px,7vw,90px) 24px}
header{font-weight:700;display:flex;gap:10px;align-items:center}.mark{display:grid;place-items:center;background:#4358bd;color:#fff;width:36px;height:36px;border-radius:9px}
h1{font-size:clamp(44px,8vw,80px);line-height:1.03;letter-spacing:-.06em;margin:54px 0 20px}
p{color:#52617a;line-height:1.6;max-width:470px}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
a.action{display:inline-flex;align-items:center;min-height:44px;padding:0 17px;border:1px solid #bac4da;border-radius:8px;color:#26345a;text-decoration:none;font-weight:600}
a.primary{background:#3449aa;color:white;border-color:#3449aa} a:focus-visible,button:focus-visible{outline:3px solid #7b8fff;outline-offset:2px}
</style>
<main><header><span class="mark" aria-hidden="true">N</span>Northstar Support</header>
<h1>How can we help?</h1>
<p>Try the chat as a customer, then open the agent Inbox to answer. This preview uses sample conversations in a local database.</p>
<div class="actions">
<a href="${dashboard}/chat/widget/${widget}" class="action primary" data-outbound-chat aria-haspopup="dialog" aria-expanded="false">Chat with support</a>
<a class="action" href="${staff}" id="operator" target="_blank" rel="noopener">Open agent Inbox</a>
</div></main>
<script src="${dashboard}/outbound-chat.js" defer></script>
</html>`);
});
await new Promise(resolve => demo.listen(sitePort, '127.0.0.1', resolve));

console.log(`Website chat preview running at ${site}`);
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
async function stop() {
  await Promise.all([new Promise(resolve => demo.close(resolve)), new Promise(resolve => { crm.close(resolve); crm.closeAllConnections(); })]);
  await db.$disconnect();
  rmSync(scratch, { recursive: true, force: true });
  process.exit(0);
}
