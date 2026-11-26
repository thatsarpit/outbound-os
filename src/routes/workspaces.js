import { request } from 'node:http';
import { Router } from 'express';
import { appRoleFromOrgRole } from '../../shared/clerkRoles.js';

const ID = /^[a-z][a-z0-9-]{0,39}$/;
const ORG = /^org_[a-zA-Z0-9]+$/;
const WORKSPACE_HEADER = 'x-outboundos-workspace';
const REQUEST_HEADERS = ['accept', 'authorization', 'content-type', 'content-length', 'origin', 'referer', 'sec-fetch-site'];
const RESPONSE_HEADERS = ['content-type', 'content-disposition', 'content-length', 'retry-after', 'ratelimit', 'ratelimit-policy', 'x-accel-buffering'];

export function workspaceConfig(env = process.env) {
  if (!env.OUTBOUNDOS_WORKSPACES) return [];
  const provider = env.AUTH_PROVIDER || (env.CLERK_SECRET_KEY ? 'clerk' : 'local');
  if (provider.toLowerCase() !== 'clerk' || !ORG.test(env.CLERK_ORGANIZATION_ID || '')) {
    throw new Error('Workspaces require Clerk and a pinned primary organization.');
  }

  const entries = JSON.parse(env.OUTBOUNDOS_WORKSPACES);
  if (!Array.isArray(entries) || !entries.length || entries.length > 16) {
    throw new Error('Configure between one and sixteen secondary workspaces.');
  }

  if (env.OUTBOUNDOS_WORKSPACE_ID) throw new Error('A secondary workspace cannot route other workspaces.');
  const primary = {
    id: 'primary',
    name: env.OUTBOUNDOS_PRIMARY_WORKSPACE_NAME?.trim() || 'Primary workspace',
    organizationId: env.CLERK_ORGANIZATION_ID,
  };
  const workspaces = [primary];
  for (const entry of entries) {
    const { id, name, organizationId, origin } = entry || {};
    if (typeof id !== 'string' || !ID.test(id) || typeof name !== 'string' || !name.trim() ||
        name.length > 80 || typeof organizationId !== 'string' || !ORG.test(organizationId) ||
        typeof origin !== 'string' ||
        !/^http:\/\/(?:127\.0\.0\.1|workspace-[a-z][a-z0-9-]{0,39}):[1-9][0-9]{0,4}$/.test(origin)) {
      throw new Error('Each workspace needs an ID, name, Clerk organization and private HTTP origin.');
    }
    const privateOrigin = new URL(origin).origin;
    if (workspaces.some(item => item.id === id || item.organizationId === organizationId || item.origin === privateOrigin)) {
      throw new Error('Workspace IDs, organizations and private origins must be distinct.');
    }
    workspaces.push({ id, name: name.trim(), organizationId, origin: privateOrigin });
  }
  return workspaces;
}

export function workspaceRuntime(env = process.env) {
  const id = env.OUTBOUNDOS_WORKSPACE_ID || '';
  if (id && (!ID.test(id) || id === 'primary' || env.AUTH_PROVIDER !== 'clerk' || !ORG.test(env.CLERK_ORGANIZATION_ID || ''))) {
    throw new Error('A secondary workspace must have its own ID and pinned Clerk organization.');
  }
  return (req, res, next) => {
    if ((req.get(WORKSPACE_HEADER) || '') !== id) {
      return res.status(404).json({ error: 'Workspace runtime unavailable.' });
    }
    next();
  };
}

