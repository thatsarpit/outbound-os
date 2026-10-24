import 'dotenv/config';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import log from './logger.js';
import { registerAllTools } from './registerTools.js';
import { mountOAuth, verifyOAuthToken } from './oauth.js';
import { requestOrigin } from './requestOrigin.js';
import { mountPersonalOAuth, personalControl, personalOAuthConfig, personalReadToolAllowed } from './personalOAuth.js';
import { mcpRequestContext } from './client.js';

// ── Config ──
const PORT = parseInt(process.env.PORT) || 3002;
const MCP_BEARER_TOKEN = process.env.MCP_BEARER_TOKEN;
const PERSONAL = personalOAuthConfig();
if (process.env.MCP_AUTH_MODE && !['legacy', 'personal'].includes(process.env.MCP_AUTH_MODE)) {
  throw new Error('MCP_AUTH_MODE must be legacy or personal.');
}

if (!MCP_BEARER_TOKEN && (!PERSONAL || PERSONAL.legacyCompat)) {
  log.error('MCP_BEARER_TOKEN is required. Set it in .env');
  process.exit(1);
}

// ── Express app ──
const app = express();

// Behind Caddy/Tailscale — trust proxy headers so OAuth metadata advertises
// the correct public https base URL (X-Forwarded-Proto / X-Forwarded-Host).
// Only a proxy on this machine or a private network is trusted to say who the
// client is; with `true`, anyone could forge X-Forwarded-For and dodge the
// consent page's failed-password limit.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');

// CORS — allow Claude Desktop, claude.ai, and mobile connectors
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true })); // OAuth consent form posts

// ── Health check (no auth) ──
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'outbound-os-mcp', uptime: process.uptime() });
});

// ── OAuth 2.1 provider (for claude.ai / mobile connectors) ──
// Mounted before the bearer guard so its metadata/authorize/token routes are
// reachable without a token. The static MCP_BEARER_TOKEN path below is kept
// for headless clients (Claude Code).
// Limit unauthenticated discovery, registration, token attempts and bearer
// checks as well as successful tool requests.
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
if (PERSONAL) {
  mountPersonalOAuth(app, PERSONAL);
  if (PERSONAL.legacyCompat) mountOAuth(app, { tokensOnly: true });
} else mountOAuth(app);

// ── Bearer auth middleware ──
// Accepts either the static MCP_BEARER_TOKEN or an OAuth access token issued
// by the provider above. On failure, emits the RFC 9728 WWW-Authenticate
// challenge so clients can discover the OAuth flow.
function unauthorized(req, res, message) {
  res.set(
    'WWW-Authenticate',
    `Bearer resource_metadata="${PERSONAL?.issuer || requestOrigin(req)}/.well-known/oauth-protected-resource"${PERSONAL ? ', scope="mcp:read"' : ''}`
  );
  return res.status(401).json({ error: message });
}

async function requireBearer(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return unauthorized(req, res, 'Missing Authorization: Bearer <token>');
  }
  const token = auth.slice(7);
  if (PERSONAL && token.startsWith('mcp_personal_')) {
    try {
      await personalControl('inspect', { token }, PERSONAL);
      req.personalMcpToken = token;
      return next();
    } catch (error) {
      if (!error.status || error.status >= 500) return res.status(503).json({ error: 'Authorization service unavailable.' });
      return unauthorized(req, res, 'Connection expired or revoked');
    }
  }
  if ((!PERSONAL || PERSONAL.legacyCompat) && (token === MCP_BEARER_TOKEN || verifyOAuthToken(token))) {
    return next();
  }
  return unauthorized(req, res, 'Invalid bearer token');
}

// ── MCP transport map (stateless — one transport per request) ──

function createMcpServer(personalToken) {
  const server = new McpServer({
    name: 'outbound-os',
    version: '1.0.0',
  });
  if (personalToken) {
    registerAllTools({
      tool(name, ...args) {
        if (!personalReadToolAllowed(name)) return;
        const handler = args.pop();
        server.tool(name, ...args, (...handlerArgs) => mcpRequestContext.run({ personalToken, tool: name }, () => handler(...handlerArgs)));
      },
    });
  } else registerAllTools(server);
  return server;
}

// POST /mcp — main MCP endpoint (Streamable HTTP)
app.post('/mcp', requireBearer, async (req, res) => {
  try {
    const server = createMcpServer(req.personalMcpToken);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,  // stateless mode
    });
    res.on('close', () => {
      transport.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    log.error('MCP request error:', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal MCP error' });
    }
  }
});

// GET /mcp — SSE endpoint for server-initiated notifications (required by spec)
app.get('/mcp', requireBearer, (req, res) => {
  res.status(405).json({ error: 'SSE not supported in stateless mode. Use POST.' });
});

// DELETE /mcp — session termination (no-op in stateless mode)
app.delete('/mcp', requireBearer, (req, res) => {
  res.status(200).json({ ok: true });
});

// ── Start ──
app.listen(PORT, '0.0.0.0', () => {
  log.info(`MCP server listening on http://0.0.0.0:${PORT}`);
  log.info(`Health: http://localhost:${PORT}/healthz`);
  log.info(`MCP endpoint: POST http://localhost:${PORT}/mcp`);
});
