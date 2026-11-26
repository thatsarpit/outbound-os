import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../utils/prismaClient.js';
import { secretsMatch } from '../utils/secretsMatch.js';
import { createWebsiteWhatsAppLink } from '../services/whatsappWebsiteHandoff.js';

const router = Router();
router.post('/:source', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const source = await prisma.webhookSource.findUnique({ where: { source: req.params.source } });
    if (!source?.enabled || !source.whatsappHandoffAccountId) return res.status(404).json({ error: 'WhatsApp handoff is unavailable.' });
    if (!secretsMatch(req.get('x-api-key'), source.apiKey)) return res.status(401).json({ error: 'Invalid source key.' });
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: source.whatsappHandoffAccountId } });
    const url = createWebsiteWhatsAppLink(source, account);
    if (!url) return res.status(409).json({ error: 'Check the website label and connected WhatsApp number.' });
    return res.json({ url });
  } catch {
    return res.status(503).json({ error: 'WhatsApp handoff is temporarily unavailable.' });
  }
});

export default router;
