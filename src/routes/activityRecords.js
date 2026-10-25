import { Router } from 'express';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';

const router = Router();
router.get('/activity/records', requireRole('admin'), async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const where = {};
    if (req.query.type) {
      if (typeof req.query.type !== 'string' || req.query.type.length > 100) return res.status(400).json({ error: 'Choose a valid activity type.' });
      where.type = req.query.type;
    }
    const [rows, total, groups] = await Promise.all([
      prisma.activityLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
      prisma.activityLog.count({ where }),
      prisma.activityLog.groupBy({ by: ['type'], _count: { _all: true } }),
    ]);
    res.json({
      items: rows.map(row => ({ id: row.id, type: row.type, message: row.message, leadId: row.leadId, accountId: row.accountId,
        timestamp: row.createdAt.toISOString() })),
      total, page, pages: Math.ceil(total / limit), types: groups.map(group => group.type).sort(),
    });
  } catch { res.status(500).json({ error: 'Could not load recorded activity.' }); }
});
export default router;
