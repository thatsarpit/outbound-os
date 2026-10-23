import { Router, json } from 'express';
import prisma from '../utils/prismaClient.js';
import { secretsMatch } from '../utils/secretsMatch.js';
import { importConnectorRecords, validateConnectorRecords } from '../services/connectorImport.js';
const router = Router();
router.post('/:source', json({ limit: '512kb' }), async (req, res) => {
  try {
    const source = await prisma.webhookSource.findUnique({ where: { source: req.params.source } });
    if (!source?.enabled) return res.status(404).json({ error: 'Source unavailable.' });
    if (!secretsMatch(req.get('x-api-key'), source.apiKey)) return res.status(401).json({ error: 'Invalid source key.' });
    let records;
    try { records = validateConnectorRecords(req.body?.records); } catch (error) { return res.status(422).json({ error: error.message }); }
    if (!source.importSupplierId) return res.status(409).json({ error: 'Source supplier is not configured.' });
    const results = await importConnectorRecords(prisma, source, records);
    return res.json({ results, outreachQueued: false });
  } catch {
    return res.status(503).json({ error: 'Import was not completed. Retry this batch with the same source IDs.' });
  }
});
export default router;
