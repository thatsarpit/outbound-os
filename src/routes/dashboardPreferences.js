import { Router } from 'express';
import prisma from '../utils/prismaClient.js';
import { AUTH_PROVIDER } from '../auth/index.js';
import { DASHBOARD_WIDGETS, defaultDashboardLayout, validateDashboardLayout } from '../../shared/dashboardLayout.js';

const router = Router();
const ownerKey = (req) => JSON.stringify([AUTH_PROVIDER, req.user.orgId, String(req.user.id)]);
const conflict = (res) => res.status(409).json({ error: 'Your layout changed in another session. Reload the saved layout before saving again.' });

router.param('page', (req, res, next, page) => {
  if (!Object.hasOwn(DASHBOARD_WIDGETS, page)) return res.status(404).json({ error: 'Unknown dashboard page.' });
  next();
});
router.get('/dashboard/preferences/:page', async (req, res) => {
  try {
    const record = await prisma.dashboardPreference.findUnique({ where: { ownerKey_page: { ownerKey: ownerKey(req), page: req.params.page } } });
    let layout = defaultDashboardLayout(req.params.page);
    if (record) {
      try { layout = validateDashboardLayout(req.params.page, JSON.parse(record.layout)); } catch { /* Old or invalid layouts recover to defaults. */ }
    }
    res.json({ layout, revision: record?.revision ?? 0 });
  } catch { res.status(500).json({ error: 'Could not load your dashboard layout.' }); }
});
router.put('/dashboard/preferences/:page', async (req, res) => {
  let layout;
  try {
    layout = validateDashboardLayout(req.params.page, req.body?.layout);
    if (!Number.isSafeInteger(req.body?.revision) || req.body.revision < 0) throw new Error('A nonnegative saved revision is required.');
  } catch (error) { return res.status(400).json({ error: error.message }); }
  const revision = req.body.revision;
  const key = { ownerKey: ownerKey(req), page: req.params.page };
  try {
    if (revision === 0) {
      await prisma.dashboardPreference.create({ data: { ...key, layout: JSON.stringify(layout), revision: 1 } });
    } else {
      const result = await prisma.dashboardPreference.updateMany({ where: { ...key, revision }, data: { layout: JSON.stringify(layout), revision: { increment: 1 } } });
      if (result.count !== 1) return conflict(res);
    }
    res.json({ layout, revision: revision + 1 });
  } catch (error) {
    if (error.code === 'P2002') return conflict(res);
    res.status(500).json({ error: 'Could not save your dashboard layout. Your edits are still available to retry.' });
  }
});
export default router;
