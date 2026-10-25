import { randomBytes } from 'node:crypto';

const READ_TOOLS = new Set([
  'stats_overview', 'whatsapp_costs', 'analytics_funnel', 'analytics_campaign_roi', 'analytics_email_performance',
  'list_campaigns', 'get_campaign', 'campaign_ab_results', 'list_tags', 'list_leads', 'get_lead', 'lead_timeline',
  'list_messages', 'list_media_files', 'system_status', 'whatsapp_accounts', 'whatsapp_templates', 'list_users',
]);
export const personalReadToolAllowed = name => READ_TOOLS.has(name);

export function personalOAuthConfig(env = process.env) {
  if (env.MCP_AUTH_MODE !== 'personal') return null;
  const resource = new URL(env.MCP_PUBLIC_URL || '');
  const dashboard = new URL(env.MCP_DASHBOARD_ORIGIN || '');
  if (resource.protocol !== 'https:' || resource.pathname !== '/mcp' || resource.search || resource.hash || resource.username || resource.password
    || dashboard.protocol !== 'https:' || dashboard.pathname !== '/' || dashboard.search || dashboard.hash || dashboard.username || dashboard.password
    || !env.MCP_CONTROL_SECRET || env.MCP_CONTROL_SECRET.length < 32) {
    throw new Error('Personal MCP authorization needs canonical HTTPS URLs and a separate MCP_CONTROL_SECRET.');
  }
  return { resource: resource.href, issuer: resource.origin, dashboard: dashboard.origin,
    backend: env.BACKEND_URL || 'http://localhost:3001', secret: env.MCP_CONTROL_SECRET,
    legacyCompat: env.MCP_LEGACY_COMPAT === 'true' };
}

export async function personalControl(operation, body, config = personalOAuthConfig()) {
  if (!config) throw new Error('Personal MCP authorization is disabled.');
  const response = await fetch(new URL(`/api/mcp-control/${operation}`, config.backend), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error || 'Authorization service unavailable.'),
    { status: response.status, code: payload.code });
  return payload;
}

function scalarParameters(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.values(input).some(value => typeof value !== 'string' || value.length > 4096)) {
    throw Object.assign(new Error('OAuth parameters must be single bounded strings.'), { status: 400, code: 'invalid_request' });
  }
  return input;
}

export function mountPersonalOAuth(app, config, control = (operation, body) => personalControl(operation, body, config)) {
  const headers = (_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
    next();
  };
  const handle = fn => async (req, res, next) => {
    try {
      const requestHost = `${req.protocol}://${req.get('host')}`;
      // The canonical issuer never comes from a client-controlled forwarded host.
      // Caddy preserves the public Host and supplies the trusted HTTPS protocol.
      if (requestHost !== config.issuer) throw Object.assign(new Error('Use the configured MCP host.'), { status: 400 });
      await fn(req, res, next);
    } catch (error) {
      res.status(error.status || 503).json({ error: error.code || 'temporarily_unavailable',
        error_description: error.status ? error.message : 'Authorization service unavailable. Retry from your AI client.' });
    }
  };
  const metadata = {
    issuer: config.issuer, authorization_endpoint: `${config.issuer}/oauth/authorize`,
    token_endpoint: `${config.issuer}/oauth/token`, registration_endpoint: `${config.issuer}/oauth/register`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp:read'], authorization_response_iss_parameter_supported: true,
  };
  app.get('/.well-known/oauth-protected-resource', headers, handle(async (_req, res) => {
    res.json({ resource: config.resource, authorization_servers: [config.issuer], scopes_supported: ['mcp:read'] });
  }));
  for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/mcp']) {
    app.get(path, headers, handle(async (_req, res) => res.json(metadata)));
  }
  app.post('/oauth/register', headers, handle(async (req, res) => res.status(201).json(await control('register', req.body))));
  app.get('/oauth/authorize', headers, handle(async (req, res) => {
    const browserNonce = randomBytes(32).toString('base64url');
    const request = await control('request', { parameters: scalarParameters(req.query), browserNonce });
    if (!/^[\w-]{43}$/.test(request.id) || new URL(request.consentUrl).origin !== config.dashboard) throw new Error('Invalid consent destination.');
    res.cookie(`__Host-mcp-${request.id}`, browserNonce, { httpOnly: true, secure: true,
      sameSite: 'lax', path: '/', maxAge: 5 * 60_000 });
    res.redirect(303, request.consentUrl);
  }));
  app.post('/oauth/authorize', headers, (_req, res) => res.status(405).json({ error: 'Dashboard approval is required.' }));
  app.get('/oauth/complete', headers, handle(async (req, res) => {
    const parameters = scalarParameters(req.query);
    if (Object.keys(parameters).length !== 1 || !/^[\w-]{43}$/.test(parameters.request_id || '')) {
      throw Object.assign(new Error('Invalid connection request.'), { status: 400 });
    }
    const id = parameters.request_id;
    const cookieName = `__Host-mcp-${id}`;
    const values = (req.headers.cookie || '').split(';').map(item => item.trim()).filter(item => item.startsWith(`${cookieName}=`));
    if (values.length !== 1) throw Object.assign(new Error('Use the browser that started this connection.'), { status: 403 });
    const browserNonce = values[0].slice(cookieName.length + 1);
    if (!/^[\w-]{43}$/.test(browserNonce)) throw Object.assign(new Error('Invalid browser transaction.'), { status: 403 });
    const result = await control('complete', { id, browserNonce });
    res.clearCookie(cookieName, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    res.redirect(303, result.redirectUrl);
  }));
  app.post('/oauth/token', headers, handle(async (req, res, next) => {
    const body = scalarParameters(req.body);
    if (config.legacyCompat && body.grant_type === 'refresh_token'
      && typeof body.refresh_token === 'string' && !body.refresh_token.startsWith('mcp_refresh_')) return next();
    res.json(await control('token', body));
  }));
}
