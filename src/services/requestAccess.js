import { createHash } from 'crypto';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import config from '../config.js';
import emailService from './emailService.js';

const rateLimitState = new Map();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value, max = 500) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function hashValue(value) {
  return createHash('sha256').update(String(value || 'unknown')).digest('hex');
}

function normalizeEmail(email) {
  return cleanText(email, 200).toLowerCase();
}

function resolveClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function getRateEntry(key) {
  const now = Date.now();
  const existing = rateLimitState.get(key) || { lastAt: 0, attempts: [] };
  existing.attempts = existing.attempts.filter((timestamp) => now - timestamp < config.requestAccess.rateLimitWindowMs);
  rateLimitState.set(key, existing);
  return existing;
}

function enforceRateLimit(ipHash) {
  const now = Date.now();
  const entry = getRateEntry(ipHash);

  if (entry.lastAt && now - entry.lastAt < config.requestAccess.minIntervalMs) {
    const error = new Error('Please wait a moment before submitting again.');
    error.code = 'RATE_LIMIT';
    throw error;
  }

  if (entry.attempts.length >= config.requestAccess.maxRequestsPerWindow) {
    const error = new Error('Too many submissions from this connection. Please try again later.');
    error.code = 'RATE_LIMIT';
    throw error;
  }

  entry.lastAt = now;
  entry.attempts.push(now);
}

async function resolveNotificationEmail() {
  if (config.requestAccess.notifyEmail) return config.requestAccess.notifyEmail;

  const configured = await prisma.systemConfig.findUnique({ where: { key: 'reports.admin_email' } });
  if (configured?.value?.trim()) return configured.value.trim();

  const admin = await prisma.user.findFirst({
    where: { role: 'admin', enabled: true },
    orderBy: { createdAt: 'asc' },
    select: { email: true },
  });
  return admin?.email || '';
}

function validateSubmission(payload) {
  const data = {
    name: cleanText(payload.name, 120),
    workEmail: normalizeEmail(payload.workEmail),
    company: cleanText(payload.company, 160),
    role: cleanText(payload.role, 80),
    teamSize: cleanText(payload.teamSize, 40),
    monthlyLeadVolume: cleanText(payload.monthlyLeadVolume, 60),
    primaryChannel: cleanText(payload.primaryChannel, 80),
    currentWorkflow: cleanText(payload.currentWorkflow, 200),
    painPoint: cleanText(payload.painPoint, 220),
    notes: cleanText(payload.notes, 400),
    source: cleanText(payload.source || 'website', 50).toLowerCase(),
  };

  if (!data.workEmail || !EMAIL_RE.test(data.workEmail)) {
    const error = new Error('A valid work email is required.');
    error.code = 'VALIDATION';
    throw error;
  }

  if (!data.company) {
    const error = new Error('Company is required.');
    error.code = 'VALIDATION';
    throw error;
  }

  return data;
}

function buildNotificationEmail(record) {
  const lines = [
    ['Name', record.name || 'Not provided'],
    ['Work Email', record.workEmail],
    ['Company', record.company],
    ['Role', record.role || 'Not provided'],
    ['Team Size', record.teamSize || 'Not provided'],
    ['Monthly Lead Volume', record.monthlyLeadVolume || 'Not provided'],
    ['Primary Channel', record.primaryChannel || 'Not provided'],
    ['Current Workflow', record.currentWorkflow || 'Not provided'],
    ['Pain Point', record.painPoint || 'Not provided'],
    ['Notes', record.notes || 'Not provided'],
    ['Source', record.source],
    ['Submitted', record.createdAt.toISOString()],
  ];

  const htmlRows = lines.map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#475467;font-weight:600;">${label}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${value}</td>
    </tr>
  `).join('');

  return {
    subject: `New Outbound OS access request from ${record.company}`,
    textBody: lines.map(([label, value]) => `${label}: ${value}`).join('\n'),
    htmlBody: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f8fb;padding:28px;">
        <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;box-shadow:0 18px 44px rgba(15,23,42,0.08);">
          <div style="padding:24px 28px;background:linear-gradient(135deg,#071c34 0%,#0f4e8a 100%);color:#ffffff;">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;">Request Access</div>
            <h1 style="margin:10px 0 0;font-size:28px;line-height:1.15;">New Outbound OS qualification request</h1>
          </div>
          <div style="padding:24px 28px;">
            <p style="margin:0 0 18px;color:#475467;line-height:1.6;">
              A new visitor requested access to Outbound OS and should be reviewed for follow-up or scheduling.
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">${htmlRows}</table>
          </div>
        </div>
      </div>
    `,
  };
}

class RequestAccessService {
  async submit(rawPayload, req) {
    if (cleanText(rawPayload.website || rawPayload.companyWebsite, 120)) {
      return { ok: true, submissionId: 0, calendarUrl: config.requestAccess.calendarUrl || undefined };
    }

    const clientIp = resolveClientIp(req);
    const ipHash = hashValue(clientIp);
    enforceRateLimit(ipHash);

    const payload = validateSubmission(rawPayload);
    const record = await prisma.accessRequest.create({
      data: {
        ...payload,
        ipHash,
      },
    });

    const recipient = await resolveNotificationEmail();
    if (recipient) {
      try {
        const notification = buildNotificationEmail(record);
        await emailService.sendSystemEmail({
          to: recipient,
          subject: notification.subject,
          textBody: notification.textBody,
          htmlBody: notification.htmlBody,
          tag: 'request_access',
        });
      } catch (error) {
        logger.warn(`Request access notification email failed: ${error.message}`);
      }
    }

    logger.info(`📝 Access request captured from ${record.company} <${record.workEmail}>`);
    return {
      ok: true,
      submissionId: record.id,
      calendarUrl: config.requestAccess.calendarUrl || undefined,
    };
  }
}

const requestAccessService = new RequestAccessService();
export default requestAccessService;
