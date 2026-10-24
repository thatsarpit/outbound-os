import { Router } from 'express';
import { requireRole } from '../auth/index.js';
import inboundEmailAttachments from '../services/inboundEmailAttachments.js';
import { emailAttachmentDisposition } from '../utils/emailAttachments.js';

const identifier = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const attachmentIndex = value => /^(0|[1-9]\d*)$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;

export function createEmailAttachmentRouter({ service = inboundEmailAttachments, guard = requireRole } = {}) {
  const router = Router();
  router.use('/messages/:id/email-attachments', guard('viewer'), (_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" });
    next();
  });
  const fail = (res, error) => res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : 'The retained attachment could not be verified. Try again or ask an administrator to check the original.' });
  router.get('/messages/:id/email-attachments', async (req, res) => {
    const id = identifier(req.params.id);
    if (!id) return res.status(400).json({ error: 'Valid message ID required.' });
    try { res.json(await service.list(id)); } catch (error) { fail(res, error); }
  });
  router.get('/messages/:id/email-attachments/:index', async (req, res) => {
    const id = identifier(req.params.id), index = attachmentIndex(req.params.index);
    if (!id || index === null) return res.status(400).json({ error: 'Valid message ID and attachment index required.' });
    try {
      const file = await service.download(id, index);
      res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': emailAttachmentDisposition(file.filename) });
      res.send(file.bytes);
    } catch (error) { fail(res, error); }
  });
  return router;
}
export default createEmailAttachmentRouter();
