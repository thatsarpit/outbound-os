// Fails if the MCP tool list on the website (lib/mcp-tools.ts) differs from
// the tools the MCP server actually registers (mcp-outboundos/src/tools).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const toolsDir = path.join(root, 'mcp-outboundos', 'src', 'tools');
const server = new Set();
for (const file of fs.readdirSync(toolsDir).filter((f) => f.endsWith('.js'))) {
  const source = fs.readFileSync(path.join(toolsDir, file), 'utf8');
  for (const [, name] of source.matchAll(/server\.tool\(\s*'([a-z_]+)'/g)) server.add(name);
}

const site = new Set();
const listed = fs.readFileSync(path.join(root, 'website', 'lib', 'mcp-tools.ts'), 'utf8');
for (const [, name] of listed.matchAll(/'([a-z]+(?:_[a-z]+)+|[a-z]+)'/g)) {
  if (server.has(name) || /_/.test(name)) site.add(name);
}

const missing = [...server].filter((t) => !site.has(t));
const extra = [...site].filter((t) => !server.has(t));
if (missing.length || extra.length) {
  console.error(`MCP tool list is out of date.\n  On the server, not the site: ${missing.join(', ') || '-'}\n  On the site, not the server: ${extra.join(', ') || '-'}`);
  process.exit(1);
}
console.log(`MCP tool list matches the server (${server.size} tools).`);
