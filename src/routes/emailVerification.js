import { Router } from 'express';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';
import verifier from '../services/emailVerification.js';
import { verificationEnabled } from '../utils/emailVerification.js';

export function createEmailVerificationRouter({ db = prisma, service = verifier, guard = requireRole } = {}) {
  const router = Router();
  router.use('/email/verification', guard('admin'), (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/email/verification/jobs', async (_req, res) => {
    try {
      const jobs = await db.emailVerificationJob.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
      res.json({ enabled: verificationEnabled(), jobs: jobs.map(job => service.publicJob(job)) });
    } catch { res.status(503).json({ error: 'Could not load verification batches.' }); }
  });
  router.post('/email/verification/jobs', async (req, res) => {
    try {
      const { allLeads, leadIds, emails } = req.body || {};
      if ([allLeads === true, leadIds !== undefined, emails !== undefined].filter(Boolean).length !== 1) {
        return res.status(400).json({ error: 'Choose allLeads, leadIds, or an email list.' });
      }
      let addresses;
      if (emails !== undefined) {
        if (!Array.isArray(emails) || emails.some(email => typeof email !== 'string')) return res.status(400).json({ error: 'Emails must be a list of strings.' });
        addresses = emails;
      } else {
        if (leadIds !== undefined && (!Array.isArray(leadIds) || leadIds.length > 20000 || leadIds.some(id => !Number.isSafeInteger(id) || id <= 0))) {
          return res.status(400).json({ error: 'Choose up to 20,000 valid lead IDs.' });
        }
        const rows = [];
        if (leadIds) {
          // Keep SQLite's bound parameter limit well below its lowest default.
          for (let at = 0; at < leadIds.length; at += 500) rows.push(...await db.lead.findMany({ where: { id: { in: leadIds.slice(at, at + 500) } }, select: { email: true } }));
        } else rows.push(...await db.lead.findMany({ where: { email: { not: null } }, select: { email: true }, take: 20001 }));
        if (rows.length > 20000) return res.status(400).json({ error: 'Select a batch of up to 20,000 leads.' });
        addresses = rows.map(row => row.email).filter(Boolean);
      }
      res.status(202).json(await service.createJob(addresses));
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  router.get('/email/verification/jobs/:id', async (req, res) => {
    try {
      const job = await db.emailVerificationJob.findUnique({ where: { id: req.params.id } });
      if (!job) return res.status(404).json({ error: 'Verification batch not found.' });
      const page = Math.max(1, Math.min(400, Number.parseInt(req.query.page, 10) || 1));
      const addresses = JSON.parse(job.emails);
      const results = await db.emailVerificationJobResult.findMany({ where: { jobId: job.id, email: { in: addresses.slice((page - 1) * 50, page * 50) } } });
      const byEmail = new Map(results.map(row => [row.email, row]));
      res.json({ ...service.publicJob(job), page, pages: Math.max(1, Math.ceil(addresses.length / 50)),
        results: addresses.slice((page - 1) * 50, page * 50).map(email => {
          const row = byEmail.get(email);
          return row ? { ...JSON.parse(row.result), checkedAt: row.checkedAt } : { email, status: 'pending', mailboxVerified: false };
        }) });
    } catch { res.status(503).json({ error: 'Could not load verification results.' }); }
  });
  return router;
}
export default createEmailVerificationRouter();
