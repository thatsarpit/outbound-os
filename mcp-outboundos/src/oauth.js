// ── Minimal OAuth 2.1 provider for the Outbound OS MCP server ──
//
// Why this exists: the claude.ai / Claude mobile connector UI can ONLY
// authenticate a remote MCP server via OAuth — there is no field to paste a
// static bearer token. This module implements just enough of OAuth 2.1
// (metadata discovery, Dynamic Client Registration, PKCE authorization-code
// grant, refresh tokens) for the "Connect" button to complete.
//
// The static MCP_BEARER_TOKEN still works for headless clients (Claude Code),
// so both paths coexist — see verifyToken() and the /mcp handler in server.js.
//
// Single-user server: the authorize step is gated by one shared password
// (OAUTH_PASSWORD, falling back to MCP_BEARER_TOKEN) instead of a user DB.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import log from './logger.js';

const CODE_TTL_MS = 10 * 60 * 1000;            // authorization codes: 10 min
const ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // access tokens: 30 days
const STORE_PATH = process.env.OAUTH_STORE_PATH || path.join(process.cwd(), 'oauth-store.json');

const OAUTH_PASSWORD = process.env.OAUTH_PASSWORD || process.env.MCP_BEARER_TOKEN;

// ── In-memory state ──
const clients = new Map();  // client_id -> { redirect_uris, client_name }
const codes = new Map();    // code -> { client_id, redirect_uri, code_challenge, expires }

// ── Token store (file-backed so tokens survive restarts) ──
// { access: { token -> {expires} }, refresh: { token -> {} } }
let store = { access: {}, refresh: {} };

function loadStore() {
  try {
    store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    if (!store.access) store.access = {};
    if (!store.refresh) store.refresh = {};
    // prune expired access tokens on boot
    const now = Date.now();
    for (const [t, v] of Object.entries(store.access)) {
      if (v.expires && v.expires < now) delete store.access[t];
    }
  } catch {
    store = { access: {}, refresh: {} };
  }
}

function saveStore() {
  try {
    // Holds live access tokens: readable by the server's user only.
    fs.writeFileSync(STORE_PATH, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 });
  } catch (e) {
    log.warn('oauth: could not persist token store:', e.message);
  }
}

loadStore();

// ── Helpers ──
function rand(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function pkceMatches(verifier, challenge) {
  if (!verifier || !challenge) return false;
  const hash = crypto.createHash('sha256').update(verifier).digest('base64url');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(challenge));
}

// redirect_uri is trusted if it was registered by the client, or belongs to a
// known Anthropic/Claude callback host (covers first-connect before DCR state
// is remembered, and desktop localhost callbacks).
function isTrustedRedirect(clientId, redirectUri) {
  const client = clients.get(clientId);
  if (client && Array.isArray(client.redirect_uris) && client.redirect_uris.includes(redirectUri)) {
    return true;
  }
  try {
    const u = new URL(redirectUri);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    return ['claude.ai', 'claude.com', 'anthropic.com'].some(
      (h) => u.hostname === h || u.hostname.endsWith(`.${h}`)
    );
  } catch {
    return false;
  }
}

