import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const REQUEST_TTL = 5 * 60_000;
const ACCESS_TTL = 15 * 60_000;
const FAMILY_TTL = 30 * 24 * 60 * 60_000;
const REFRESH_IDLE_TTL = 7 * 24 * 60 * 60_000;
const random = () => randomBytes(32).toString('base64url');
export const mcpHash = value => createHash('sha256').update(String(value)).digest('hex');
function requestKey(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(id)) throw mcpError('Invalid connection request.');
  return mcpHash(id);
}
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string'
  && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function mcpError(message, status = 400, code = 'invalid_request') {
  return Object.assign(new Error(message), { status, code });
}

/** Only the documented, side-effect-free tools are enabled in personal mode. */
export const MCP_READ_OPERATIONS = Object.freeze({
  stats_overview: /^\/api\/stats\/overview$/,
  whatsapp_costs: /^\/api\/analytics\/whatsapp-pricing$/,
  analytics_funnel: /^\/api\/analytics\/funnel$/,
  analytics_campaign_roi: /^\/api\/analytics\/campaign-roi$/,
  analytics_email_performance: /^\/api\/analytics\/email-performance$/,
  list_campaigns: /^\/api\/campaigns$/,
  get_campaign: /^\/api\/campaigns\/[1-9]\d*$/,
  campaign_ab_results: /^\/api\/campaigns\/[1-9]\d*\/ab-results$/,
  list_tags: /^\/api\/leads\/tags$/,
  list_leads: /^\/api\/leads$/,
  get_lead: /^\/api\/leads\/[1-9]\d*$/,
  lead_timeline: /^\/api\/leads\/[1-9]\d*\/timeline$/,
  list_messages: /^\/api\/leads\/[1-9]\d*\/messages$/,
  list_media_files: /^\/api\/media$/,
  system_status: /^\/api\/system\/status$/,
  whatsapp_accounts: /^\/api\/whatsapp\/accounts$/,
  whatsapp_templates: /^\/api\/whatsapp\/accounts\/[1-9]\d*\/templates$/,
  list_users: /^\/api\/users$/,
});

export function mcpReadOperationAllowed(tool, method, pathname) {
  return method === 'GET' && typeof pathname === 'string'
    && Object.hasOwn(MCP_READ_OPERATIONS, tool) && MCP_READ_OPERATIONS[tool].test(pathname);
}

export function personalMcpConfig(env = process.env) {
  if (env.MCP_AUTH_MODE !== 'personal') return null;
  const url = (value, name, endpoint = false) => {
    let result;
    try { result = new URL(value); } catch { throw mcpError(`${name} must be configured.`, 503); }
    if (result.protocol !== 'https:' || result.username || result.password || result.search || result.hash
      || (endpoint ? result.pathname !== '/mcp' : !['', '/'].includes(result.pathname))) {
      throw mcpError(`${name} must be a canonical HTTPS ${endpoint ? '/mcp endpoint' : 'origin'}.`, 503);
    }
    return result;
  };
  const resource = url(env.MCP_PUBLIC_URL, 'MCP_PUBLIC_URL', true);
  const dashboard = url(env.MCP_DASHBOARD_ORIGIN, 'MCP_DASHBOARD_ORIGIN');
  if (typeof env.MCP_CONTROL_SECRET !== 'string' || env.MCP_CONTROL_SECRET.length < 32) {
    throw mcpError('MCP_CONTROL_SECRET must contain at least 32 characters.', 503);
  }
  const workspace = String(env.MCP_WORKSPACE_ID || '').trim();
  if (!workspace || workspace.length > 200) throw mcpError('MCP_WORKSPACE_ID must identify this installation.', 503);
  return { issuer: resource.origin, resource: resource.href, dashboard: dashboard.origin,
    workspace, secret: env.MCP_CONTROL_SECRET };
}

export function acceptableMcpRedirect(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return !parsed.username && !parsed.password && !parsed.hash
      && (parsed.protocol === 'https:' || (parsed.protocol === 'http:'
        && ['127.0.0.1', '[::1]', 'localhost'].includes(parsed.hostname)));
  } catch { return false; }
}

function fields(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw mcpError('Invalid request.');
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.includes(key) || typeof value !== 'string' || value.length > 4096) throw mcpError('Invalid OAuth parameters.');
  }
}

