import express from 'express';

import { requireRole } from '../auth/index.js';
import prisma from '../utils/prismaClient.js';
import telegramService from '../services/telegram.js';

const router = express.Router();

function positiveInt(value) {
  const id = Number.parseInt(String(value), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function requestError(res, error, fallbackStatus = 400) {
  const message = error?.message || 'Telegram request failed';
  const status = /not found/i.test(message) ? 404 : fallbackStatus;
  return res.status(status).json({ error: message });
}

router.get('/telegram/accounts', requireRole('manager'), async (_req, res) => {
  try {
    res.json(await telegramService.listAccounts());
  } catch (error) {
    requestError(res, error, 500);
  }
});

router.post('/telegram/accounts/connect', requireRole('manager'), async (req, res) => {
  try {
    const result = await telegramService.beginConnection(req.body || {});
    res.status(201).json(result);
  } catch (error) {
    requestError(res, error);
  }
});

router.post('/telegram/accounts/:id/code', requireRole('manager'), async (req, res) => {
  const id = positiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid Telegram account ID' });
  try {
    res.json(await telegramService.verifyCode(id, req.body?.code));
  } catch (error) {
    requestError(res, error);
  }
});

router.post('/telegram/accounts/:id/password', requireRole('manager'), async (req, res) => {
  const id = positiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid Telegram account ID' });
  try {
    res.json(await telegramService.verifyPassword(id, req.body?.password));
  } catch (error) {
    requestError(res, error);
  }
});

router.post('/telegram/accounts/:id/check', requireRole('manager'), async (req, res) => {
  const id = positiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid Telegram account ID' });
  try {
    res.json(await telegramService.checkConnection(id));
  } catch (error) {
    requestError(res, error, 500);
  }
});

router.post('/telegram/send', requireRole('agent'), async (req, res) => {
  const accountId = positiveInt(req.body?.accountId);
  if (!accountId) return res.status(400).json({ error: 'Choose a Telegram account' });
  const leadId = req.body?.leadId == null ? null : positiveInt(req.body.leadId);
  if (req.body?.leadId != null && !leadId) return res.status(400).json({ error: 'Invalid lead ID' });

  try {
    let peer = String(req.body?.peer || '').trim();
    let lead = null;
    if (leadId) {
      lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      peer ||= lead.telegramPeer || '';
    }

    const result = await telegramService.sendMessage({
      accountId,
      peer,
      message: req.body?.message,
    });

    let savedMessage = null;
    if (lead) {
      const now = result.sentAt || new Date();
      [savedMessage] = await prisma.$transaction([
        prisma.message.create({
          data: {
            leadId: lead.id,
            direction: 'outbound',
            channel: 'telegram',
            telegramAccountId: result.accountId,
            telegramMessageId: result.messageId || null,
            content: String(req.body.message).trim(),
            status: 'sent',
            sentAt: now,
          },
        }),
        prisma.lead.update({
          where: { id: lead.id },
          data: {
            telegramPeer: result.peer,
            telegramStatus: 'sent',
            assignedTelegramAccountId: result.accountId,
            lastMessageAt: now,
          },
        }),
      ]);
    }

    res.json({ success: true, ...result, message: savedMessage });
  } catch (error) {
    requestError(res, error);
  }
});

router.delete('/telegram/accounts/:id', requireRole('admin'), async (req, res) => {
  const id = positiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid Telegram account ID' });
  try {
    const account = await telegramService.disconnect(id);
    await prisma.telegramAccount.delete({ where: { id } });
    res.json({ success: true, account });
  } catch (error) {
    requestError(res, error);
  }
});

export default router;
