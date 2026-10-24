import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireRole } from '../auth/index.js';
import { getPersonalMcpService, mcpPersonalOwner, personalMcpControlAuthorized } from '../auth/mcpPersonal.js';
import { mcpError, personalMcpConfig } from '../services/mcpAuthorization.js';

const router = Router();
const idValid = value => typeof value === 'string' && /^[\w-]{43}$/.test(value);
const secure = (_req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Frame-Options': 'DENY' });
  next();
};
const handle = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) {
    res.status(error.status || 503).json({ error: error.status ? error.message : 'MCP authorization is temporarily unavailable.', code: error.code || 'temporarily_unavailable' });
  }
};

router.use(['/mcp-control', '/integrations/mcp/authorization', '/integrations/mcp/grants'], secure,
  rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));

router.post('/mcp-control/:operation', handle(async (req, res) => {
  const service = getPersonalMcpService();
  if (!service) throw mcpError('Personal MCP authorization is disabled.', 404);
  if (!personalMcpControlAuthorized(req)) throw mcpError('Invalid control-channel credential.', 401);
  const body = req.body || {};
  const actions = {
    register: () => service.register(body),
    request: () => service.createRequest(body.parameters, body.browserNonce),
    complete: () => service.complete(body.id, body.browserNonce),
    token: () => service.exchange(body),
    inspect: async () => {
      const { grant } = await service.access(body.token);
      return { grantId: grant.id, scope: grant.scope, resource: grant.resource };
    },
    delegate: () => service.delegate(body),
  };
  if (!Object.hasOwn(actions, req.params.operation)) throw mcpError('Unknown control operation.', 404);
  res.json(await actions[req.params.operation]());
}));

const owner = req => {
  const identity = mcpPersonalOwner(req);
  if (!identity) throw mcpError('Sign in with your personal administrator account.', 403);
  return identity;
};
const sameOrigin = req => {
  if (req.headers.origin !== personalMcpConfig()?.dashboard) throw mcpError('This action must start in your dashboard.', 403);
};

router.get('/integrations/mcp/grants', requireRole('manager'), handle(async (req, res) => {
  const service = getPersonalMcpService();
  if (!service) return res.json({ mode: 'legacy', readOnly: false, grants: [] });
  res.json(await service.inventory(owner(req)));
}));
router.delete('/integrations/mcp/grants/:id', requireRole('admin'), handle(async (req, res) => {
  sameOrigin(req);
  if (!idValid(req.params.id)) throw mcpError('Connection not found.', 404);
  res.json(await getPersonalMcpService().revoke(req.params.id, owner(req)));
}));
router.get('/integrations/mcp/authorization/:id', requireRole('admin'), handle(async (req, res) => {
  if (!idValid(req.params.id)) throw mcpError('Invalid connection request.');
  const service = getPersonalMcpService();
  if (!service) throw mcpError('Personal MCP authorization is disabled.', 404);
  res.json(await service.details(req.params.id, owner(req)));
}));
router.post('/integrations/mcp/authorization/:id', requireRole('admin'), handle(async (req, res) => {
  sameOrigin(req);
  if (!idValid(req.params.id)) throw mcpError('Invalid connection request.');
  const service = getPersonalMcpService();
  if (!service) throw mcpError('Personal MCP authorization is disabled.', 404);
  res.json(await service.decide(req.params.id, req.body, owner(req)));
}));

export default router;
