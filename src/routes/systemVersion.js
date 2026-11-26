import { Router } from 'express';
import { readBuildInfo } from '../../shared/buildInfo.js';

const router = Router();
const build = readBuildInfo();

router.get('/system/version', (_req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(build);
});

export default router;
