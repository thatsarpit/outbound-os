import { Router } from 'express';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';
const router = Router();
router.patch('/connector-sources/:id', requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id), supplierId = Number(req.body?.supplierId);
    const tags = req.body?.tags || [];
    if (!Number.isSafeInteger(id) || !Number.isSafeInteger(supplierId) || supplierId < 1 || !Array.isArray(tags) || tags.length > 20 || tags.some((tag) => typeof tag !== 'string' || tag.length > 80 || tag.includes(','))) return res.status(422).json({ error: 'Supply a source ID, supplier ID and up to 20 tags.' });
    const source = await prisma.webhookSource.findUnique({ where: { id } });
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    const sameWorkspace = source?.tenantId == null ? [null, 1].includes(supplier?.tenantId) : supplier?.tenantId === source.tenantId;
    if (!source || !supplier?.enabled || !sameWorkspace) return res.status(404).json({ error: 'Source or supplier unavailable.' });
    await prisma.webhookSource.update({ where: { id }, data: { importSupplierId: supplier.id, importTags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))].join(', ') } });
    return res.json({ sourceId: id, supplierId, tags, outreachQueued: false });
  } catch { return res.status(503).json({ error: 'Could not configure source.' }); }
});
router.get('/connector-receipts', requireRole('manager'), async (req, res) => {
  const sourceId = Number(req.query.sourceId);
  if (!Number.isSafeInteger(sourceId) || sourceId < 1) return res.status(422).json({ error: 'Supply sourceId.' });
  const state = ['created', 'matched', 'conflict'].includes(req.query.state) ? req.query.state : undefined;
  try {
    const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
    const where = { sourceId, ...(state ? { state } : {}) };
    const [records, total] = await Promise.all([
      prisma.connectorReceipt.findMany({ where, orderBy: { id: 'asc' }, take: 100, skip: (page - 1) * 100 }),
      prisma.connectorReceipt.count({ where }),
    ]);
    res.json({ records, total, page, pages: Math.ceil(total / 100) });
  } catch { res.status(503).json({ error: 'Could not load import records.' }); }
});
export default router;
