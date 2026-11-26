import { Router } from 'express';
import { requireRole } from '../auth/index.js';
import { requireLeadAccess } from '../auth/rbac.js';
import { SCHEDULED_EMAIL_KEY_PREFIX } from '../services/emailService.js';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';

const router = Router();
const path = '/inbox/threads/:leadId/scheduled-emails/:messageId';

for (const method of ['patch', 'delete']) {
  router[method](path, requireRole('agent'), requireLeadAccess('leadId'), async (req, res) => {
    const id = Number(req.params.messageId);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Choose a scheduled email.' });
    const cancel = method === 'delete';
    const value = req.body?.scheduledAt;
    const date = typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? new Date(value) : null;
    if (!cancel && !(date?.getTime() > Date.now())) return res.status(400).json({ error: 'Choose a future date and time.' });
    try {
      const result = await prisma.message.updateMany({
        where: {
          id, leadId: req.lead.id, channel: 'email', direction: 'outbound', status: 'queued',
          manualSendKey: { startsWith: SCHEDULED_EMAIL_KEY_PREFIX }, sentAt: null,
          emailMessageId: null, providerMessageId: null, providerCampaignId: null,
        },
        data: cancel ? { status: 'cancelled', providerStatusReason: 'scheduled_email_cancelled_by_operator' }
          : { scheduledAt: date, providerStatusReason: null },
      });
      if (!result.count) return res.status(409).json({ error: 'This email is no longer queued. Refresh the conversation to see its status.' });
      res.json({ success: true });
    } catch (error) {
      logger.warn(`Scheduled email change failed: ${error.message}`);
      res.status(503).json({ error: 'Could not update this scheduled email.' });
    }
  });
}

export default router;
