import { Router } from 'express';
import { requireRole } from '../auth/index.js';
import { isOutreachPaused, setOutreachPaused } from '../services/outreachPause.js';
import logger from '../utils/logger.js';

const router = Router();

router.get('/system/outreach', requireRole('manager'), async (_req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    res.json({ sendingPaused: await isOutreachPaused() });
  } catch (error) {
    logger.warn(`Outreach state unavailable: ${error.message}`);
    res.status(503).json({ error: 'Could not read workspace outreach status.' });
  }
});

for (const [path, paused] of [['/system/pause', true], ['/system/resume', false]]) {
  router.post(path, requireRole('manager'), async (req, res) => {
    try {
      res.json(await setOutreachPaused(paused, req.user));
    } catch (error) {
      logger.warn(`Outreach state update failed: ${error.message}`);
      res.status(503).json({ error: 'Could not change workspace outreach status.' });
    }
  });
}

export default router;
