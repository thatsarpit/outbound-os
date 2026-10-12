import express from 'express';
import { requireRole } from '../auth/index.js';
import emailService from '../services/emailService.js';

const router = express.Router();

router.post('/email/accounts/:id/gmail-inbox', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (req.body.accountIds !== undefined && !Array.isArray(req.body.accountIds)) {
    return res.status(400).json({ error: 'Choose valid email accounts' });
  }
  const ids = [...new Set(req.body.accountIds || [id])];
  const user = String(req.body.user || '').trim().toLowerCase();
  const password = String(req.body.appPassword || '').replace(/\s/g, '');
  if (!Number.isSafeInteger(id) || id < 1 || ids.length > 20 || !ids.includes(id)
    || ids.some(value => !Number.isSafeInteger(value) || value < 1)) {
    return res.status(400).json({ error: 'Choose valid email accounts' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user) || !/^[a-zA-Z]{16}$/.test(password)) {
    return res.status(400).json({ error: 'Enter your Gmail address and its 16-letter app password' });
  }
  try {
    res.json(await emailService.connectGmailInbox(ids, user, password));
  } catch (error) {
    const missing = /not found/i.test(error.message);
    res.status(missing ? 404 : 400).json({ error: missing ? 'Email account not found'
      : 'Gmail connection failed. Check the account address, 2-Step Verification and app password, then try again.' });
  }
});

router.post('/email/accounts/:id/sync-inbox', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid account ID' });
  try {
    res.json(await emailService.syncInbox(id));
  } catch (error) {
    res.status(/not found/i.test(error.message) ? 404 : 400).json({ error:
      /not found|Connect an enabled inbox/i.test(error.message) ? error.message
        : 'Inbox sync failed. Check the Gmail app password and try again.' });
  }
});

export default router;
