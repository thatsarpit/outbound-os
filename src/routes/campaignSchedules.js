import { Router } from 'express';
import { requireRole } from '../auth/index.js';
import scheduler from '../services/campaignScheduler.js';

const router = Router();
for (const [method, action] of [['post', 'schedule'], ['delete', 'cancel']]) {
  router[method]('/campaigns/:id/schedule', requireRole('manager'), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid campaign ID.' });
    try { res.json(await scheduler[action](id, req.body)); }
    catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Could not update the campaign schedule.' }); }
  });
}
export default router;
