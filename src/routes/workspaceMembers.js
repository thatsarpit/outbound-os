import { Router } from 'express';
import { requireRole } from '../auth/index.js';
import workspaceMembers from '../services/workspaceMembers.js';

export function createWorkspaceMemberRouter({ service = workspaceMembers, roleGuard = requireRole } = {}) {
  const router = Router();
  router.get('/workspace/members', roleGuard('agent'), async (req, res) => {
    try { res.json({ members: await service.list(req.user) }); }
    catch (error) { res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : 'The team directory is temporarily unavailable.', code: error.code }); }
  });
  return router;
}

export default createWorkspaceMemberRouter();
