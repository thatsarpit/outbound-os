import { Router } from 'express';
import prisma from '../utils/prismaClient.js';
import { inboxViewerKey } from '../utils/inboxState.js';

const router = Router();
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const personalViewer = (req, res) => {
  const key = inboxViewerKey(req.user);
  if (!key) res.status(403).json({ error: 'Sign in personally to manage notification reads.' });
  return key;
};

router.get('/notifications', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const rows = await prisma.activityLog.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit });
    const viewerKey = inboxViewerKey(req.user);
    const [cursor, reads] = viewerKey ? await Promise.all([
      prisma.notificationCursor.findUnique({ where: { viewerKey } }),
      prisma.notificationRead.findMany({ where: { viewerKey, activityId: { in: rows.map(row => row.id) } }, select: { activityId: true } }),
    ]) : [null, []];
    const readIds = new Set(reads.map(row => row.activityId));
    res.json(rows.map(row => {
      let data = null;
      try { data = row.meta ? JSON.parse(row.meta) : null; } catch { /* Legacy metadata can be malformed. */ }
      return {
        id: row.id, type: row.type, message: row.message, accountId: row.accountId,
        leadId: row.leadId, data, timestamp: row.createdAt.toISOString(), createdAt: row.createdAt.toISOString(),
        read: row.id <= (cursor?.readThroughId || 0) || readIds.has(row.id),
      };
    }));
  } catch { res.status(500).json({ error: 'Could not load notifications.' }); }
});

router.patch('/notifications/read-all', async (req, res) => {
  const viewerKey = personalViewer(req, res);
  if (!viewerKey) return;
  const throughId = req.body?.throughId;
  if (!positiveId(throughId)) return res.status(400).json({ error: 'The latest displayed notification ID is required.' });
  try {
    if (!await prisma.activityLog.findUnique({ where: { id: throughId }, select: { id: true } })) {
      return res.status(404).json({ error: 'Notification not found.' });
    }
    await prisma.$transaction(async tx => {
      await tx.notificationCursor.upsert({ where: { viewerKey }, create: { viewerKey, readThroughId: throughId }, update: {} });
      await tx.notificationCursor.updateMany({ where: { viewerKey, readThroughId: { lt: throughId } }, data: { readThroughId: throughId } });
      await tx.notificationRead.deleteMany({ where: { viewerKey, activityId: { lte: throughId } } });
    });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Could not save notification reads.' }); }
});

router.patch('/notifications/:id/read', async (req, res) => {
  const viewerKey = personalViewer(req, res);
  if (!viewerKey) return;
  const activityId = Number(req.params.id);
  if (!positiveId(activityId)) return res.status(400).json({ error: 'A valid notification ID is required.' });
  try {
    if (!await prisma.activityLog.findUnique({ where: { id: activityId }, select: { id: true } })) {
      return res.status(404).json({ error: 'Notification not found.' });
    }
    await prisma.notificationRead.upsert({ where: { viewerKey_activityId: { viewerKey, activityId } }, create: { viewerKey, activityId }, update: {} });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Could not save notification read.' }); }
});

export default router;