export function parseMcpAuthorization(input, resource) {
  fields(input, ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource']);
  if (input.response_type !== 'code' || !input.client_id || !acceptableMcpRedirect(input.redirect_uri)
    || input.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge || '')) {
    throw mcpError('A registered callback, code response and S256 PKCE challenge are required.');
  }
  if (input.resource !== resource) throw mcpError('The requested MCP resource is not supported.', 400, 'invalid_target');
  if (input.scope && input.scope !== 'mcp:read') throw mcpError('Personal connections currently support mcp:read only.', 400, 'invalid_scope');
  return { clientId: input.client_id, redirectUri: input.redirect_uri, challenge: input.code_challenge,
    state: input.state ?? null, resource, scope: 'mcp:read' };
}

export function emptyMcpLedger() {
  return { version: 1, clients: {}, requests: {}, codes: {}, grants: {}, access: {}, refresh: {}, events: [] };
}

/** A single CAS-updated row makes issuance, rotation and revocation atomic on SQLite. */
export function prismaMcpRepository(prisma) {
  return {
    async mutate(fn) {
      for (let retry = 0; retry < 8; retry++) {
        let row = await prisma.mcpAuthorizationStore.findUnique({ where: { id: 'mcp-v1' } });
        if (!row) {
          try { row = await prisma.mcpAuthorizationStore.create({ data: { id: 'mcp-v1', value: JSON.stringify(emptyMcpLedger()) } }); }
          catch (error) { if (error.code === 'P2002') continue; throw error; }
        }
        const state = JSON.parse(row.value);
        if (state.version !== 1) throw mcpError('MCP authorization storage needs an upgrade.', 503);
        const result = fn(state);
        const updated = await prisma.mcpAuthorizationStore.updateMany({
          where: { id: row.id, revision: row.revision },
          data: { value: JSON.stringify(state), revision: { increment: 1 } },
        });
        if (updated.count === 1) return result;
      }
      throw mcpError('Another authorization update is in progress. Try again.', 409);
    },
  };
}

/**
 * The API is the only writer. The MCP container reaches this service through a
 * separately authenticated control channel; browser sessions cannot call it.
 */
export class McpAuthorization {
  constructor({ repository, resolvePerson, config, now = Date.now }) {
    this.repository = repository;
    this.resolvePerson = resolvePerson;
    this.config = config;
    this.now = now;
  }

  async person(owner) {
    if (!owner || owner.workspace !== this.config.workspace || owner.id === 'mcp-service' || owner.delegated) {
      throw mcpError('A personal workspace administrator must sign in.', 403, 'access_denied');
    }
    const live = await this.resolvePerson(owner);
    if (!live || live.role !== 'admin' || live.workspace !== this.config.workspace || String(live.id) !== String(owner.id)) {
      throw mcpError('Your current workspace membership cannot authorize this connection.', 403, 'access_denied');
    }
    return live;
  }

  update(fn) {
    return this.repository.mutate(state => {
      const now = this.now();
      for (const collection of ['requests', 'codes', 'access']) {
        for (const [key, value] of Object.entries(state[collection])) if (value.expires <= now) delete state[collection][key];
      }
      // Keep consumed refresh hashes until their family expires to detect reuse.
      for (const [key, value] of Object.entries(state.refresh)) if (value.expires <= now) delete state.refresh[key];
      for (const [key, value] of Object.entries(state.grants)) if (value.expires <= now) delete state.grants[key];
      for (const [key, value] of Object.entries(state.clients)) {
        if (value.expires <= now && !Object.values(state.grants).some(grant => grant.clientId === key)) delete state.clients[key];
      }
      return fn(state, now);
    });
  }

  event(state, kind, detail, now) {
    state.events.push({ id: random(), kind, at: now, ...detail });
    state.events = state.events.slice(-500);
  }

