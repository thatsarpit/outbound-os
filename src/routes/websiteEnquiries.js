import { Router, json, urlencoded } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';

const router = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many enquiries. Please try later or email us directly.' },
});

// This public intake has no access to sessions and never schedules a send.
// It is opt-in so an ordinary self-hosted CRM does not expose a public form.
router.use((req, res, next) => {
  const allowed = String(process.env.WEBSITE_ENQUIRY_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.get('Origin');
  if (!origin || !allowed.includes(origin)) return res.status(403).json({ error: 'Enquiry origin is not allowed.' });
  res.set('Access-Control-Allow-Origin', origin);
  res.vary('Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (process.env.WEBSITE_ENQUIRY_ENABLED !== 'true') return res.status(503).json({ error: 'Online enquiries are unavailable. Please email us directly.' });
  return next();
});
router.use(limiter, json({ limit: '12kb' }), urlencoded({ extended: false, limit: '12kb' }));
router.post('/', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(422).json({ error: 'Supply your enquiry details.' });
  if (body.companyWebsite) return res.json({ success: true });
  const limits = { name: 100, workEmail: 254, company: 160, role: 80, teamSize: 40, monthlyLeadVolume: 60, primaryChannel: 300, plan: 100, notes: 4000 };
  const fields = {};
  for (const [key, max] of Object.entries(limits)) {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > max)) return res.status(422).json({ error: `Check the ${key} field.` });
    fields[key] = (body[key] || '').trim();
  }
  // Delimiter checks avoid overlapping regex repetitions on public input.
  const at = fields.workEmail.indexOf('@');
  const dot = fields.workEmail.lastIndexOf('.');
  const validEmail = at > 0 && at === fields.workEmail.lastIndexOf('@')
    && dot > at + 1 && dot < fields.workEmail.length - 1 && !/\s/u.test(fields.workEmail);
  if (!fields.name || !fields.company || !validEmail) return res.status(422).json({ error: 'Enter your name, company and a valid work email.' });
  const email = fields.workEmail.toLowerCase();
  const summary = ['Website service enquiry', ...Object.entries(fields).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`)].join('\n');
  try {
    // A separate record per enquiry retains the requested scope without
    // changing an existing customer's ownership, consent or automation state.
    await prisma.lead.create({ data: {
      name: fields.name, company: fields.company, email,
      mobile: `no-phone:website-enquiry:${randomUUID()}`,
      source: 'website_service_enquiry', status: 'paused',
      emailMarketingConsent: false, notes: summary,
    } });
    return res.status(201).json({ success: true });
  } catch {
    logger.error('Website service enquiry could not be saved');
    return res.status(503).json({ error: 'We could not save your enquiry. Please email us directly.' });
  }
});
export default router;
