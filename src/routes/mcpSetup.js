import { Router } from 'express';
import { requireRole } from '../auth/index.js';
import { mcpConnectionStatus } from '../services/mcpStatus.js';

const router = Router();
router.get('/integrations/mcp', requireRole('manager'), async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await mcpConnectionStatus());
});
export default router;