  register(input) {
    const redirects = input?.redirect_uris;
    if (!Array.isArray(redirects) || redirects.length === 0 || redirects.length > 10
      || new Set(redirects).size !== redirects.length || !redirects.every(acceptableMcpRedirect)
      || (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== 'none')) {
      throw mcpError('Register one to ten exact HTTPS or loopback callback URLs.', 400, 'invalid_redirect_uri');
    }
    return this.update((state, now) => {
      if (Object.keys(state.clients).length >= 1000) throw mcpError('Client registration is full. Contact the administrator.', 429);
      const id = `mcp-${random()}`;
      state.clients[id] = { name: typeof input.client_name === 'string' ? input.client_name.slice(0, 120) : 'MCP client',
        redirects: [...redirects], expires: now + FAMILY_TTL };
      return { client_id: id, client_id_issued_at: Math.floor(now / 1000), redirect_uris: redirects,
        token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] };
    });
  }

  createRequest(input, browserNonce) {
    const parsed = parseMcpAuthorization(input, this.config.resource);
    if (typeof browserNonce !== 'string' || !/^[\w-]{43}$/.test(browserNonce)) throw mcpError('Invalid browser transaction.');
    return this.update((state, now) => {
      const client = Object.hasOwn(state.clients, parsed.clientId) ? state.clients[parsed.clientId] : null;
      if (!client || !client.redirects.includes(parsed.redirectUri)) throw mcpError('The exact callback is not registered.', 400, 'invalid_redirect_uri');
      if (Object.keys(state.requests).length >= 1000) throw mcpError('Too many pending connections. Try again later.', 429);
      const id = random();
      state.requests[requestKey(id)] = { ...parsed, clientName: client.name, status: 'pending',
        browserHash: mcpHash(browserNonce), expires: now + REQUEST_TTL };
      return { id, expiresAt: now + REQUEST_TTL,
        consentUrl: `${this.config.dashboard}/integrations/mcp/authorize?request_id=${id}` };
    });
  }

  async details(id, owner) {
    const person = await this.person(owner);
    return this.update((state, now) => {
      const request = state.requests[requestKey(id)];
      if (!request || request.status !== 'pending') throw mcpError('This connection request expired or was already used. Start again in your AI client.', 410);
      const nonce = random();
      request.decisionHash = mcpHash(nonce);
      request.owner = { id: String(person.id), provider: person.provider, orgId: person.orgId, workspace: person.workspace };
      return { id, clientName: request.clientName, callbackHost: new URL(request.redirectUri).host,
        verifiedClient: false, scope: request.scope, workspace: person.workspace, expiresAt: request.expires,
        person: { name: person.name || '', email: person.email || '', role: person.role }, decisionNonce: nonce, issuedAt: now };
    });
  }

  async decide(id, input, owner) {
    const person = await this.person(owner);
    fields(input, ['decision', 'decisionNonce']);
    if (!['allow', 'deny'].includes(input.decision)) throw mcpError('Choose Allow access or Cancel.');
    return this.update((state, now) => {
      const request = state.requests[requestKey(id)];
      if (!request || request.status !== 'pending' || String(request.owner?.id) !== String(person.id)
        || request.owner?.provider !== person.provider || request.owner?.orgId !== person.orgId
        || !safeEqual(request.decisionHash, mcpHash(input.decisionNonce || ''))) {
        throw mcpError('This decision is no longer valid. Reload the connection request.', 409);
      }
      request.status = input.decision === 'allow' ? 'approved' : 'denied';
      delete request.decisionHash;
      this.event(state, `authorization_${request.status}`, { userId: String(person.id), clientId: request.clientId }, now);
      return { completionUrl: `${this.config.issuer}/oauth/complete?request_id=${id}` };
    });
  }

  async complete(id, browserNonce) {
    const request = await this.update(state => state.requests[requestKey(id)] ? structuredClone(state.requests[requestKey(id)]) : null);
    if (!request || !safeEqual(request.browserHash, mcpHash(browserNonce || ''))) throw mcpError('Use the same browser that started this connection.', 403);
    if (request.status === 'approved') await this.person(request.owner);
    return this.update((state, now) => {
      const current = state.requests[requestKey(id)];
      if (!current || !['approved', 'denied'].includes(current.status)
        || !safeEqual(current.browserHash, mcpHash(browserNonce || ''))) throw mcpError('Connection request expired or was already completed.', 410);
      const redirect = new URL(current.redirectUri);
      if (current.status === 'denied') redirect.searchParams.set('error', 'access_denied');
      else {
        const code = random();
        state.codes[mcpHash(code)] = { ...current, expires: now + REQUEST_TTL };
        redirect.searchParams.set('code', code);
      }
      if (current.state !== null) redirect.searchParams.set('state', current.state);
      redirect.searchParams.set('iss', this.config.issuer);
      delete state.requests[requestKey(id)];
      return { redirectUrl: redirect.href };
    });
  }

  tokens(state, grant, now) {
    if (Object.keys(state.access).length >= 10_000 || Object.keys(state.refresh).length >= 10_000) {
      throw mcpError('Authorization storage is full. Contact the administrator.', 429);
    }
    const access = `mcp_personal_${random()}`;
    const refresh = `mcp_refresh_${random()}`;
    const accessExpires = Math.min(now + ACCESS_TTL, grant.expires);
    state.access[mcpHash(access)] = { grantId: grant.id, expires: accessExpires };
    state.refresh[mcpHash(refresh)] = { grantId: grant.id, used: false,
      expires: Math.min(now + REFRESH_IDLE_TTL, grant.expires) };
    return { access_token: access, refresh_token: refresh, token_type: 'Bearer',
      expires_in: Math.floor((accessExpires - now) / 1000), scope: 'mcp:read' };
  }

  async exchange(input) {
    fields(input, ['grant_type', 'code', 'code_verifier', 'redirect_uri', 'client_id', 'resource', 'refresh_token', 'scope']);
    if (input.resource !== this.config.resource) throw mcpError('Incorrect resource.', 400, 'invalid_target');
    if (input.scope && input.scope !== 'mcp:read') throw mcpError('Unsupported scope.', 400, 'invalid_scope');
    const isCode = input.grant_type === 'authorization_code';
    if (!isCode && input.grant_type !== 'refresh_token') throw mcpError('Unsupported grant type.', 400, 'unsupported_grant_type');
    const hash = mcpHash(isCode ? input.code || '' : input.refresh_token || '');
    const snapshot = await this.update(state => {
      const entry = (isCode ? state.codes : state.refresh)[hash];
      return entry ? structuredClone(isCode ? entry : state.grants[entry.grantId]) : null;
    });
    if (!snapshot) throw mcpError('The credential is expired or invalid.', 400, 'invalid_grant');
    await this.person(snapshot.owner);
    const result = await this.update((state, now) => {
      if (isCode) {
        const code = state.codes[hash];
        if (!code || code.clientId !== input.client_id || code.redirectUri !== input.redirect_uri
          || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier || '')
          || !safeEqual(createHash('sha256').update(input.code_verifier).digest('base64url'), code.challenge)) {
          throw mcpError('Invalid authorization code or PKCE verifier.', 400, 'invalid_grant');
        }
        if (Object.keys(state.grants).length >= 500) throw mcpError('Connection limit reached. Revoke an unused connection.', 429);
        delete state.codes[hash];
        const grant = { id: random(), clientId: code.clientId, clientName: code.clientName,
          callbackHost: new URL(code.redirectUri).host, owner: code.owner, scope: code.scope, resource: code.resource,
          createdAt: now, expires: now + FAMILY_TTL, revokedAt: null, lastToolAt: null };
        state.grants[grant.id] = grant;
        this.event(state, 'grant_issued', { grantId: grant.id, userId: grant.owner.id, clientId: grant.clientId }, now);
        return this.tokens(state, grant, now);
      }
      const refresh = state.refresh[hash];
      const grant = refresh && state.grants[refresh.grantId];
      if (!grant || grant.revokedAt !== null || grant.clientId !== input.client_id) {
        throw mcpError('Invalid refresh token.', 400, 'invalid_grant');
      }
      if (refresh.used) {
        grant.revokedAt = now;
        this.event(state, 'refresh_reuse', { grantId: grant.id, userId: grant.owner.id, clientId: grant.clientId }, now);
        // Commit revocation before returning the protocol error.
        return { error: 'invalid_grant', replay: true };
      }
      refresh.used = true;
      refresh.expires = grant.expires;
      return this.tokens(state, grant, now);
    });
    if (result.error) throw mcpError('A refresh token was reused. Reconnect this client.', 400, result.error);
    return result;
  }

  async access(token) {
    if (typeof token !== 'string' || !/^mcp_personal_[\w-]{43}$/.test(token)) throw mcpError('Invalid access token.', 401, 'invalid_token');
    const grant = await this.update(state => {
      const access = state.access[mcpHash(token)];
      const grant = access && state.grants[access.grantId];
      return grant && grant.revokedAt === null ? structuredClone(grant) : null;
    });
    if (!grant || grant.resource !== this.config.resource || grant.scope !== 'mcp:read') throw mcpError('Connection expired or revoked.', 401, 'invalid_token');
    return { grant, person: await this.person(grant.owner) };
  }

  async inventory(owner) {
    const person = await this.person(owner);
    return this.update(state => ({ mode: 'personal', readOnly: true,
      grants: Object.values(state.grants).filter(grant => grant.owner.id === String(person.id)
        && grant.owner.provider === person.provider && grant.owner.orgId === person.orgId)
        .map(({ id, clientName, callbackHost, scope, createdAt, expires, revokedAt, lastToolAt }) =>
          ({ id, clientName, callbackHost, scope, createdAt, expiresAt: expires, revokedAt, lastToolAt }))
        .sort((a, b) => b.createdAt - a.createdAt),
    }));
  }

  async revoke(id, owner) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(id)) throw mcpError('Connection not found.', 404);
    const person = await this.person(owner);
    return this.update((state, now) => {
      const grant = state.grants[id];
      if (!grant || grant.owner.id !== String(person.id) || grant.owner.provider !== person.provider
        || grant.owner.orgId !== person.orgId) throw mcpError('Connection not found.', 404);
      grant.revokedAt ??= now;
      this.event(state, 'grant_revoked', { grantId: id, userId: person.id, clientId: grant.clientId }, now);
      return { ok: true };
    });
  }

  async delegate({ token, tool, method, path }) {
    if (!mcpReadOperationAllowed(tool, method, path)) throw mcpError('This personal connection permits read-only tools only.', 403, 'insufficient_scope');
    const { grant } = await this.access(token);
    const payload = Buffer.from(JSON.stringify({ accessHash: mcpHash(token), grantId: grant.id, tool, method, path,
      aud: 'outbound-os-api:mcp-delegation', workspace: this.config.workspace, expires: this.now() + 30_000 })).toString('base64url');
    const signature = createHmac('sha256', this.config.secret).update(payload).digest('base64url');
    return { assertion: `mcp_delegation_${payload}.${signature}` };
  }

  async verifyDelegation(token, method, path) {
    const raw = token.slice('mcp_delegation_'.length);
    const [payload, signature, extra] = raw.split('.');
    if (extra || !payload || !safeEqual(signature, createHmac('sha256', this.config.secret).update(payload).digest('base64url'))) throw mcpError('Invalid delegated credential.', 401);
    let parsed;
    try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw mcpError('Invalid delegated credential.', 401); }
    if (parsed.aud !== 'outbound-os-api:mcp-delegation' || parsed.workspace !== this.config.workspace
      || parsed.expires <= this.now() || parsed.expires > this.now() + 30_000
      || parsed.method !== method || parsed.path !== path || !mcpReadOperationAllowed(parsed.tool, method, path)) throw mcpError('Delegated operation is not permitted.', 403);
    const grant = await this.update(state => {
      const access = state.access[parsed.accessHash];
      const grant = access && state.grants[access.grantId];
      if (!grant || grant.id !== parsed.grantId || grant.revokedAt !== null || grant.resource !== this.config.resource
        || grant.scope !== 'mcp:read') return null;
      return structuredClone(grant);
    });
    if (!grant) throw mcpError('Connection expired or revoked.', 401);
    const person = await this.person(grant.owner);
    return { ...person, mcpGrantId: grant.id, mcpClientId: grant.clientId, delegated: true, mcpTool: parsed.tool };
  }

  recordTool(actor, outcome, correlationId) {
    return this.update((state, now) => {
      const grant = state.grants[actor.mcpGrantId];
      if (grant && outcome < 400) grant.lastToolAt = now;
      this.event(state, 'tool_result', { grantId: actor.mcpGrantId, userId: String(actor.id),
        clientId: actor.mcpClientId, tool: actor.mcpTool, outcome, correlationId }, now);
    });
  }
}
