/** Public connection details only. Credentials never leave the backend. */
export async function mcpConnectionStatus(env = process.env, fetcher = fetch) {
  let server;
  try {
    server = new URL(env.MCP_PUBLIC_URL || '');
    if (server.protocol !== 'https:' || server.username || server.password || server.search || server.hash || !server.pathname.endsWith('/mcp')) server = null;
  } catch { server = null; }
  const result = {
    serverUrl: server?.href || null,
    backendConfigured: Boolean(String(env.MCP_AUTH_MODE === 'personal' ? env.MCP_CONTROL_SECRET || '' : env.MCP_SERVICE_TOKEN || '').trim()),
    transport: 'streamable-http',
    authentication: ['oauth', 'bearer'],
    authorizationMode: env.MCP_AUTH_MODE === 'personal' ? 'personal' : 'legacy',
    legacyCompatibility: env.MCP_AUTH_MODE === 'personal' && env.MCP_LEGACY_COMPAT === 'true',
    health: { status: 'not_configured', checkedAt: null, message: 'Set MCP_PUBLIC_URL to the public HTTPS /mcp address on this API deployment.' },
    oauth: { available: false },
  };
  if (!server) return result;
  result.health.checkedAt = new Date().toISOString();
  // Only deployment configuration selects the destination. No request field or
  // redirect can turn this manager-only diagnostic into an arbitrary URL fetch.
  const base = new URL('./', server);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  async function readJson(path) {
    const response = await fetcher(new URL(path, base), { redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Unavailable');
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 16384) throw new Error('Response too large');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  try {
    const [health, oauth] = await Promise.all([readJson('healthz'), readJson('.well-known/oauth-authorization-server')]);
    const sameServer = (value) => { try { return new URL(value).origin === server.origin; } catch { return false; } };
    result.oauth.available = sameServer(oauth.issuer) && sameServer(oauth.authorization_endpoint) && sameServer(oauth.token_endpoint)
      && oauth.code_challenge_methods_supported?.includes('S256') === true;
    if (health.ok !== true && health.status !== 'ok') throw new Error('Not healthy');
    result.health.status = 'reachable';
    result.health.message = 'The server answers health and discovery requests. Authorize it in your AI client, then verify tools there; this does not prove an agent is connected.';
  } catch {
    result.health.status = 'unreachable';
    result.health.message = 'Could not verify the configured server. Check its container, HTTPS proxy and MCP_PUBLIC_URL. This check does not test credentials.';
  } finally { controller.abort(); clearTimeout(timeout); }
  return result;
}
