import express from 'express';
import rateLimit from 'express-rate-limit';
import inboundEmailIngestion from '../services/inboundEmailIngestion.js';
import { EMAIL_INGRESS_MAX_BYTES, readEmailIngressHeaders, verifyEmailIngressHeaderSignature, verifyEmailIngressSignature } from '../utils/emailIngressSignature.js';
import logger from '../utils/logger.js';

/** The endpoint is opt-in and authenticates its own raw-MIME deliveries, never browser sessions. */
export function createEmailIngressRouter({ ingest = (input) => inboundEmailIngestion.ingest(input), env = process.env,
  now = () => Date.now(), maxConcurrent = 2, limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }) } = {}) {
  const router = express.Router();
  let active = 0;
  router.use((req, res, next) => {
    if (env.EMAIL_INGRESS_ENABLED !== 'true' || typeof env.EMAIL_INGRESS_SECRET !== 'string' || env.EMAIL_INGRESS_SECRET.length < 32) {
      return res.status(503).json({ error: 'Inbound email receiver is not configured' });
    }
    if (req.method !== 'POST') return res.status(405).set('Allow', 'POST').json({ error: 'Use POST for an email delivery' });
    if (req.headers.cookie || req.headers.authorization) return res.status(401).json({ error: 'Use the dedicated email delivery signature' });
    if (!req.is('message/rfc822') && !req.is('application/octet-stream')) return res.status(415).json({ error: 'Send raw MIME as message/rfc822' });
    req.emailIngress = readEmailIngressHeaders(req.headers, now());
    if (!req.emailIngress || !verifyEmailIngressHeaderSignature(req.emailIngress, env.EMAIL_INGRESS_SECRET)) {
      return res.status(401).json({ error: 'Invalid or expired email delivery authentication' });
    }
    next();
  });
  router.use(limiter);
  router.use((_req, res, next) => {
    // Bound MIME parsing memory on small self-hosted instances. Cloudflare
    // retains the original and retries a busy receiver without losing mail.
    if (active >= maxConcurrent) return res.status(503).set('Retry-After', '30').json({ error: 'Email receiver is busy. Retry this delivery.' });
    active++;
    let released = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once('close', release);
    res.once('finish', release);
    next();
  });
  router.use(express.raw({ type: ['message/rfc822', 'application/octet-stream'], limit: EMAIL_INGRESS_MAX_BYTES }));
  router.post('/', async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length || !verifyEmailIngressSignature(req.emailIngress, req.body, env.EMAIL_INGRESS_SECRET)) {
      return res.status(401).json({ error: 'Invalid email delivery signature' });
    }
    try {
      const result = await ingest({
        provider: 'cloudflare', dedupeKey: `cloudflare-inbound:${req.emailIngress.eventId}`,
        envelopeFrom: req.emailIngress.envelopeFrom, envelopeTo: [req.emailIngress.envelopeTo],
        receivedAt: new Date(req.emailIngress.receivedAt), rawMime: req.body, strictRecipient: true,
      });
      res.json({ accepted: true, receiptId: result.receipt.id, state: result.receipt.state, duplicate: Boolean(result.duplicate) });
    } catch (error) {
      if (error.statusCode === 409 || error.statusCode === 413) return res.status(error.statusCode).json({ error: error.message });
      logger.error('Inbound email delivery failed; the original must be retried with the same event ID.');
      res.status(503).json({ error: 'Email was not processed. Retry this delivery with the same event ID.' });
    }
  });
  router.use((error, _req, res, _next) => {
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: error.type === 'entity.too.large' ? 'Email exceeds the receiver size limit' : 'Invalid email delivery body' });
  });
  return router;
}
export default createEmailIngressRouter();