function proxyWorkspace(req, res, workspace, { inbound = false } = {}) {
  const headers = {};
  for (const key of REQUEST_HEADERS) {
    if (req.headers[key] !== undefined) headers[key] = req.headers[key];
  }
  // Clerk's middleware still validates the bearer on the private runtime.
  headers[WORKSPACE_HEADER] = workspace.id;
  headers['x-forwarded-proto'] = req.protocol;
  if (req.ip) headers['x-forwarded-for'] = req.ip;
  if (inbound) {
    headers['x-api-key'] = req.get('x-api-key');
    delete headers.authorization;
  }
  // Connect to the configured private origin. The incoming URL only supplies
  // the path and query of the HTTP request on that connection.
  const target = new URL(workspace.origin);
  const connection = request({
    hostname: target.hostname,
    port: target.port || 80,
    path: '/api' + req.url,
    method: req.method,
    headers,
  }, upstream => {
    res.status(upstream.statusCode);
    for (const key of RESPONSE_HEADERS) {
      if (upstream.headers[key] !== undefined) res.set(key, upstream.headers[key]);
    }
    upstream.once('error', () => res.destroy());
    upstream.pipe(res);
  });
  connection.setTimeout(65_000, () => connection.destroy());
  connection.once('error', () => {
    if (res.headersSent) res.destroy();
    else res.status(502).json({ error: 'This workspace is temporarily unavailable.' });
  });
  res.once('close', () => {
    if (!res.writableFinished) connection.destroy();
  });
  req.pipe(connection);
}

export function createWorkspaceRouter({ workspaces, getSession, getMemberships }) {
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (!workspaces.length) return res.status(404).json({ error: 'Workspaces are unavailable.' });
    next();
  });

  router.get('/', async (req, res) => {
    const session = getSession(req);
    if (!req.get('authorization')?.startsWith('Bearer ') || !session?.userId || !session?.sessionId) {
      return res.status(401).json({ error: 'Sign in to view your workspaces.' });
    }
    try {
      const memberships = new Set();
      let offset = 0;
      const limit = 100;
      while (true) {
        const page = await getMemberships({ userId: session.userId, offset, limit });
        for (const membership of page.data) {
          if (appRoleFromOrgRole(membership.role)) memberships.add(membership.organization.id);
        }
        offset += page.data.length;
        if (!page.data.length || offset >= page.totalCount) break;
      }
      res.json({
        workspaces: workspaces
          .filter(item => memberships.has(item.organizationId))
          .map(({ id, name, organizationId }) => ({ id, name, organizationId })),
      });
    } catch {
      res.status(503).json({ error: 'Workspace membership is temporarily unavailable.' });
    }
  });

  router.use('/:id', (req, res) => {
    const workspace = workspaces.find(item => item.id === req.params.id && item.origin);
    if (!workspace) return res.status(404).json({ error: 'Workspace unavailable.' });
    const pathname = req.url.split('?', 1)[0];
    // Reject noncanonical spellings before matching public or control paths.
    if (!/^\/[a-z0-9/_\-.~]+$/i.test(pathname) || /\/\/|(?:^|\/)\.{1,2}(?:\/|$)/.test(pathname)) {
      return res.status(404).json({ error: 'This route is unavailable in this workspace.' });
    }

    if (/^\/webhooks\/(?:inbound|whatsapp-handoff)\/[a-z0-9_-]+$/i.test(pathname) && req.method === 'POST') {
      if (!req.is('application/json')) return res.status(415).json({ error: 'Send a JSON webhook payload.' });
      if (!req.get('x-api-key')) return res.status(401).json({ error: 'Provide the workspace source key in the x-api-key header.' });
      return proxyWorkspace(req, res, workspace, { inbound: true });
    }

    if (/^\/(?:workspaces|mcp-control|push|public)(?:\/|$)/i.test(pathname) ||
        (/^\/webhooks\//i.test(pathname) && !/^\/webhooks\/sources(?:\/|$)/i.test(pathname))) {
      return res.status(404).json({ error: 'This route is unavailable in this workspace.' });
    }

    const session = getSession(req);
    if (!req.get('authorization')?.startsWith('Bearer ') || !session?.userId || !session?.sessionId) {
      return res.status(401).json({ error: 'Sign in to open this workspace.' });
    }
    if (session.orgId !== workspace.organizationId || !appRoleFromOrgRole(session.orgRole)) {
      return res.status(403).json({ error: 'Select this workspace before continuing.' });
    }
    proxyWorkspace(req, res, workspace);
  });
  return router;
}