function passwordMatches(candidate) {
  if (!OAUTH_PASSWORD || typeof candidate !== 'string') return false;
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(OAUTH_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

// The consent page is on the public internet and guards the whole CRM, so
// wrong passwords are capped per address: 10 per 15 minutes.
const FAILED_WINDOW_MS = 15 * 60 * 1000;
const FAILED_LIMIT = 10;
const failedAttempts = new Map(); // ip -> [timestamps]

function tooManyFailures(ip) {
  const now = Date.now();
  const recent = (failedAttempts.get(ip) || []).filter((t) => now - t < FAILED_WINDOW_MS);
  failedAttempts.set(ip, recent);
  return recent.length >= FAILED_LIMIT;
}

function recordFailure(ip) {
  const list = failedAttempts.get(ip) || [];
  list.push(Date.now());
  failedAttempts.set(ip, list);
  if (failedAttempts.size > 10_000) failedAttempts.delete(failedAttempts.keys().next().value);
}

/** Registered redirects must be HTTPS, or loopback for desktop clients. */
function acceptableRedirect(uri) {
  try {
    const u = new URL(uri);
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ── Public: token verification used by the /mcp bearer guard ──
export function verifyOAuthToken(token) {
  const entry = store.access[token];
  if (!entry) return false;
  if (entry.expires && entry.expires < Date.now()) {
    delete store.access[token];
    saveStore();
    return false;
  }
  return true;
}

// ── Wire the OAuth routes onto the Express app ──
export function mountOAuth(app) {
  if (!OAUTH_PASSWORD) {
    log.warn('oauth: no OAUTH_PASSWORD or MCP_BEARER_TOKEN set — authorize endpoint will reject all logins');
  }

  // RFC 9728 — Protected Resource Metadata
  app.get('/.well-known/oauth-protected-resource', (req, res) => {
    const base = baseUrl(req);
    res.json({
      resource: `${base}/mcp`,
      authorization_servers: [base],
    });
  });

  // RFC 8414 — Authorization Server Metadata
  const authServerMetadata = (req, res) => {
    const base = baseUrl(req);
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['mcp'],
    });
  };
  app.get('/.well-known/oauth-authorization-server', authServerMetadata);
  // Some clients probe the AS metadata under the resource path too.
  app.get('/.well-known/oauth-authorization-server/mcp', authServerMetadata);

  // RFC 7591 — Dynamic Client Registration (public client, no secret)
  app.post('/oauth/register', (req, res) => {
    const clientId = `mcp-${rand(16)}`;
    const redirectUris = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris : [];
    if (redirectUris.length === 0 || !redirectUris.every(acceptableRedirect)) {
      return res.status(400).json({
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uris must be https, or http on localhost',
      });
    }
    clients.set(clientId, {
      redirect_uris: redirectUris,
      client_name: req.body?.client_name || 'MCP Client',
    });
    log.info(`oauth: registered client ${clientId} (${redirectUris.length} redirect uri(s))`);
    res.status(201).json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  });

  // Authorization endpoint — GET renders the single-password consent page.
  app.get('/oauth/authorize', (req, res) => {
    const { client_id, redirect_uri, code_challenge, code_challenge_method, state, scope, resource } = req.query;

    if (!redirect_uri || !isTrustedRedirect(client_id, redirect_uri)) {
      return res.status(400).send('Invalid or untrusted redirect_uri');
    }
    if (code_challenge_method !== 'S256' || !code_challenge) {
      return res.status(400).send('PKCE with code_challenge_method=S256 is required');
    }

    const hidden = { client_id, redirect_uri, code_challenge, state, scope, resource };
    // Say exactly who is asking. Anyone can register a client, so without this
    // a link to this page could trick the owner into approving someone else's
    // app — the code would be sent to the attacker's address.
    const clientName = clients.get(client_id)?.client_name || 'An MCP client';
    const destination = new URL(redirect_uri).host;
    const fields = Object.entries(hidden)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
      .join('\n');

    res.set('Content-Type', 'text/html').send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect Outbound OS</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f1115;color:#e6e6e6;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{background:#181b21;border:1px solid #2a2f3a;border-radius:14px;padding:32px;width:min(360px,90vw);box-shadow:0 10px 40px rgba(0,0,0,.4)}
  h1{font-size:18px;margin:0 0 4px}
  p{font-size:13px;color:#9aa4b2;margin:0 0 20px}
  label{font-size:12px;color:#9aa4b2;display:block;margin-bottom:6px}
  input[type=password]{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:9px;border:1px solid #2a2f3a;background:#0f1115;color:#fff;font-size:15px}
  button{margin-top:18px;width:100%;padding:11px;border:0;border-radius:9px;background:#4f7cff;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  button:hover{background:#3f6cf0}
  .err{color:#ff6b6b;font-size:12px;margin-top:12px}
</style></head><body>
  <form class="card" method="post" action="/oauth/authorize">
    <h1>Connect Outbound OS</h1>
    <p><strong>${escapeHtml(clientName)}</strong> is asking for full access to your CRM. Access will be sent to <strong>${escapeHtml(destination)}</strong>. Only continue if you started this connection.</p>
    <label for="pw">Access password</label>
    <input id="pw" type="password" name="password" autocomplete="current-password" autofocus>
    ${fields}
    <button type="submit">Authorize</button>
    ${req.query.error ? `<div class="err">Incorrect password. Try again.</div>` : ''}
  </form>
</body></html>`);
  });

  // Authorization endpoint — POST validates the password and issues a code.
  app.post('/oauth/authorize', (req, res) => {
    const { password, client_id, redirect_uri, code_challenge, state, scope, resource } = req.body;

    if (!redirect_uri || !isTrustedRedirect(client_id, redirect_uri)) {
      return res.status(400).send('Invalid or untrusted redirect_uri');
    }
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (tooManyFailures(ip)) {
      return res.status(429).send('Too many incorrect passwords. Try again in 15 minutes.');
    }
    if (!passwordMatches(password)) {
      recordFailure(ip);
      // Re-render the form with an error, preserving params.
      const qs = new URLSearchParams({ client_id, redirect_uri, code_challenge, code_challenge_method: 'S256', error: '1' });
      if (state) qs.set('state', state);
      if (scope) qs.set('scope', scope);
      if (resource) qs.set('resource', resource);
      return res.redirect(`/oauth/authorize?${qs.toString()}`);
    }

    const code = rand(24);
    codes.set(code, {
      client_id,
      redirect_uri,
      code_challenge,
      expires: Date.now() + CODE_TTL_MS,
    });

    const url = new URL(redirect_uri);
    url.searchParams.set('code', code);
    if (state) url.searchParams.set('state', state);
    log.info(`oauth: authorized device, issued code for redirect ${url.origin}`);
    res.redirect(url.toString());
  });

  // Token endpoint — authorization_code + refresh_token grants.
  app.post('/oauth/token', (req, res) => {
    const grant = req.body?.grant_type;

    if (grant === 'authorization_code') {
      const { code, code_verifier, redirect_uri } = req.body;
      const entry = codes.get(code);
      if (!entry) return res.status(400).json({ error: 'invalid_grant' });
      codes.delete(code); // single use
      if (entry.expires < Date.now()) return res.status(400).json({ error: 'invalid_grant', error_description: 'code expired' });
      if (entry.redirect_uri !== redirect_uri) return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
      if (!pkceMatches(code_verifier, entry.code_challenge)) return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });

      return res.json(issueTokens());
    }

    if (grant === 'refresh_token') {
      const { refresh_token } = req.body;
      if (!refresh_token || !store.refresh[refresh_token]) {
        return res.status(400).json({ error: 'invalid_grant' });
      }
      // Rotate: keep the same refresh token, issue a fresh access token.
      const access = rand(32);
      store.access[access] = { expires: Date.now() + ACCESS_TTL_MS };
      saveStore();
      return res.json({
        access_token: access,
        token_type: 'Bearer',
        expires_in: Math.floor(ACCESS_TTL_MS / 1000),
        refresh_token,
        scope: 'mcp',
      });
    }

    return res.status(400).json({ error: 'unsupported_grant_type' });
  });

  log.info('oauth: provider mounted (metadata, register, authorize, token)');
}

function issueTokens() {
  const access = rand(32);
  const refresh = rand(32);
  store.access[access] = { expires: Date.now() + ACCESS_TTL_MS };
  store.refresh[refresh] = {};
  saveStore();
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    refresh_token: refresh,
    scope: 'mcp',
  };
}
