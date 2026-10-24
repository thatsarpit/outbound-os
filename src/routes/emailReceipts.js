import { Router } from 'express';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';
import inboundEmailIngestion from '../services/inboundEmailIngestion.js';
import inboundEmailAttachments from '../services/inboundEmailAttachments.js';
import { emailAttachmentDisposition } from '../utils/emailAttachments.js';

const states = ['pending', 'partial', 'unmatched', 'invalid', 'conflict', 'matched'];
const positive = value => ['string', 'number'].includes(typeof value) && /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;

export function createEmailReceiptRouter({ db = prisma, service = inboundEmailIngestion, originals = inboundEmailAttachments, guard = requireRole } = {}) {
  const router = Router();
  router.use('/email/receipts', guard('admin'), (_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" });
    next();
  });
  const unavailable = (res, error) => res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : 'The original email could not be verified. It remains retained for review.' });
  router.get('/email/receipts/:id', async (req, res) => {
    const id = positive(req.params.id);
    if (!id) return res.status(400).json({ error: 'Valid receipt ID required.' });
    try { res.json(await originals.previewReceipt(id)); }
    catch (error) { unavailable(res, error); }
  });
  router.get('/email/receipts/:id/attachments/:index', async (req, res) => {
    const id = positive(req.params.id), index = req.params.index;
    if (!id || !/^(0|[1-9]\d*)$/.test(index) || !Number.isSafeInteger(Number(index))) return res.status(400).json({ error: 'Valid receipt ID and attachment index required.' });
    try {
      const file = await originals.downloadReceipt(id, Number(index));
      res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': emailAttachmentDisposition(file.filename) });
      res.send(file.bytes);
    } catch (error) { unavailable(res, error); }
  });
  router.get('/email/receipts', async (req, res) => {
    try {
      const page = positive(req.query.page) || 1;
      const limit = 25;
      if (req.query.state && req.query.state !== 'attention' && !states.includes(req.query.state)) return res.status(400).json({ error: 'Choose a valid receipt state.' });
      const where = req.query.state && req.query.state !== 'attention'
        ? { state: req.query.state } : { state: { not: 'matched' } };
      const [rows, total, grouped] = await Promise.all([
        db.inboundEmailReceipt.findMany({ where, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
        db.inboundEmailReceipt.count({ where }),
        db.inboundEmailReceipt.groupBy({ by: ['state'], _count: { _all: true } }),
      ]);
      res.set('Cache-Control', 'no-store').json({
        receiverEnabled: process.env.EMAIL_INGRESS_ENABLED === 'true',
        items: rows.map(row => {
          let to = [];
          try { to = JSON.parse(row.envelopeTo); } catch { /* Preserve malformed legacy metadata without exposing raw storage. */ }
          return { id: row.id, provider: row.provider, from: row.envelopeFrom, to: Array.isArray(to) ? to : [],
            state: row.state, reason: row.reason, receivedAt: row.receivedAt, processedAt: row.processedAt,
            emailAccountId: row.emailAccountId, messageId: row.messageId, hasOriginal: Boolean(row.rawPath),
            canRetry: Boolean(row.rawPath && row.state !== 'matched' && row.state !== 'partial'),
            canAssign: Boolean(row.rawPath && !row.messageId && row.state === 'unmatched') };
        }),
        total, page, pages: Math.ceil(total / limit), counts: Object.fromEntries(grouped.map(row => [row.state, row._count._all])),
      });
    } catch { res.status(500).json({ error: 'Could not load inbound email receipts.' }); }
  });
  router.post('/email/receipts/:id/retry', async (req, res) => {
    try {
      const id = positive(req.params.id);
      if (!id) return res.status(400).json({ error: 'Valid receipt ID required.' });
      const receipt = await db.inboundEmailReceipt.findUnique({ where: { id } });
      if (!receipt) return res.status(404).json({ error: 'Email receipt not found.' });
      if (!receipt.rawPath) return res.status(409).json({ error: 'The original email is not retained. Its provider must redeliver it.' });
      if (receipt.state === 'matched' || receipt.state === 'partial') return res.status(409).json({ error: receipt.state === 'partial'
        ? 'The mailbox sync must recover the full original before this receipt can be retried.' : 'This receipt is already linked to a message.' });
      let manualMatch = null;
      if (req.body?.leadId !== undefined || req.body?.accountId !== undefined) {
        const leadId = positive(req.body.leadId), accountId = positive(req.body.accountId);
        if (!leadId || !accountId) return res.status(400).json({ error: 'Choose both a lead and receiving account.' });
        if (receipt.messageId || receipt.state !== 'unmatched') return res.status(409).json({ error: 'Only an unmatched, unlinked receipt can be assigned manually.' });
        manualMatch = { leadId, accountId };
      }
      const rawMime = await service.spool.read(receipt.rawPath, receipt.dedupeKey);
      const result = await service.ingest({ provider: receipt.provider, dedupeKey: receipt.dedupeKey, rawMime,
        envelopeFrom: receipt.envelopeFrom, envelopeTo: JSON.parse(receipt.envelopeTo), accountId: receipt.emailAccountId,
        receivedAt: receipt.receivedAt, strictRecipient: receipt.provider === 'cloudflare', retry: true, manualMatch });
      res.json({ receiptId: result.receipt.id, state: result.receipt.state, reason: result.receipt.reason, messageId: result.receipt.messageId });
    } catch (error) {
      res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : 'The original could not be reprocessed. It remains retained for another attempt.' });
    }
  });
  return router;
}
export default createEmailReceiptRouter();
