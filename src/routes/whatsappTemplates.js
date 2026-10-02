import { Router } from 'express';
import whatsappCloudApi from '../services/whatsappCloudApi.js';

const router = Router();

router.get('/accounts/:id/templates', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'A positive account ID is required.' });
  try {
    const result = await whatsappCloudApi.listApprovedTemplates(id);
    if (!result.ok) return res.status(result.status).json({ error: result.message, reason: result.reason });
    res.json({ accountId: id, templates: result.templates });
  } catch {
    res.status(502).json({ error: 'Could not load WhatsApp templates. Check the account connection and try again.' });
  }
});

export default router;
