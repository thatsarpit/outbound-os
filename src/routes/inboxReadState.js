import { Router } from 'express';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';
import { requireLeadAccess } from '../auth/rbac.js';
import { inboxViewerKey } from '../utils/inboxState.js';

const router = Router();

router.post('/inbox/threads/:leadId/read', requireRole('viewer'), requireLeadAccess('leadId'), async (req, res) => {
  try {
    const viewerKey = inboxViewerKey(req.user);
    if (!viewerKey) return res.status(403).json({ error: 'A personal session is required to mark a conversation read.' });
    const messageId = Number(req.body?.messageId);
    if (!Number.isSafeInteger(messageId) || messageId <= 0) return res.status(400).json({ error: 'A valid message ID is required.' });
    const message = await prisma.message.findFirst({ where: { id: messageId, leadId: req.lead.id }, select: { id: true } });
    if (!message) return res.status(400).json({ error: 'That message does not belong to this conversation.' });
    await prisma.inboxReadState.upsert({
      where: { leadId_viewerKey: { leadId: req.lead.id, viewerKey } },
      create: { leadId: req.lead.id, viewerKey, lastReadMessageId: messageId },
      update: {},
    });
    // A delayed request from another tab must never move the cursor backwards.
    await prisma.inboxReadState.updateMany({
      where: { leadId: req.lead.id, viewerKey, lastReadMessageId: { lt: messageId } },
      data: { lastReadMessageId: messageId, readAt: new Date() },
    });
    const state = await prisma.inboxReadState.findUnique({ where: { leadId_viewerKey: { leadId: req.lead.id, viewerKey } }, select: { lastReadMessageId: true } });
    res.json({ success: true, lastReadMessageId: state.lastReadMessageId });
  } catch (error) {
    res.status(500).json({ error: 'Could not save your read position. Try again.' });
  }
});

export default router;
