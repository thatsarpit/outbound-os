import { Router, json } from 'express';
import prisma from '../utils/prismaClient.js';
import { secretsMatch } from '../utils/secretsMatch.js';
import intake, { INDIAMART_SOURCE, INDIAMART_PAGE } from '../services/indiamartIntake.js';
import { validateConnectorRecords } from '../services/connectorImport.js';
const router = Router();
router.use(json({ limit: '512kb' }));
router.use('/:source', async (req, res, next) => {
  try {
    if (req.params.source !== INDIAMART_SOURCE) return res.status(404).json({ error: 'Source unavailable.' });
    const source = await prisma.webhookSource.findUnique({ where: { source: req.params.source } });
    if (!source?.enabled) return res.status(404).json({ error: 'Source unavailable.' });
    if (!secretsMatch(req.get('x-api-key'), source.apiKey)) return res.status(401).json({ error: 'Invalid source key.' });
    req.indiamartSource = source;
    next();
  } catch { res.status(503).json({ error: 'Source unavailable.' }); }
});
router.post('/:source/health', async (req, res) => {
  const { state, error, lastCheck, localPending, mode, lastSavedScanAt, lastUploadAt, targetUrl } = req.body || {};
  if (!['ready', 'needs_attention'].includes(state) || (error != null && (typeof error !== 'string' || error.length > 200))
    || [lastCheck, lastSavedScanAt, lastUploadAt].some(value => value != null && (typeof value !== 'string' || !Number.isFinite(Date.parse(value))))
    || (localPending != null && (!Number.isSafeInteger(localPending) || localPending < 0 || localPending > 1000000))
    || (mode != null && !['offline','login','live'].includes(mode))
    || (targetUrl != null && targetUrl !== INDIAMART_PAGE)) return res.status(422).json({ error: 'Invalid health report.' });
  const health = { state, error: error || null, lastCheck: lastCheck || null, reportedAt: new Date().toISOString(),
    ...(localPending != null ? { localPending } : {}), ...(mode ? { mode } : {}),
    lastSavedScanAt: lastSavedScanAt || null, lastUploadAt: lastUploadAt || null };
  try {
    await prisma.systemConfig.upsert({ where: { key: 'indiamart.liveHealth' }, create: { key: 'indiamart.liveHealth', value: JSON.stringify(health) }, update: { value: JSON.stringify(health) } });
    res.json({ ok: true });
  } catch { res.status(503).json({ error: 'Health report unavailable.' }); }
});
router.get('/:source/status', async (req, res) => {
  try {
    const policy = await intake.policy();
    if (!policy || policy.sourceId !== req.indiamartSource.id) return res.status(409).json({ error: 'Source policy is not configured.' });
    const [whatsapp, email] = await Promise.all([
      prisma.whatsAppAccount.findUnique({ where: { id: policy.whatsappAccountId } }),
      prisma.emailAccount.findUnique({ where: { id: policy.emailAccountId } }),
    ]);
    res.json({ source: INDIAMART_SOURCE, targetUrl: INDIAMART_PAGE,
      enabled: policy.enabled === true, baselineComplete: Boolean(policy.armedAt), sellerPaired: Boolean(policy.sellerId),
      exactPageRequired: policy.requireExactPage === true,
      whatsappAccountId: policy.whatsappAccountId, templateName: policy.templateName,
      emailAccountId: policy.emailAccountId, emailFrom: email?.email || null,
      senderPairConfigured: Boolean(whatsapp?.enabled && email?.enabled && email.whatsappAccountId === whatsapp.id) });
  } catch { res.status(503).json({ error: 'Source status unavailable.' }); }
});
router.post('/:source', async (req, res) => {
  try {
    const source = req.indiamartSource;
    let records;
    try { records = validateConnectorRecords(req.body?.records); }
    catch (error) { return res.status(422).json({ error: error.message }); }
    if (!source.importSupplierId) return res.status(409).json({ error: 'Source supplier is not configured.' });
    return res.json(await intake.ingest(source, records, req.body?.mode, req.body?.sellerId, { confirmSeller: req.body?.confirmSeller === true, sourceUrl: req.body?.sourceUrl }));
  } catch (error) {
    if (error.code === 'invalid_source_page') return res.status(422).json({ error: 'Only the configured consumed-leads page is accepted.' });
    return res.status(503).json({ error: 'Intake not completed. Check the account configuration and retry the same purchase IDs.' });
  }
});
export default router;
