import { Router } from 'express';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';
import { getAccessiblePoolIds } from '../auth/rbac.js';
import { buildNewLeadDateWhere } from '../utils/reportingTime.js';
import { analyticsWindow } from '../utils/analyticsWindow.js';

const router = Router();
async function leadWindow(req, fallbackDays) {
  const { start, end } = analyticsWindow(req.query, fallbackDays);
  const accessible = await getAccessiblePoolIds(req);
  return {
    ...(start ? buildNewLeadDateWhere(start, end) : {}),
    ...(accessible !== null ? { poolId: { in: accessible } } : {}),
  };
}
router.get('/analytics/distributions', async (req, res) => {
  try {
    const where = await leadWindow(req, 30);
    const [countryDist, tierDist] = await Promise.all([
      prisma.lead.groupBy({ by: ['country'], where, _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 8 }),
      prisma.lead.groupBy({ by: ['leadTier'], where, _count: { id: true } }),
    ]);
    res.json({ countryDist, tierDist });
  } catch { res.status(500).json({ error: 'Could not load lead distributions.' }); }
});
router.get('/analytics/team', requireRole('manager'), async (req, res) => {
  try {
    // Existing API clients keep their all-time view when no period is supplied.
    const base = await leadWindow(req, null);
    const users = await prisma.user.findMany({ where: { role: { not: 'viewer' } }, select: { id: true, name: true, email: true, role: true, lastLoginAt: true }, orderBy: { name: 'asc' } });
    const stats = await Promise.all(users.map(async (user) => {
      const where = { ...base, assignedToId: user.id };
      const [assigned, replied, engaged, closed, score] = await Promise.all([
        prisma.lead.count({ where }),
        prisma.lead.count({ where: { ...where, status: 'replied' } }),
        prisma.lead.count({ where: { ...where, status: 'engaged' } }),
        prisma.lead.count({ where: { ...where, status: 'closed' } }),
        prisma.lead.aggregate({ where: { ...where, score: { gt: 0 } }, _avg: { score: true } }),
      ]);
      return { ...user, leadsAssigned: assigned, replied: replied + engaged, closed, avgScore: Math.round(score._avg.score || 0), conversionRate: assigned > 0 ? Math.round(closed / assigned * 100) : 0 };
    }));
    res.json(stats);
  } catch { res.status(500).json({ error: 'Could not load team performance.' }); }
});
export default router;
