import { withDefaultCountryCode } from './utils/phoneDefaults.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { createWriteStream, mkdirSync, existsSync, unlinkSync } from 'fs';
import { randomUUID, randomBytes } from 'crypto';


import prisma from './utils/prismaClient.js';
import salesRoutes from './routes/sales.js';
import providerWebhookRoutes from './routes/webhooks.js';
import customerRoutes from './routes/customers.js';
import settlementRoutes from './routes/settlement.js';
import productRoutes from './routes/products.js';
import telegramRoutes from './routes/telegram.js';
import config from './config.js';
import logger from './utils/logger.js';
import activityLog, { EVENT_TYPES } from './utils/activityLog.js';
import phoneOtp from './services/phoneOtp.js';
import otpDelivery from './services/otpDelivery.js';
import followupEngine from './services/followup.js';
import whatsappManager from './services/whatsapp.js';
import composer from './services/messageComposer.js';
import leadScorer from './services/leadScorer.js';
import csvImporter from './services/csvImporter.js';
import csvExporter from './services/csvExporter.js';
import campaignEngine from './services/campaignEngine.js';
import replyDetector from './services/replyDetector.js';
import leadStateService, { LEAD_STATUS } from './domain/leadStateService.js';
import emailService from './services/emailService.js';
import dailyEmailScheduler from './services/dailyEmailScheduler.js';
import brevoMarketingCampaigns from './services/brevoMarketingCampaigns.js';
import interventionEngine from './services/interventionEngine.js';
import reportingService from './services/reportingService.js';
import recoveryCoordinator from './services/recoveryCoordinator.js';
import resourceMonitor from './utils/resourceMonitor.js';
import webhookDispatcher from './services/webhookDispatcher.js';
import { workspaceTimezone, zonedParts, zonedTimeToUtc } from './utils/workspaceTime.js';
import { sendMediaFile, MEDIA_DIR as WHATSAPP_MEDIA_DIR } from './services/whatsappMedia.js';
import { whatsappAddress } from './utils/whatsappAddress.js';
import { mapInboundLead, isSendableMobile } from './utils/inboundLead.js';
import { secretsMatch } from './utils/secretsMatch.js';
import sheetsSync from './services/sheetsSync.js';
import whatsappCloudApi from './services/whatsappCloudApi.js';
import { WHATSAPP_PROVIDERS, credentialState, publicCredentialSummary } from './services/whatsappProviders.js';
import {
  getWorkspaceProfile, saveWorkspaceProfile, isOnboardingDismissed, setOnboardingDismissed,
} from './services/workspaceProfile.js';
import imessageService, { normalizeIMessageServerUrl } from './services/imessage.js';
import telegramService from './services/telegram.js';
import {
  buildMessageEventDateWhere,
  buildNewLeadDateWhere,
  getLocalDayRangeUTC,
  localDateKey,
  parseTimezoneOffset,
} from './utils/reportingTime.js';
// hashPassword is still used by POST/PATCH /api/users, which sets a local
// passwordHash that nothing reads anymore now that Clerk owns sign-in — see
// the note above those routes. requirePoolAccess/requireLeadAccess/
// getAccessiblePoolIds/userCanAccessPool are already no-op stubs from
// removing lead pools; kept only for call-site compatibility.
import { hashPassword, requirePoolAccess, requireLeadAccess, getAccessiblePoolIds, userCanAccessPool } from './auth/rbac.js';
import {
  AUTH_PROVIDER, authMiddleware, requireRole, verifyQueryToken, clerkClient,
  localLogin, localChangePassword, publicAuthConfig,
} from './auth/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Media storage directory
const MEDIA_DIR = path.join(__dirname, '..', 'data', 'media');
if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true });

// Multer for CSV uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

// Multer for media uploads (images, PDFs, videos)
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter: (req, file, cb) => {
    // What WhatsApp can deliver as an image, video, audio or document.
    const allowed = ['image/jpeg','image/png','image/webp','image/gif',
                     'application/pdf','video/mp4','video/3gpp',
                     'audio/mpeg','audio/ogg','audio/aac','audio/mp4','application/msword',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                     'application/vnd.ms-excel',
                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     'application/vnd.ms-powerpoint',
                     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                     'text/csv','text/plain'];
    if (allowed.includes(file.mimetype)) { cb(null, true); }
    else { cb(new Error(`File type ${file.mimetype} not allowed`)); }
  },
});



// ── Input validation helpers ──
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validatePhone(mobile) {
  const clean = String(mobile).replace(/[^0-9+]/g, '');
  return clean.length >= 10 && clean.length <= 15;
}
const VALID_CHANNELS = ['whatsapp', 'email', 'both', 'imessage'];
const VALID_LEAD_STATUSES = ['new', 'contacted', 'replied', 'engaged', 'closed', 'paused', 'wa_unavailable'];
// Inbox is a record of conversations, not a campaign outbox or dead-letter
// queue. Drafts that never left the system remain available to campaign/admin
// diagnostics but must not masquerade as chats with a lead.
const INBOX_HIDDEN_MESSAGE_STATUSES = ['queued', 'cancelled', 'failed', 'permanently_failed'];

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeSenderAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    channel: 'email',
    name: account.name,
    email: account.email,
    senderName: account.senderName,
    signature: account.signature,
    status: account.status,
    enabled: account.enabled,
    whatsappAccountId: account.whatsappAccountId,
  };
}

function isRoleAtLeast(role, minRole) {
  const levels = { viewer: 0, agent: 1, manager: 2, admin: 3 };
  return (levels[role] ?? -1) >= (levels[minRole] ?? 0);
}

function normalizeInboxThreadState({ lead, lastMessage, assignedToId }) {
  if (lead.status === 'closed') return 'resolved';
  if (lastMessage?.direction === 'inbound') return 'needs_reply';
  if (assignedToId) return 'assigned';
  return 'unassigned';
}

function buildInboxMessage(message, emailAccountsById = {}, telegramAccountsById = {}) {
  const senderAccount = message.emailAccountId ? emailAccountsById[message.emailAccountId] : null;
  const telegramAccount = message.telegramAccountId ? telegramAccountsById[message.telegramAccountId] : null;
  return {
    ...message,
    channel: message.channel || 'whatsapp',
    subject: message.emailSubject || null,
    senderAccountId: message.emailAccountId || message.imessageAccountId || message.telegramAccountId || message.waAccount || null,
    senderDisplay: telegramAccount?.displayName || telegramAccount?.name || senderAccount?.senderName || senderAccount?.name || senderAccount?.email || null,
    replyToMessageId: null,
  };
}

function buildInboxThreadSummary(lead, emailAccountsById = {}, telegramAccountsById = {}) {
  const lastMessageRaw = Array.isArray(lead.messages) ? lead.messages[0] || null : null;
  const lastMessage = lastMessageRaw ? buildInboxMessage(lastMessageRaw, emailAccountsById, telegramAccountsById) : null;
  const threadState = normalizeInboxThreadState({
    lead,
    lastMessage,
    assignedToId: lead.assignedToId,
  });

  return {
    ...lead,
    id: lead.id,
    leadId: lead.id,
    leadName: lead.name,
    leadCompany: lead.company || null,
    leadEmail: lead.email || null,
    leadMobile: lead.mobile || null,
    leadTelegramPeer: lead.telegramPeer || null,
    channel: lastMessage?.channel || 'whatsapp',
    threadKey: `lead:${lead.id}:${lastMessage?.channel || 'whatsapp'}`,
    subject: lastMessage?.subject || null,
    senderDisplay: lastMessage?.senderDisplay || null,
    senderAccountId: lastMessage?.senderAccountId || null,
    assignedEmailAccountId: lead.assignedEmailAccountId || null,
    lastMessage: lastMessage?.content || '',
    lastMessagePreview: lastMessage?.content || '',
    lastMessageAt: lead.lastMessageAt || lastMessage?.createdAt || lead.updatedAt,
    lastInboundAt: lastMessage?.direction === 'inbound' ? lastMessage.createdAt : null,
    lastOutboundAt: lastMessage?.direction === 'outbound' ? lastMessage.createdAt : null,
    unread: threadState === 'needs_reply',
    replyNeeded: threadState === 'needs_reply',
    assignmentState: lead.assignedToId ? 'assigned' : 'unassigned',
    threadState,
    messageCount: lead._count?.messages || (Array.isArray(lead.messages) ? lead.messages.length : 0),
  };
}

async function getPermittedEmailSenderAccounts({ leadId, user }) {
  const enabledVerifiedWhere = { enabled: true, status: 'verified' };

  if (isRoleAtLeast(user?.role, 'manager')) {
    return prisma.emailAccount.findMany({
      where: enabledVerifiedWhere,
      orderBy: { id: 'asc' },
    });
  }

  const lead = leadId
    ? await prisma.lead.findUnique({
        where: { id: leadId },
        select: { assignedEmailAccountId: true, assignedAccount: true },
      })
    : null;

  const or = [];
  if (lead?.assignedEmailAccountId) {
    or.push({ id: lead.assignedEmailAccountId });
  }
  if (lead?.assignedAccount) {
    or.push({ whatsappAccountId: lead.assignedAccount });
  }

  let accounts = [];
  if (or.length > 0) {
    accounts = await prisma.emailAccount.findMany({
      where: { ...enabledVerifiedWhere, OR: or },
      orderBy: { id: 'asc' },
    });
  }

  if (accounts.length === 0) {
    const allVerified = await prisma.emailAccount.findMany({
      where: enabledVerifiedWhere,
      orderBy: { id: 'asc' },
    });
    if (allVerified.length === 1) {
      accounts = allVerified;
    }
  }

  return accounts;
}

async function resolveEmailSenderAccount({ leadId, requestedAccountId, user }) {
  const permittedAccounts = await getPermittedEmailSenderAccounts({ leadId, user });
  const explicitAccountId = parsePositiveInt(requestedAccountId);

  if (explicitAccountId) {
    const explicitAccount = permittedAccounts.find((account) => account.id === explicitAccountId) || null;
    if (!explicitAccount) {
      const error = new Error('Selected email account is not available for this lead');
      error.statusCode = 403;
      throw error;
    }
    return explicitAccount;
  }

  return permittedAccounts[0] || null;
}

async function resolveEmailReplyContext({ leadId, replyToMessageId, inReplyTo }) {
  if (inReplyTo) {
    return { inReplyTo: String(inReplyTo), replyMessage: null };
  }

  const parentId = parsePositiveInt(replyToMessageId);
  if (!parentId) {
    return { inReplyTo: null, replyMessage: null };
  }

  const replyMessage = await prisma.message.findFirst({
    where: {
      id: parentId,
      leadId,
      channel: 'email',
      emailMessageId: { not: null },
    },
    select: {
      id: true,
      emailMessageId: true,
      emailSubject: true,
      emailAccountId: true,
    },
  });

  if (!replyMessage?.emailMessageId) {
    throw new Error('Reply target not found');
  }

  return { inReplyTo: replyMessage.emailMessageId, replyMessage };
}

async function renderEmailTemplateForLead(templateId, leadId) {
  const resolvedTemplateId = parsePositiveInt(templateId);
  if (!resolvedTemplateId) throw new Error('templateId required');

  const [lead, template] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId } }),
    prisma.emailTemplate.findUnique({ where: { id: resolvedTemplateId } }),
  ]);

  if (!lead) throw new Error('Lead not found');
  if (!template) throw new Error('Template not found');

  const ctx = { lead, company: lead.company || '', product: lead.product || '' };
  const render = (str) => (str || '').replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const value = path.split('.').reduce((obj, key) => obj?.[key], ctx);
    return value != null ? String(value) : '';
  });

  return {
    lead,
    template,
    subject: render(template.subject),
    body: render(template.textBody || ''),
    htmlBody: render(template.htmlBody || ''),
  };
}

async function sendManualWhatsAppMessage({ leadId, text }) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    const error = new Error('Lead not found');
    error.statusCode = 404;
    throw error;
  }

  const accountId = lead.assignedAccount || (await whatsappManager.getNextAccount());
  if (!accountId) {
    const error = new Error('No WhatsApp account is connected. Please connect an account first.');
    error.statusCode = 503;
    throw error;
  }

  // The lead's number, or — for someone Meta identifies only by their
  // WhatsApp username — their business-scoped user id.
  const address = whatsappAddress(lead);
  if (!address) {
    const error = new Error('This lead has no WhatsApp number or WhatsApp user id to reply to.');
    error.statusCode = 400;
    throw error;
  }

  const result = await whatsappManager.sendMessage(address, text.trim(), accountId);
  if (!result.success) {
    const error = new Error(`WhatsApp send failed: ${result.reason || 'unknown error'}`);
    error.statusCode = 500;
    error.reason = result.reason;
    throw error;
  }

  const message = await prisma.message.create({
    data: {
      leadId: lead.id,
      direction: 'outbound',
      channel: 'whatsapp',
      content: text.trim(),
      waAccount: accountId,
      // Without the provider id, delivery receipts and pricing for this
      // message could only be matched by guessing from the number.
      waMessageId: result.waMessageId || null,
      status: 'sent',
      sentAt: new Date(),
    },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: 'engaged', engagementLevel: 'high', repliedAt: new Date() },
  });

  activityLog.add('reply', `Sent manual reply to ${lead.name}`, { leadId: lead.id });

  return { lead, accountId, message };
}

/**
 * Send files from the media library to a lead on WhatsApp — photos, PDFs,
 * documents, audio, video — with an optional caption on the first one.
 *
 * Meta's Cloud API numbers only: the file is uploaded to Meta and sent by
 * media id (services/whatsappMedia.js). Like any free-form message it is
 * only delivered within 24 hours of the lead's last message.
 */
async function sendWhatsAppFiles({ leadId, mediaFileIds, caption = '', accountId: requestedAccountId = null }) {
  const fail = (message, statusCode = 400, reason) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    if (reason) error.reason = reason;
    return error;
  };

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw fail('Lead not found', 404);
  const address = whatsappAddress(lead);
  if (!address) throw fail('This lead has no WhatsApp number or WhatsApp user id.');
  const accountId = requestedAccountId || lead.assignedAccount || (await whatsappManager.getNextAccount());
  if (!accountId) throw fail('No WhatsApp account is connected. Please connect an account first.', 503);

  const ids = [...new Set(mediaFileIds.map((id) => parseInt(id)).filter(Number.isInteger))].slice(0, 10);
  const files = await prisma.mediaFile.findMany({ where: { id: { in: ids } } });
  if (files.length === 0) throw fail('No files to send.');

  const sent = [];
  for (const [index, file] of files.entries()) {
    const absolute = path.resolve(__dirname, '..', file.path);
    if (!absolute.startsWith(path.resolve(WHATSAPP_MEDIA_DIR) + path.sep) || !existsSync(absolute)) {
      throw fail(`File ${file.originalName} is missing from storage.`, 404);
    }
    const fileCaption = index === 0 ? String(caption || '').trim() : '';
    let result;
    try {
      result = await sendMediaFile({
        address,
        filePath: absolute,
        mimeType: file.mimeType,
        filename: file.originalName,
        caption: fileCaption,
        accountId,
      });
    } catch (error) {
      if (error.code === 'provider_unsupported') {
        throw fail('Sending files needs a number connected through Meta\'s Cloud API. On AiSensy numbers, send the file as a link.', 400, 'provider_unsupported');
      }
      throw fail(`Could not send ${file.originalName}: ${error.message}`, 502, error.code);
    }
    if (!result.success) {
      throw fail(result.reason === 're_engagement_required'
        ? 'WhatsApp only delivers files within 24 hours of the lead\'s last message. Send an approved template first.'
        : `WhatsApp send failed: ${result.reason || 'unknown error'}`, 502, result.reason);
    }
    sent.push(await prisma.message.create({
      data: {
        leadId: lead.id,
        direction: 'outbound',
        channel: 'whatsapp',
        content: fileCaption || `[${result.kind === 'pdf' ? 'Document' : result.kind[0].toUpperCase() + result.kind.slice(1)}] ${file.originalName}`,
        waAccount: accountId,
        waMessageId: result.messageId || null,
        mediaUrl: file.path,
        mediaType: result.kind,
        mediaCaption: fileCaption || null,
        mediaFilename: file.originalName,
        status: 'sent',
        sentAt: new Date(),
      },
    }));
  }

  await prisma.lead.update({ where: { id: lead.id }, data: { lastMessageAt: new Date() } });
  activityLog.add('reply', `Sent ${sent.length} file${sent.length === 1 ? '' : 's'} on WhatsApp to ${lead.name}`, { leadId: lead.id });
  return { lead, accountId, messages: sent };
}

/** SSE clients for real-time activity feed */
const sseClients = new Set();
export function broadcastEvent(type, data) {
  const payload = `data: ${JSON.stringify({ type, data, ts: Date.now() })}

`;
  sseClients.forEach((res) => { try { res.write(payload); } catch(e) { sseClients.delete(res); } });
}

/**
 * API Server for the Outbound OS Dashboard
 */
const app = express();

// Which proxies may say who the client is (X-Forwarded-For). Rate limits key
// on that address, so trusting an arbitrary first hop would let anyone reset
// their own login limit with a forged header. Default: a proxy on this
// machine or a private network (Caddy, Nginx, a Docker network, a tunnel).
// Behind a CDN, set TRUST_PROXY to its hop count or address ranges.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

// Rate limiting
const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
// Only failed attempts count, so guessing is capped at five a minute while a
// person signing in normally is never the one who gets locked out.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts, try again in a minute' },
});
const bulkLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: 'Too many bulk operations, try again in a minute' } });
app.use('/api/', globalLimiter);
const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, message: { error: 'Too many code requests, try again shortly' } });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/otp/request', otpLimiter);
app.use('/api/auth/otp/verify', otpLimiter);
app.use('/api/auth/register-first', authLimiter);
// Changing a password is a credential operation and is brute-forceable
// through a session someone left open, so it gets the same limiter as login.
app.use('/api/auth/change-password', authLimiter);
app.use('/api/import/csv', bulkLimiter);
app.use('/api/config/env', bulkLimiter);

// Browsers only need CORS when the dashboard is served from a different origin
// than this API (for example a CDN in front of a separate API host). The
// Docker image serves both from one origin, so self-hosted installs usually
// need nothing here. List extra origins, comma-separated, in CORS_ORIGIN.
const ALLOWED_ORIGINS = [
  ...String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  // Vite dashboard and local API in development.
  'http://localhost:5173',
  'http://localhost:3001',
  'http://localhost:5180',
  'http://localhost:3002',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
    else cb(null, false);
  },
  credentials: true,
}));
app.use(cookieParser());
// Populates req.auth() / getAuth(req) for every request below. requireRole()
// reads from it; nothing else in the chain does the verification itself.
app.use(authMiddleware());
// Retain the raw body so webhook signatures can be verified over the exact
// bytes we received — re-serializing the parsed object would change key order
// and whitespace, and the HMAC would never match.
// Plain HTML forms (and some marketplaces) post form-encoded bodies. Accepted
// only on the lead webhook: everything else stays JSON-only, so a cross-site
// form can never reach an authenticated endpoint.
app.use('/api/webhooks/inbound', express.urlencoded({
  extended: false,
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Health check (no auth)
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', uptime: process.uptime(), version: '1.0.0' });
  } catch {
    res.status(503).json({ status: 'error', uptime: process.uptime(), db: 'unreachable' });
  }
});

// Serve the React dashboard from web/dist (built into the Docker image)
const WEB_DIST = path.join(__dirname, '..', 'web', 'dist');
app.use(express.static(WEB_DIST));

// ======================== AUTHENTICATION ========================
// src/auth/index.js picks built-in email + password sign-in (default) or
// Clerk. The dashboard asks /api/auth/config which one to render.

app.get('/api/auth/config', (_req, res) => {
  res.json(publicAuthConfig());
});

if (AUTH_PROVIDER === 'local') {
  app.post('/api/auth/login', (req, res) => {
    localLogin(req, res).catch((error) => res.status(500).json({ error: error.message }));
  });
  app.post('/api/auth/change-password', requireRole('viewer'), (req, res) => {
    localChangePassword(req, res).catch((error) => res.status(500).json({ error: error.message }));
  });
}

// ── Public liveness probe (uptime monitors, container healthcheck) ───────────
// Mounted before the global /api auth gate. Deliberately minimal — does NOT
// leak per-account state, queue depth, or other internal signals. Returns
// 200 when DB is reachable and the app can serve, 503 otherwise.
app.get('/healthz', async (_req, res) => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    res.json({
      status: 'ok',
      uptimeSec: process.uptime(),
      instance: process.env.INSTANCE_NAME || 'default',
    });
  } catch (e) {
    res.status(503).json({ status: 'degraded', error: 'db_unreachable' });
  }
});

// ── Global auth middleware (viewer minimum for all /api routes) ───────────────
// ── Inbound lead webhooks ───────────────────────────────────────────────────
// Mounted BEFORE the global /api auth gate below, because this route carries
// its own authentication: a per-source API key checked against WebhookSource.
// It was previously defined ~5,000 lines further down, which put it behind
// requireRole('viewer') — so every external sender, which by definition has no
// Clerk session, got "Not signed in." and no lead ever arrived.
/**
 * What a visitor sees after a plain HTML form posts to a lead webhook:
 * either a redirect back to the form's own site (_next), or a small thank-you
 * page instead of raw JSON.
 *
 * _next is only followed to the host the form was submitted from (its Origin
 * or Referer). Anything else would make this server an open redirect: the
 * webhook key sits in public form HTML, so anyone could otherwise build a link
 * that bounces through your domain to a phishing page.
 */
function sendFormThanks(req, res, payload) {
  const next = String(payload?._next || '').trim();
  if (next) {
    try {
      const target = new URL(next);
      const origin = req.get('origin') || req.get('referer') || '';
      const fromHost = origin ? new URL(origin).host : '';
      if (/^https?:$/.test(target.protocol) && fromHost && target.host === fromHost) {
        return res.redirect(303, target.toString());
      }
    } catch { /* invalid URL: fall through to the thank-you page */ }
  }
  const name = String(businessProfile.businessName || 'us')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  res.status(200).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Thank you</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f5f6f8;color:#1f2328;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
main{background:#fff;border:1px solid #dde1e6;border-radius:12px;padding:32px;max-width:420px;text-align:center}
h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#565d66;line-height:1.6}</style></head>
<body><main><h1>Thank you</h1><p>Your message reached ${name}. We will get back to you shortly.</p></main></body></html>`);
}

app.post('/api/webhooks/inbound/:source', async (req, res) => {
  try {
    const ws = await prisma.webhookSource.findUnique({ where: { source: req.params.source } });
    if (!ws || !ws.enabled) return res.status(404).json({ error: 'Webhook source not found or disabled' });

    // Auth: check x-api-key header or apiKey query param. Compared in constant
    // time — `!==` on a secret leaks its length and, byte by byte, its content
    // to anyone who can time the responses.
    const providedKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!secretsMatch(providedKey, ws.apiKey)) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const payload = req.body || {};
    const fromHtmlForm = Boolean(req.is('application/x-www-form-urlencoded'));

    // Spam trap: a hidden field humans never fill in (Formspree calls it
    // _gotcha). Bots fill every field, so a value here means a bot. Answer as
    // if it worked, so the bot learns nothing, and store nothing.
    if (String(payload._gotcha ?? '').trim()) {
      return fromHtmlForm ? sendFormThanks(req, res, payload) : res.json({ ok: true });
    }

    let fieldMap;
    try { fieldMap = JSON.parse(ws.fieldMap || '{}'); } catch { fieldMap = {}; }

    // Map payload fields to lead fields using fieldMap, falling back to the
    // obvious key name and then to known aliases. Resolves "a.b.c" as well as
    // "a": senders that post a nested envelope — Engyne's lead.captured puts the
    // buyer under data.lead.* — were unreachable by a flat lookup, so their
    // fieldMap silently mapped nothing and every lead arrived with no mobile and
    // no email. See src/utils/inboundLead.js, which is unit-tested.
    const mapped = mapInboundLead(payload, fieldMap);
    const { name, email, company, product, country, quantity } = mapped;
    const mobile = mapped.rawMobile;

    if (!mobile && !email) return res.status(400).json({ error: 'Payload must contain mobile or email' });

    // A test delivery proves the wiring without touching anything real.
    // Engyne's admin webhook has a Test button that posts test: true, and
    // without this it would create a lead in the CRM and immediately WhatsApp
    // and email whoever the sample payload names. Echo what WOULD be created
    // so the field mapping is verifiable, and create nothing.
    if (payload.test === true || payload.test === 'true') {
      return res.json({
        ok: true,
        test: true,
        created: false,
        mapped: { name, mobile: mapped.mobile, email, company, product, country, quantity },
      });
    }

    const cleanMobile = mapped.mobile;

    const now = new Date();
    // Pool ownership: prefer the WebhookSource's configured pool. If the
    // source has no pool yet (legacy rows), fall back to the default pool
    // so leads still land somewhere visible.
    let webhookPoolId = ws.poolId;
    if (!webhookPoolId) {
      const def = await prisma.leadPool.findFirst({ where: { isDefault: true }, select: { id: true } });
      webhookPoolId = def?.id ?? null;
    }
    // Match on whichever identifier arrived. Looking up by mobile alone meant an
    // email-only lead was created afresh on every delivery.
    //
    // With both, the number decides; failing that, an earlier email-only lead
    // for the same address (its mobile still a no-phone: placeholder) is the
    // same person, now with a number. Matching only by number created a second
    // lead for them, and a second round of first-contact messages.
    let existingLead = cleanMobile
      ? await prisma.lead.findFirst({ where: { mobile: cleanMobile } })
      : null;
    if (!existingLead && email) {
      existingLead = await prisma.lead.findFirst({
        where: cleanMobile
          ? { email, mobile: { startsWith: 'no-phone:' } }
          : { email },
        orderBy: { id: 'asc' },
      });
    }

    // Lead.mobile is required, so an email-only lead still needs a value. It used
    // to get String(Date.now()), which reads as a 13-digit phone number: it landed
    // in the CRM's Mobile column and was pushed to Google Sheets as if it were the
    // buyer's number, and being unique per delivery it defeated deduplication too.
    // A prefixed, non-numeric placeholder can never be mistaken for a number.
    const mobileValue = cleanMobile || `no-phone:${email || req.params.source}`;

    // A lead first delivered without a number, then re-delivered once Engyne
    // resolved one, is the case behind "the sheet has no phone numbers": the row
    // is already there with a blank Mobile. Treat that as news worth announcing
    // again, so the sheet gets a row that actually carries the number.
    const backfilledMobile = Boolean(
      existingLead && cleanMobile && !isSendableMobile(existingLead.mobile),
    );

    // A ticked "email me" box on the sender's form. Recorded with when and
    // where it was given; never removed here — an opt-out goes through the
    // unsubscribe path, not a later form that happened to leave the box empty.
    const consent = mapped.emailConsent && email
      ? {
          emailMarketingConsent: true,
          emailMarketingConsentAt: now,
          emailMarketingConsentSource: `webhook:${req.params.source}`,
        }
      : {};

    const lead = existingLead
      ? await prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            updatedAt: now,
            // Fill in what the first delivery was missing. A lead captured
            // without a number, then re-sent once Engyne resolved one, kept the
            // placeholder forever and could never be called or messaged.
            ...(cleanMobile && existingLead.mobile !== cleanMobile ? { mobile: cleanMobile } : {}),
            ...(email && !existingLead.email ? { email } : {}),
            ...(company && !existingLead.company ? { company } : {}),
            ...(product && !existingLead.product ? { product } : {}),
            ...(country && !existingLead.country ? { country } : {}),
            ...(quantity && !existingLead.quantity ? { quantity } : {}),
            ...(consent.emailMarketingConsent && !existingLead.emailMarketingConsent ? consent : {}),
          },
        })
      : await prisma.lead.create({
          data: {
        name, mobile: mobileValue, email, company, product, country, quantity,
        ...consent,
        source: req.params.source, status: 'new',
        consumedAt: now, leadTier: 'HOT',
        poolId: webhookPoolId,
      },
    });

    // Update webhook stats
    await prisma.webhookSource.update({
      where: { id: ws.id },
      data: { lastReceivedAt: now, totalReceived: { increment: 1 } },
    });

    activityLog.add(EVENT_TYPES.LEAD_CREATED, `Webhook lead from ${ws.name}: ${name}`, { leadId: lead.id });

    // Reach out immediately. A lead arriving here is HOT by definition —
    // somebody is enquiring right now — so a row that just sits until a human
    // opens the dashboard defeats the point of the webhook.
    //
    // Deliberately after the response data is settled and wrapped: queueing is
    // idempotent (automationKey per lead+channel) and must never be able to
    // fail the ingest. Losing the lead because an outreach account is at its
    // daily cap would be far worse than a delayed first touch.
    let outreach = null;
    try {
      const { default: freshLeadOutreach } = await import('./services/freshLeadOutreach.js');
      outreach = await freshLeadOutreach.queue(lead);
      // Then send it, rather than leaving it for the two-minute cron. A lead
      // arriving here is HOT by definition — somebody is enquiring right now —
      // and the whole promise is immediate contact. Failures are logged, never
      // fatal: the lead and its queue rows are already durable, so the cron
      // remains the safety net.
      await freshLeadOutreach.dispatchNow(lead);
    } catch (err) {
      logger.error(`Webhook lead ${lead.id}: outreach failed - ${err.message}`);
    }

    // Announce the lead. Without these two calls a webhook lead existed only
    // in the CRM: Google Sheets never received the row and no webhook
    // subscriber ever heard about it. Non-blocking — a sync failure must never
    // fail the ingest.
    if (!existingLead || backfilledMobile) {
      webhookDispatcher.dispatch('lead.created', {
        leadId: lead.id, name: lead.name, source: lead.source,
      }).catch(() => {});
      sheetsSync.dispatch('lead.created', lead).catch(() => {});
    }

    if (fromHtmlForm) return sendFormThanks(req, res, payload);
    res.json({ ok: true, leadId: lead.id, created: !existingLead, outreach });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// Provider webhooks verify their own signatures/secrets and keep the raw body
// captured above. They must not require a dashboard session.
app.use(providerWebhookRoutes);

app.use('/api', requireRole('viewer'));

// Self-service profile/password used to be hand-rolled here; Clerk's own
// <UserProfile/> replaces it — see web/src/pages/account.tsx.
// Orders, customer invoices and shipments.
app.use('/api', salesRoutes);
// Customers, revenue and order notifications.
app.use('/api', customerRoutes);
// Payment methods, suppliers, and order settlement.
app.use('/api', settlementRoutes);
// Product catalogue.
app.use('/api', productRoutes);
// Telegram connected-account authentication and manual messaging.
app.use('/api', telegramRoutes);
// Pool scoping runs after auth — platform admins bypass, every other user is
// 403'd if they reference a poolId they don't have a UserPool row for.
app.use('/api', requirePoolAccess());
// Per-lead authorization: every /api/leads/<numeric>/... request resolves
// the lead's poolId once and 403s if the user can't access it. This covers
// detail / patch / delete / send / notes / tasks / etc. without each handler
// having to call userCanAccessPool itself. The numeric constraint avoids
// matching /api/leads/bulk and /api/leads/import-json.
app.use('/api/leads/:id([0-9]+)', requireLeadAccess('id'));

// ======================== USER MANAGEMENT (admin only) ========================
app.get('/api/users', requireRole('admin'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, role: true, phone: true, enabled: true, lastLoginAt: true, createdAt: true },
    });
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role = 'agent', phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
    const VALID_ROLES = ['admin', 'manager', 'agent', 'viewer'];
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });

    // Store bare digits so "+44 7700 900123" and "447700900123" are one number.
    // Without this the login lookup would miss on formatting alone.
    const normalizedPhone = phone ? phoneOtp.normalizePhone(phone) : null;
    if (phone && !normalizedPhone) return res.status(400).json({ error: 'phone is not a valid number' });

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash: hashPassword(password),
        role,
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      },
      select: { id: true, name: true, email: true, role: true, phone: true, enabled: true, createdAt: true },
    });
    res.json(user);
  } catch (e) {
    if (e.code === 'P2002') {
      const field = e.meta?.target?.includes?.('phone') ? 'Phone number' : 'Email';
      return res.status(409).json({ error: `${field} already in use` });
    }
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/users/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, role, enabled, password, phone } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (role !== undefined) data.role = role;
    if (enabled !== undefined) data.enabled = Boolean(enabled);
    if (password) data.passwordHash = hashPassword(password);
    if (phone !== undefined) {
      // Empty string clears the number (disabling phone login for this user);
      // anything else must normalize to real digits.
      if (!phone) {
        data.phone = null;
      } else {
        const normalizedPhone = phoneOtp.normalizePhone(phone);
        if (!normalizedPhone) return res.status(400).json({ error: 'phone is not a valid number' });
        data.phone = normalizedPhone;
      }
    }
    const user = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data,
      select: { id: true, name: true, email: true, role: true, phone: true, enabled: true },
    });
    res.json(user);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    // phone is unique now, so a clash here is a user error, not a server fault.
    if (e.code === 'P2002') {
      const field = e.meta?.target?.includes?.('phone') ? 'Phone number' : 'Email';
      return res.status(409).json({ error: `${field} is already assigned to another user` });
    }
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/users/:id', requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (req.user?.sub === id) return res.status(400).json({ error: 'Cannot delete your own account' });
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/me — current user info
app.get('/api/auth/me', requireRole('viewer'), (req, res) => {
  res.json({ user: req.user || null });
});

// ======================== REAL-TIME EVENTS (SSE) ========================

app.get('/api/events', async (req, res) => {
  // EventSource cannot send an Authorization header, so this is the one
  // route that verifies a Clerk token from the query string instead of
  // going through requireRole().
  const auth = await verifyQueryToken(req.query.token);
  if (!auth?.role) return res.status(401).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}

`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ======================== SYSTEM CONTROLS & HEALTH ========================

app.get('/api/system/status', requireRole('manager'), async (req, res) => {
  try {
    const accountStatus = await whatsappManager.getStatus().catch(() => []);
    const enabledAccounts = accountStatus.filter((account) => account.enabled).length;
    const connectedAccounts = accountStatus.filter((account) => account.enabled && account.isReady).length;

    res.json({
      connectedAccounts,
      enabledAccounts,
      dashboardConnections: sseClients.size,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/system/health', requireRole('manager'), async (req, res) => {
  // Comprehensive snapshot the dashboard + ops can use to spot stalled
  // automation. Each subsystem has its own freshness threshold; we surface the
  // raw timestamps and let the caller decide what's "stale enough to page".
  const base = resourceMonitor.getHealth();

  // DB ping
  let dbOk = true;
  try { await prisma.$queryRawUnsafe('SELECT 1'); } catch { dbOk = false; }

  // WhatsApp accounts: ready Map
  let waAccounts = [];
  try {
    waAccounts = (await whatsappManager.getStatus()).map((a) => ({
      id: a.id,
      name: a.name,
      enabled: a.enabled,
      isReady: a.isReady,
      messagesSentToday: a.messagesSentToday,
    }));
  } catch (_) {}

  // Email accounts: lastSyncAt from DB
  let emailAccounts = [];
  try {
    const accounts = await prisma.emailAccount.findMany({
      where: { enabled: true },
      select: { id: true, email: true, lastSyncAt: true, lastError: true },
    });
    emailAccounts = accounts.map((a) => ({
      id: a.id,
      email: a.email,
      lastSyncAt: a.lastSyncAt,
      minutesSinceSync: a.lastSyncAt
        ? Math.round((Date.now() - a.lastSyncAt.getTime()) / 60000)
        : null,
      lastError: a.lastError || null,
    }));
  } catch (_) {}

  let recoveryHealth = null;
  try { recoveryHealth = await recoveryCoordinator.getStatus(); } catch (_) {}

  // ── Computed health summary for the dashboard banner ──
  // Collapses the subsystems into one overall status + a human issue list so the
  // operator sees "X is down" immediately instead of nothing. This is the
  // antidote to the silent-failure problem (model removed, email decrypt broke,
  // accounts dropped — all unnoticed for weeks).
  const issues = [];
  if (!dbOk) issues.push({ severity: 'down', area: 'database', message: 'Database is unreachable' });
  // WhatsApp accounts reconnect on a staggered ~4-min boot after every restart.
  // During that window they're legitimately not-ready, which previously made the
  // banner shout "N accounts disconnected" right after every deploy — alarming
  // operators into thinking accounts got banned. Suppress WA-not-ready alarms
  // during a startup grace period; only flag genuine drops once we're past it.
  const WA_BOOT_GRACE_SEC = 300; // 5 min — covers staggered reconnect of ~9 accounts
  const booting = (base.uptimeSec ?? Infinity) < WA_BOOT_GRACE_SEC;
  const enabledWa = waAccounts.filter((a) => a.enabled);
  const deadWa = enabledWa.filter((a) => !a.isReady);
  if (!booting && enabledWa.length > 0 && deadWa.length === enabledWa.length) {
    issues.push({ severity: 'down', area: 'whatsapp', message: 'All enabled WhatsApp accounts are disconnected' });
  } else if (!booting && deadWa.length > 0) {
    issues.push({ severity: 'warn', area: 'whatsapp', message: `${deadWa.length} WhatsApp account(s) disconnected: ${deadWa.map((a) => a.name).join(', ')}` });
  }
  const brokenEmail = emailAccounts.filter((a) => a.lastError);
  if (brokenEmail.length > 0) {
    issues.push({ severity: 'warn', area: 'email', message: `${brokenEmail.length} email account(s) with errors: ${brokenEmail.map((a) => a.email).join(', ')}` });
  }
  if (recoveryHealth?.lastRecoveryStatus === 'failed') {
    issues.push({
      severity: 'down',
      area: 'recovery',
      message: `Last restart/wake recovery failed${recoveryHealth.summary?.error ? `: ${recoveryHealth.summary.error}` : ''}`,
    });
  } else if (recoveryHealth?.lastRecoveryStatus === 'degraded') {
    issues.push({
      severity: 'warn',
      area: 'recovery',
      message: 'Last restart/wake recovery completed, but some channels could not be reconciled',
    });
  }
  const overall = issues.some((i) => i.severity === 'down')
    ? 'down'
    : issues.length > 0
      ? 'degraded'
      : 'ok';

  res.json({
    ...base,
    db: dbOk ? 'ok' : 'down',
    instance: process.env.INSTANCE_NAME || 'default',
    whatsapp: waAccounts,
    email: emailAccounts,
    recovery: recoveryHealth,
    health: { overall, issues },
  });
});

app.get('/api/system/recovery', requireRole('agent'), async (_req, res) => {
  try {
    res.json(await recoveryCoordinator.getStatus());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/system/recovery/run', requireRole('manager'), async (req, res) => {
  try {
    const result = await recoveryCoordinator.runRecovery({ reason: 'manual' });
    res.status(result?.status === 'failed' ? 503 : 200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== OVERVIEW & STATS ========================

const DELIVERED_MESSAGE_STATUSES = ['sent', 'delivered', 'read'];

app.get('/api/stats/overview', async (req, res) => {
  try {
    const tzOffset = parseTimezoneOffset(req.query.tzOffset);
    const days = Math.min(30, Math.max(1, Number.parseInt(req.query.days, 10) || 14));
    const { start: startOfDayUTC, end: endOfDayUTC } =
      getLocalDayRangeUTC(tzOffset);
    const periodEnd = endOfDayUTC;
    const periodStart = new Date(periodEnd.getTime() - days * 86400000);
    const previousStart = new Date(periodStart.getTime() - days * 86400000);
    // Pool scoping: respect explicit ?poolId, otherwise restrict to whatever
    // pools the user has membership for so a partner-only user can never
    // accidentally see team-pool numbers in their dashboard overview.
    // Platform admins get unrestricted access (`accessiblePools === null`).
    const accessiblePools = await getAccessiblePoolIds(req);
    const poolFilter = req.query.poolId
      ? { poolId: parseInt(req.query.poolId) }
      : accessiblePools === null ? {} : { poolId: { in: accessiblePools } };

    const [
      totalLeads, statusCounts, todayLeads, pendingMessages, scoreDistribution,
      inboundLeadRows,
      outboundLeadRows,
      waUnavailable, sentToday,
    ] = await Promise.all([
      prisma.lead.count({ where: poolFilter }),
      prisma.lead.groupBy({ by: ['status'], where: poolFilter, _count: true }),
      prisma.lead.count({ where: { ...poolFilter,
          ...buildNewLeadDateWhere(startOfDayUTC, endOfDayUTC),
        } }),
      prisma.message.count({ where: { status: { in: ['queued', 'sending'] }, lead: poolFilter } }),
      prisma.lead.groupBy({ by: ['engagementLevel'], where: poolFilter, _count: true }),
      prisma.message.findMany({ where: { direction: 'inbound', lead: poolFilter }, select: { leadId: true }, distinct: ['leadId'] }),
      prisma.message.findMany({
        where: {
          direction: "outbound",
          status: { in: DELIVERED_MESSAGE_STATUSES },
          lead: poolFilter,
        },
        select: { leadId: true },
        distinct: ["leadId"],
      }),
      prisma.lead.count({ where: { ...poolFilter, isOnWhatsApp: false } }),
      prisma.message.count({
        where: {
          direction: 'outbound',
          status: { in: DELIVERED_MESSAGE_STATUSES },
          sentAt: { gte: startOfDayUTC, lt: endOfDayUTC },
          lead: poolFilter,
        } }),
    ]);

    const statusMap = Object.fromEntries(statusCounts.map((s) => [s.status, s._count]));
    const scoreMap = Object.fromEntries(scoreDistribution.map((s) => [s.engagementLevel, s._count]));
    const contactedLeadIds = new Set(outboundLeadRows.map((row) => row.leadId));
    const repliedLeadIds = new Set(
      inboundLeadRows
        .map((row) => row.leadId)
        .filter((leadId) => contactedLeadIds.has(leadId)),
    );

    const periodMetrics = async (start, end) => {
      const [newLeads, outbound, inbound] = await Promise.all([
        prisma.lead.count({ where: { ...poolFilter, ...buildNewLeadDateWhere(start, end) } }),
        prisma.message.findMany({ where: { direction: 'outbound', status: { in: DELIVERED_MESSAGE_STATUSES }, sentAt: { gte: start, lt: end }, lead: poolFilter }, select: { leadId: true } }),
        prisma.message.findMany({ where: { direction: 'inbound', createdAt: { gte: start, lt: end }, lead: poolFilter }, select: { leadId: true } }),
      ]);
      return {
        newLeads,
        messagesSent: outbound.length,
        contactedLeads: new Set(outbound.map((row) => row.leadId)).size,
        repliedLeads: new Set(inbound.filter((row) => contactedLeadIds.has(row.leadId)).map((row) => row.leadId)).size,
      };
    };
    const [currentPeriod, previousPeriod] = await Promise.all([
      periodMetrics(periodStart, periodEnd),
      periodMetrics(previousStart, periodStart),
    ]);

    res.json({
      totalLeads,
      newToday: todayLeads,
      contacted: contactedLeadIds.size,
      replied: repliedLeadIds.size,
      engaged: statusMap.engaged || 0,
      closed: statusMap.closed || 0,
      pending: pendingMessages,
      sentToday,
      waUnavailable,
      period: { days, current: currentPeriod, previous: previousPeriod },
      scoreDistribution: {
        hot: scoreMap.high || 0,
        warm: scoreMap.medium || 0,
        cold: scoreMap.low || 0,
        new: scoreMap.none || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats/activity', (req, res) => {
  const count = parseInt(req.query.count) || 20;
  res.json(activityLog.getRecent(count));
});

// ── Persisted Notifications (survive restarts) ────────────────────────────────
// Returns the last N ActivityLog rows from the DB, shaped as ActivityLog items.
app.get('/api/notifications', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const rows = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const items = rows.map((row) => ({
      id: row.id,
      type: row.type,
      message: row.message,
      accountId: row.accountId ?? null,
      leadId: row.leadId ?? null,
      data: row.meta ? (() => { try { return JSON.parse(row.meta); } catch { return null; } })() : null,
      createdAt: row.createdAt.toISOString(),
      timestamp: row.createdAt.toISOString(),
    }));
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all notifications read — read state is tracked client-side in localStorage;
// this endpoint exists as the API surface for future server-side read tracking.
app.patch('/api/notifications/read-all', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/stats/charts', async (req, res) => {
  try {
    const days = Math.min(
      90,
      Math.max(1, Number.parseInt(req.query.days, 10) || 14),
    );
    const tzOffsetMin = parseTimezoneOffset(req.query.tzOffset);
    const { start: todayStartUTC, end: tomorrowStartUTC } =
      getLocalDayRangeUTC(tzOffsetMin);
    const sinceUTC = new Date(
      todayStartUTC.getTime() - (days - 1) * 24 * 60 * 60_000,
    );
    const previousSinceUTC = new Date(sinceUTC.getTime() - days * 86400000);
    const accessiblePools = await getAccessiblePoolIds(req);
    const poolFilter = req.query.poolId
      ? { poolId: Number.parseInt(req.query.poolId, 10) }
      : accessiblePools === null
        ? {}
        : { poolId: { in: accessiblePools } };

    // ── Messages per day: fetch raw rows and bucket in JS (DB-agnostic) ──
    const [rawMessages, inboundMessages, newLeads, everContacted] = await Promise.all([prisma.message.findMany({
      where: {
        direction: 'outbound',
        status: { in: DELIVERED_MESSAGE_STATUSES },
        sentAt: { gte: previousSinceUTC, lt: tomorrowStartUTC },
        lead: poolFilter,
      },
      select: { sentAt: true, channel: true, leadId: true },
    }), prisma.message.findMany({
      where: { direction: 'inbound', createdAt: { gte: sinceUTC, lt: tomorrowStartUTC }, lead: poolFilter },
      select: { leadId: true, createdAt: true },
    }), prisma.lead.findMany({
      where: { ...poolFilter, ...buildNewLeadDateWhere(sinceUTC, tomorrowStartUTC) },
      select: { consumedAt: true, createdAt: true },
    }), prisma.message.findMany({
      where: { direction: 'outbound', status: { in: DELIVERED_MESSAGE_STATUSES }, lead: poolFilter },
      select: { leadId: true }, distinct: ['leadId'],
    })]);
    const contactedIds = new Set(everContacted.map((message) => message.leadId));

    const dayBuckets = {};
    const previousBuckets = {};
    for (let i = 0; i < days; i++) {
      const bucketDate = new Date(sinceUTC.getTime() + i * 24 * 60 * 60_000);
      const key = localDateKey(bucketDate, tzOffsetMin);
      dayBuckets[key] = { count: 0, whatsapp: 0, email: 0, imessage: 0, telegram: 0, other: 0,
        newLeads: 0, contactedLeads: new Set(), repliedLeads: new Set() };
      previousBuckets[localDateKey(new Date(previousSinceUTC.getTime() + i * 86400000), tzOffsetMin)] = 0;
    }

    for (const msg of rawMessages) {
      if (!msg.sentAt) continue;
      // Shift by tzOffset so the date boundary matches local time
      const key = localDateKey(msg.sentAt, tzOffsetMin);
      if (key in previousBuckets) {
        previousBuckets[key] += 1;
        continue;
      }
      if (!(key in dayBuckets)) continue;
      const channel = ['whatsapp', 'email', 'imessage', 'telegram'].includes(msg.channel) ? msg.channel : 'other';
      dayBuckets[key].count += 1;
      dayBuckets[key][channel] += 1;
      dayBuckets[key].contactedLeads.add(msg.leadId);
    }
    for (const message of inboundMessages) {
      const key = localDateKey(message.createdAt, tzOffsetMin);
      if (key in dayBuckets && contactedIds.has(message.leadId)) dayBuckets[key].repliedLeads.add(message.leadId);
    }
    for (const lead of newLeads) {
      const key = localDateKey(lead.consumedAt || lead.createdAt, tzOffsetMin);
      if (key in dayBuckets) dayBuckets[key].newLeads += 1;
    }

    const msgsByDay = Object.entries(dayBuckets)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, bucket], index) => ({ day, ...bucket,
        contactedLeads: bucket.contactedLeads.size,
        repliedLeads: bucket.repliedLeads.size,
        previousTotal: previousBuckets[localDateKey(new Date(previousSinceUTC.getTime() + index * 86400000), tzOffsetMin)],
      }));

    // ── Prisma-native aggregations ──
    const [statusDist, countryDist, tierDist] = await Promise.all([
      prisma.lead.groupBy({ by: ['status'],
        where: poolFilter,
        _count: { id: true } }),
      prisma.lead.groupBy({
        by: ['country'],
        where: poolFilter,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } }, take: 8,
      }),
      prisma.lead.groupBy({ by: ['leadTier'],
        where: poolFilter,
        _count: { id: true } }),
    ]);

    res.json({ msgsByDay, statusDist, countryDist, tierDist });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/queue/preview', async (req, res) => {
  try {
    const upcoming = await prisma.message.findMany({
      where: {
        status: 'queued',
        direction: 'outbound',
        scheduledAt: { gte: new Date() },
      },
      include: { lead: { select: { name: true, country: true, leadTier: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    });
    res.json({
      total: upcoming.length,
      items: upcoming.map((m) => ({
        id: m.id,
        leadName: m.lead?.name,
        country: m.lead?.country,
        tier: m.lead?.leadTier,
        scheduledAt: m.scheduledAt,
        preview: m.content?.substring(0, 80),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== ANALYTICS ========================

app.get('/api/analytics', async (req, res) => {
  try {
    const requestedDays = Number(req.query.days ?? 30);
    const days = Number.isInteger(requestedDays)
      ? Math.min(90, Math.max(1, requestedDays))
      : 30;
    const tzOffset = parseTimezoneOffset(req.query.tzOffset);
    const { start: todayStart, end: tomorrowStart } = getLocalDayRangeUTC(tzOffset);
    const since = new Date(todayStart.getTime() - (days - 1) * 86400000);
    const newLeadWhere = buildNewLeadDateWhere(since, tomorrowStart);

    const [
      statusCounts,
      agentStats,
      recentLeads,
      topProducts,
      dealStats,
      replyStats,
    ] = await Promise.all([
      // Funnel: count by status
      prisma.lead.groupBy({
        by: ['status'],
        _count: { id: true },
      }),

      // Agent leaderboard: leads assigned, closed, deal value
      prisma.lead.groupBy({
        by: ['assignedToId'],
        where: { assignedToId: { not: null } },
        _count: { id: true },
        _sum: { dealValue: true },
      }),

      // Use source-event dates. SQLite stores Prisma DateTime values as epoch
      // milliseconds, so date(createdAt) and ISO-string comparisons are wrong.
      prisma.lead.findMany({
        where: newLeadWhere,
        select: { consumedAt: true, createdAt: true },
      }),

      // Top products by close rate
      prisma.lead.groupBy({
        by: ['product'],
        where: { ...newLeadWhere, product: { not: null } },
        _count: { id: true },
      }),

      // Deal stats: total closed value, avg deal size, count
      prisma.lead.aggregate({
        where: { status: 'closed', dealValue: { not: null } },
        _sum: { dealValue: true },
        _avg: { dealValue: true },
        _count: { id: true },
      }),

      // Reply rate: leads with status replied/engaged/closed vs total contacted
      prisma.lead.groupBy({
        by: ['status'],
        where: newLeadWhere,
        _count: { id: true },
      }),
    ]);

    // Enrich agent stats with user names
    const agentIds = agentStats.map((a) => a.assignedToId).filter(Boolean);
    const agentUsers = agentIds.length
      ? await prisma.user.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true, role: true },
        })
      : [];

    // Per-agent closed lead count
    const agentClosed = agentIds.length
      ? await prisma.lead.groupBy({
          by: ['assignedToId'],
          where: { assignedToId: { in: agentIds }, status: 'closed' },
          _count: { id: true },
          _sum: { dealValue: true },
        })
      : [];

    const agentMap = Object.fromEntries(agentUsers.map((u) => [u.id, u]));
    const closedMap = Object.fromEntries(agentClosed.map((a) => [a.assignedToId, a]));

    const agents = agentStats.map((a) => ({
      userId: a.assignedToId,
      name: agentMap[a.assignedToId]?.name || 'Unknown',
      role: agentMap[a.assignedToId]?.role || '',
      totalAssigned: a._count.id,
      totalClosed: closedMap[a.assignedToId]?._count?.id || 0,
      dealValue: closedMap[a.assignedToId]?._sum?.dealValue || 0,
      conversionRate: a._count.id > 0
        ? Math.round(((closedMap[a.assignedToId]?._count?.id || 0) / a._count.id) * 100)
        : 0,
    })).sort((a, b) => b.totalClosed - a.totalClosed);

    const dailyLeadCounts = new Map(Array.from({ length: days }, (_, i) => [
      localDateKey(new Date(since.getTime() + i * 86400000), tzOffset), 0,
    ]));
    for (const lead of recentLeads) {
      const day = localDateKey(lead.consumedAt || lead.createdAt, tzOffset);
      if (dailyLeadCounts.has(day)) {
        dailyLeadCounts.set(day, dailyLeadCounts.get(day) + 1);
      }
    }

    res.json({
      funnel: statusCounts.map((s) => ({ status: s.status, count: s._count.id })),
      agents,
      dailyLeads: [...dailyLeadCounts].map(([day, count]) => ({ day, count })),
      topProducts: topProducts
        .filter((p) => p.product)
        .sort((a, b) => b._count.id - a._count.id)
        .slice(0, 10)
        .map((p) => ({ product: p.product, count: p._count.id })),
      deals: {
        totalValue: dealStats._sum.dealValue || 0,
        avgValue: Math.round(dealStats._avg.dealValue || 0),
        count: dealStats._count.id,
      },
      replyFunnel: replyStats.map((s) => ({ status: s.status, count: s._count.id })),
      period: days,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lead pool routes removed — lead provenance is expressed with tags instead.


// ======================== LEADS ========================

// GET /api/leads/tags — the distinct tags in use, with counts.
// Tags are stored as a comma-separated string rather than a relation, so the
// list has to be derived. Declared before /api/leads/:id would match it, and
// that route also guards against non-numeric ids.
app.get('/api/leads/tags', async (req, res) => {
  try {
    const rows = await prisma.lead.findMany({
      where: { tags: { not: null } },
      select: { tags: true },
    });
    const counts = new Map();
    for (const row of rows) {
      for (const raw of String(row.tags || '').split(',')) {
        const tag = raw.trim();
        if (tag) counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const tags = [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    res.json({ tags });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leads', async (req, res) => {
  try {
    const {
      status, search, page = 1, limit = 25,
      sortBy = 'createdAt', sortOrder = 'desc',
      minScore, maxScore, source, tags, engagement,
      dateFrom, dateTo, assignedToId, poolId,
    } = req.query;

    // Build the where clause with AND composition so search and statusFilter can coexist
    const andClauses = [];

    // Pool scoping: explicit ?poolId narrows to that pool (membership already
    // verified by requirePoolAccess middleware); otherwise default to every
    // pool the user has UserPool membership for. Platform admins
    // (accessiblePools === null) skip this clause entirely.
    if (poolId) {
      andClauses.push({ poolId: parseInt(poolId) });
    } else {
      const accessiblePools = await getAccessiblePoolIds(req);
      if (accessiblePools !== null) {
        andClauses.push({ poolId: { in: accessiblePools } });
      }
    }

    if (status && status !== 'all') {
      if (status === 'wa_unavailable') {
        andClauses.push({ isOnWhatsApp: false });
      } else {
        andClauses.push({ status });
        // Exclude confirmed invalid numbers from normal status queues
        andClauses.push({ OR: [{ isOnWhatsApp: null }, { isOnWhatsApp: true }] });
      }
    }
    if (source) andClauses.push({ source });
    if (engagement) andClauses.push({ engagementLevel: engagement });
    if (assignedToId === 'unassigned') andClauses.push({ assignedToId: null });
    else if (assignedToId) andClauses.push({ assignedToId: parseInt(assignedToId) });
    if (tags) andClauses.push({ tags: { contains: tags } });
    if (minScore) andClauses.push({ score: { gte: parseInt(minScore) } });
    if (maxScore) andClauses.push({ score: { lte: parseInt(maxScore) } });
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d)) andClauses.push({ createdAt: { gte: d } });
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!isNaN(d)) { d.setHours(23, 59, 59, 999); andClauses.push({ createdAt: { lte: d } }); }
    }

    if (search) {
      andClauses.push({
        OR: [
          { name: { contains: search } },
          { company: { contains: search } },
          { product: { contains: search } },
          { mobile: { contains: search } },
          { email: { contains: search } },
        ],
      });
    }

    const where = andClauses.length > 0 ? { AND: andClauses } : {};

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const allowedSortFields = ['createdAt', 'updatedAt', 'name', 'score', 'status', 'source', 'followupCount', 'lastMessageAt', 'repliedAt'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy = { [safeSortBy]: safeSortOrder };

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy,
        skip,
        take: parseInt(limit),
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, direction: true, createdAt: true, status: true },
          },
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      leads,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leads/:id', async (req, res, next) => {
  // Express matches in declaration order, and this route is declared before
  // literal siblings like /api/leads/duplicates. Without this guard the word
  // "duplicates" was parsed as an id, became NaN, and Prisma rejected the
  // query with a 500 rather than the route ever being reached.
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        campaignLeads: { include: { campaign: { select: { name: true, id: true } } } },
        assignedTo: { select: { id: true, name: true, email: true } },
        leadNotes: { orderBy: { createdAt: 'desc' } },
        leadTasks: { orderBy: { createdAt: 'desc' } },
        // Surfaced so the drawer can link to the buying relationship rather
        // than dead-ending at the lead, and can tell "convert" from "open".
        customer: { select: { id: true, name: true, totalOrders: true, lifetimeValue: true, currency: true } },
        salesOrders: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, orderNumber: true, status: true, total: true, currency: true, createdAt: true },
        },
      },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leads', requireRole('agent'), async (req, res) => {
  try {
    const { name, mobile, company, email, product, country, quantity, tags, notes } = req.body;
    if (!name || !mobile) return res.status(400).json({ error: 'Name and mobile are required' });
    if (!validatePhone(mobile)) return res.status(400).json({ error: 'Invalid mobile number format' });
    if (email && !validateEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (name.length > 200) return res.status(400).json({ error: 'Name too long (max 200 chars)' });

    // Normalize mobile
    let cleanMobile = String(mobile).replace(/[^0-9+]/g, '');
    if (cleanMobile.startsWith('+')) cleanMobile = cleanMobile.substring(1);
    cleanMobile = withDefaultCountryCode(cleanMobile);

    // The tenant scaffold is not active yet and tenantId remains nullable.
    // SQLite treats NULL values as distinct inside a composite unique index,
    // so @@unique([tenantId, mobile]) cannot protect current single-workspace
    // rows from duplicates. Enforce the invariant explicitly until tenancy is
    // fully backfilled and request scoping is enabled.
    const existing = await prisma.lead.findFirst({
      where: { mobile: cleanMobile },
      select: { id: true },
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: "A lead with this mobile number already exists" });
    }

    const lead = await prisma.lead.create({
      data: {
        name, mobile: cleanMobile, company, email, product,
        country, quantity, tags, notes,
        source: 'manual', status: 'new',
      },
    });

    activityLog.add(EVENT_TYPES.LEAD_CREATED, `Manual lead: ${name}`, { leadId: lead.id });
    webhookDispatcher.dispatch('lead.created', { leadId: lead.id, name: lead.name, source: 'manual' }).catch(() => {});
    sheetsSync.dispatch('lead.created', lead).catch(() => {});
    res.json(lead);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A lead with this mobile number already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/leads/:id', requireRole('agent'), async (req, res) => {
  try {
    const updates = {};
    const allowed = [
      'name',
      'company',
      'email',
      'product',
      'country',
      'quantity',
      'status',
      'tags',
      'notes',
      'maxFollowups',
      'assignedAccount',
      'lastError',
      'lastErrorAt',
      'telegramPeer',
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.status && !VALID_LEAD_STATUSES.includes(updates.status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_LEAD_STATUSES.join(', ')}` });
    }
    const prev = await prisma.lead.findUnique({ where: { id: parseInt(req.params.id) }, select: { status: true } });
    const lead = await prisma.lead.update({
      where: { id: parseInt(req.params.id) },
      data: updates,
    });
    // Dispatch webhook if status changed
    if (updates.status && prev && updates.status !== prev.status) {
      webhookDispatcher.dispatch('lead.status_changed', {
        leadId: lead.id, name: lead.name, oldStatus: prev.status, newStatus: updates.status,
      }).catch(() => {});
    }
    res.json(lead);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Lead not found' });
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/leads/:id — delete lead and associated data
app.delete('/api/leads/:id', requireRole('manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid lead ID' });
    }
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Cascade delete in transaction
    await prisma.$transaction(async (tx) => {
      await tx.campaignLead.deleteMany({ where: { leadId: id } });
      await tx.message.deleteMany({ where: { leadId: id } });
      await tx.leadNote.deleteMany({ where: { leadId: id } });
      await tx.leadTask.deleteMany({ where: { leadId: id } });
      await tx.lead.delete({ where: { id } });
    });

    logger.info(`🗑️ Lead ${id} (${lead.name}) deleted by ${req.user?.email || 'unknown'}`);
    res.json({ success: true, deleted: id });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Lead not found' });
    res.status(500).json({ error: error.message });
  }
});

// POST /api/leads/:id/pause — toggle pause on a single lead
app.post('/api/leads/:id/pause', requireRole('manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const lead = await prisma.lead.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const newStatus = lead.status === 'paused' ? 'new' : 'paused';
    await prisma.lead.update({ where: { id }, data: { status: newStatus } });
    res.json({ id, status: newStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/leads/:id/status — override status on a single lead
app.post('/api/leads/:id/status', requireRole('manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!VALID_LEAD_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_LEAD_STATUSES.join(', ')}` });
    }
    const prev = await prisma.lead.findUnique({ where: { id }, select: { status: true, name: true } });
    if (!prev) return res.status(404).json({ error: 'Lead not found' });
    const lead = await prisma.lead.update({ where: { id }, data: { status } });
    if (status !== prev.status) {
      webhookDispatcher.dispatch('lead.status_changed', {
        leadId: id, name: prev.name, oldStatus: prev.status, newStatus: status,
      }).catch(() => {});
    }
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/leads/:id/timeline — merged activity timeline
app.get('/api/leads/:id/timeline', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        messages:  { orderBy: { createdAt: 'asc' }, select: { id: true, content: true, direction: true, status: true, createdAt: true, channel: true } },
        leadNotes: { orderBy: { createdAt: 'asc' }, select: { id: true, content: true, type: true, createdAt: true } },
        leadTasks: { orderBy: { createdAt: 'asc' }, select: { id: true, title: true, done: true, dueAt: true, createdAt: true } },
      },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const events = [];

    // Lead created
    events.push({ type: 'created', at: lead.createdAt, data: { source: lead.source } });

    // Messages
    lead.messages.forEach((m) => {
      events.push({
        type: 'message',
        at: m.createdAt,
        data: { direction: m.direction, content: m.content?.slice(0, 120), status: m.status, channel: m.channel || 'whatsapp' },
      });
    });

    // Notes
    lead.leadNotes.forEach((n) => {
      events.push({ type: 'note', at: n.createdAt, data: { content: n.content?.slice(0, 120), noteType: n.type } });
    });

    // Tasks
    lead.leadTasks.forEach((t) => {
      events.push({ type: 'task', at: t.createdAt, data: { title: t.title, done: t.done, dueAt: t.dueAt } });
    });

    // Sort all by time descending (most recent first)
    events.sort((a, b) => new Date(b.at) - new Date(a.at));

    res.json({ events, leadId: id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/leads/:id/assign — assign lead to a team member (or unassign with null)
app.post('/api/leads/:id/assign', requireRole('manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { userId } = req.body; // null to unassign
    if (userId !== null && userId !== undefined) {
      const user = await prisma.user.findUnique({ where: { id: parseInt(userId) }, select: { id: true, enabled: true } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (!user.enabled) return res.status(400).json({ error: 'Cannot assign to disabled user' });
    }
    const lead = await prisma.lead.update({
      where: { id },
      data: { assignedToId: userId ? parseInt(userId) : null },
    });
    res.json({ id, assignedToId: lead.assignedToId });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Lead not found' });
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users — list all enabled team members (for assignment dropdowns)
app.get('/api/users', requireRole('manager'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { enabled: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/leads/:id/check-wa', requireRole('agent'), async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const check = await whatsappManager.isNumberOnWhatsApp(lead.mobile);
    const isOnWA = check ? check.result : null;
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        isOnWhatsApp: isOnWA,
        ...(isOnWA === false ? { status: 'wa_unavailable' } : {}),
      },
    });

    res.json({ isOnWhatsApp: isOnWA });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leads/:id/rescore', requireRole('agent'), async (req, res) => {
  try {
    const score = await leadScorer.calculateScore(parseInt(req.params.id));
    const lead = await prisma.lead.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ score, engagementLevel: lead.engagementLevel, replySpeed: lead.replySpeed });
  } catch (error) {
    if (error.code === 'P2025' || error.message.includes('No Lead found')) return res.status(404).json({ error: 'Lead not found' });
    res.status(500).json({ error: error.message });
  }
});

// ======================== MESSAGES / CONVERSATIONS ========================

app.get('/api/leads/:id/messages', async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { leadId: parseInt(req.params.id) },
      orderBy: { createdAt: 'asc' },
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leads/:id/send', requireRole('agent'), async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { message, accountId } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    // accountId (optional): forces a specific sender — used by AI outreach so the
    // message is sent from the same round-robin account whose persona drafted it.
    const sendResult = await whatsappManager.sendMessage(
      lead.mobile,
      message,
      accountId || lead.assignedAccount || undefined
    );
    const sent = sendResult.success;

    const msg = await prisma.message.create({
      data: {
        leadId: lead.id,
        direction: 'outbound',
        channel: 'whatsapp',
        content: message,
        waAccount: sendResult.accountId || 0,
        status: sent
          ? 'sent'
          : sendResult.reason === 'not_on_whatsapp' ? 'permanently_failed' : 'failed',
        sentAt: sent ? new Date() : null,
      },
    });

    if (sent) {
      const handoffStatus = leadStateService.computeManualTakeoverStatus(lead.status);
      const cancelled = await prisma.message.updateMany({
        where: {
          leadId: lead.id,
          status: 'queued',
          direction: 'outbound',
        },
        data: { status: 'cancelled' },
      });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { lastMessageAt: new Date(), status: handoffStatus },
      });
      if (Array.isArray(sendResult.identifiers) && sendResult.identifiers.length > 0) {
        replyDetector.rememberLeadIdentity(
          lead.id,
          sendResult.accountId || lead.assignedAccount || 1,
          sendResult.identifiers
        );
      }
      activityLog.add(EVENT_TYPES.MESSAGE_SENT, `Manual message to ${lead.name}`, { leadId: lead.id });
      if (handoffStatus === LEAD_STATUS.PAUSED && lead.status !== LEAD_STATUS.PAUSED) {
        activityLog.add(
          EVENT_TYPES.LEAD_TAKEOVER,
          `Manual takeover: ${lead.name}`,
          { leadId: lead.id, cancelledQueued: cancelled.count }
        );
      }
    } else if (sendResult.reason === 'not_on_whatsapp') {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { isOnWhatsApp: false, status: 'wa_unavailable' },
      });
      activityLog.add(EVENT_TYPES.MESSAGE_FAILED, `Not on WhatsApp: ${lead.name}`, { leadId: lead.id });
    }

    res.json({ success: !!sent, reason: sendResult.reason, message: msg });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leads/:id/ai-reply', requireRole('agent'), (_req, res) => {
  res.status(410).json({
    error: 'Reply suggestions were removed along with the AI layer. Compose the reply manually, or send an approved WhatsApp template.',
  });
});

// POST /api/leads/:id/ai-outreach/draft
// Draft an AI outreach WhatsApp message and pick the next round-robin sender.
// getNextAccount({ forInitialOutreach: true }) rotates across enabled accounts,
// skips the client_relations number, and honors per-account daily caps + pool.
// This does NOT send — the operator previews, then POSTs the (possibly edited)
// { message, accountId } to /api/leads/:id/send.
app.post('/api/leads/:id/ai-outreach/draft', requireRole('agent'), async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.mobile) return res.status(400).json({ error: 'Lead has no mobile number to message' });

    const accountId = await whatsappManager.getNextAccount({ poolId: lead.poolId, forInitialOutreach: true });
    if (!accountId) {
      return res.status(409).json({
        error: 'No WhatsApp account available for outreach right now — all are disconnected, paused, or at their daily cap.',
      });
    }

    const accountProfile = await whatsappManager.getAccountProfile(accountId).catch(() => null);
    const parts = composer.composeInitialMessage(lead, accountProfile);
    const message = (Array.isArray(parts) ? parts.join('\n\n') : String(parts || '')).trim();
    if (!message) {
      return res.status(502).json({ error: 'Template draft came back empty — check templates/messages.js.' });
    }

    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { name: true, phone: true },
    });

    res.json({
      message,
      accountId,
      accountName: account?.name || `WhatsApp #${accountId}`,
      accountPhone: account?.phone || '',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/leads/:id/ai-outreach/draft-email
// Draft an outreach EMAIL (subject + HTML body) from the message templates,
// using the persona of the lead's verified sender account. Does NOT send — the operator
// previews, then POSTs { subject, body, htmlBody, accountId } to
// /api/leads/:id/email/send. Pairs with the WhatsApp draft above so one lead
// can be reached on both channels in a single action.
app.post('/api/leads/:id/ai-outreach/draft-email', requireRole('agent'), async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.email) return res.status(400).json({ error: 'Lead has no email address' });

    const account = await resolveEmailSenderAccount({
      leadId: lead.id,
      requestedAccountId: undefined,
      user: req.user,
    });
    if (!account) {
      return res.status(409).json({
        error: 'No verified email sender available for this lead. Add/verify an email account in Settings → Email.',
      });
    }

    const persona = await emailService.getPersonaProfileForEmail(account.id, lead).catch(() => null);
    const draft = composer.composeInitialEmail(lead, persona);
    const subject = (draft?.subject || '').trim();
    const htmlBody = (draft?.htmlBody || '').trim();
    const body = (draft?.body || '').trim();
    if (!subject && !htmlBody && !body) {
      return res.status(502).json({ error: 'Template email draft came back empty — check messageComposer.js.' });
    }

    res.json({
      subject,
      body,
      htmlBody,
      accountId: account.id,
      senderName: account.senderName || account.name || 'Email',
      senderEmail: account.email || '',
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// ======================== CSV IMPORT / EXPORT ========================

app.post('/api/import/csv', requireRole('manager'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });

    const csvText = req.file.buffer.toString('utf-8');
    const poolId = req.body.poolId ? parseInt(req.body.poolId) : null;
    if (!poolId) return res.status(400).json({ error: 'poolId is required for CSV import — choose a lead pool to import into.' });
    if (!(await userCanAccessPool(req, poolId))) {
      return res.status(403).json({ error: 'You do not have access to this lead pool.' });
    }
    const result = await csvImporter.importCSV(csvText, req.file.originalname, { poolId });

    if (result.success) {
      activityLog.add(EVENT_TYPES.IMPORT_COMPLETED,
        `CSV import: ${result.imported} leads from ${req.file.originalname}`,
        result
      );
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== BULK LEAD ACTIONS ========================
// POST /api/leads/bulk  { ids: number[], action: string, payload?: object }
// actions: tag, untag, status, pause, resume, assign_wa, assign_email, export

// Bulk import of structured leads, for callers that already hold the data —
// the MCP server above all. Same importer as the CSV path, so dedupe by
// normalised mobile, field backfill on existing leads and ImportBatch tracking
// all behave identically. Deliberately does NOT queue outreach: an import is
// filing, and messaging thousands of people should be a campaign you start on
// purpose.
app.post('/api/leads/import-json', requireRole('manager'), async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.leads) ? req.body.leads : null;
    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'Provide `leads` as a non-empty array' });
    }
    if (rows.length > 20000) {
      return res.status(400).json({ error: 'Too many rows in one call (max 20000)' });
    }
    const tags = Array.isArray(req.body?.tags)
      ? req.body.tags.map((t) => String(t).trim()).filter(Boolean)
      : [];
    const label = String(req.body?.label || 'api-import').slice(0, 120);

    const result = await csvImporter.importRows(rows, label, { tags });
    if (result.success) {
      activityLog.add(EVENT_TYPES.IMPORT_COMPLETED,
        `API import: ${result.imported} leads (${label})`, result);
    }
    return res.status(result.success ? 200 : 400).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});


app.post('/api/leads/bulk', requireRole('manager'), async (req, res) => {
  try {
    const { ids, action, payload = {} } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    if (!action) return res.status(400).json({ error: 'action is required' });

    const intIds = ids.map(Number).filter((n) => !isNaN(n));

    switch (action) {
      case 'tag': {
        if (!payload.tag) return res.status(400).json({ error: 'payload.tag required' });
        // Fetch all at once, update only those missing the tag
        const leads = await prisma.lead.findMany({ where: { id: { in: intIds } }, select: { id: true, tags: true } });
        const toUpdate = leads
          .map((lead) => {
            const existing = lead.tags ? lead.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
            if (existing.includes(payload.tag)) return null;
            return { id: lead.id, tags: [...existing, payload.tag].join(', ') };
          })
          .filter(Boolean);
        await prisma.$transaction(
          toUpdate.map(({ id, tags }) => prisma.lead.update({ where: { id }, data: { tags } }))
        );
        return res.json({ updated: toUpdate.length, action });
      }

      case 'untag': {
        if (!payload.tag) return res.status(400).json({ error: 'payload.tag required' });
        const leads = await prisma.lead.findMany({ where: { id: { in: intIds } }, select: { id: true, tags: true } });
        const toUpdate = leads
          .map((lead) => {
            const existing = lead.tags ? lead.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
            const newTags = existing.filter((t) => t !== payload.tag).join(', ');
            if (newTags === (lead.tags || '')) return null; // no change
            return { id: lead.id, tags: newTags };
          })
          .filter(Boolean);
        await prisma.$transaction(
          toUpdate.map(({ id, tags }) => prisma.lead.update({ where: { id }, data: { tags } }))
        );
        return res.json({ updated: toUpdate.length, action });
      }

      case 'status': {
        const allowed = ['new', 'contacted', 'replied', 'engaged', 'closed', 'paused', 'wa_unavailable'];
        if (!allowed.includes(payload.status)) {
          return res.status(400).json({ error: `payload.status must be one of: ${allowed.join(', ')}` });
        }
        await prisma.lead.updateMany({ where: { id: { in: intIds } }, data: { status: payload.status } });
        return res.json({ updated: intIds.length, action });
      }

      case 'pause': {
        await prisma.lead.updateMany({ where: { id: { in: intIds } }, data: { status: 'paused' } });
        return res.json({ updated: intIds.length, action });
      }

      case 'resume': {
        // Only resume leads that are currently paused
        const result = await prisma.lead.updateMany({
          where: { id: { in: intIds }, status: 'paused' },
          data: { status: 'new' },
        });
        return res.json({ updated: result.count, action });
      }

      case 'assign_wa': {
        if (payload.accountId === undefined) return res.status(400).json({ error: 'payload.accountId required' });
        await prisma.lead.updateMany({ where: { id: { in: intIds } }, data: { assignedAccount: Number(payload.accountId) } });
        return res.json({ updated: intIds.length, action });
      }

      case 'assign_email': {
        if (payload.accountId === undefined) return res.status(400).json({ error: 'payload.accountId required' });
        await prisma.lead.updateMany({ where: { id: { in: intIds } }, data: { assignedEmailAccountId: payload.accountId ? Number(payload.accountId) : null } });
        return res.json({ updated: intIds.length, action });
      }

      case 'delete': {
        // Delete leads and all associated data in a transaction
        await prisma.$transaction(async (tx) => {
          await tx.message.deleteMany({ where: { leadId: { in: intIds } } });
          await tx.leadNote.deleteMany({ where: { leadId: { in: intIds } } });
          await tx.leadTask.deleteMany({ where: { leadId: { in: intIds } } });
          await tx.campaignLead.deleteMany({ where: { leadId: { in: intIds } } });
          await tx.lead.deleteMany({ where: { id: { in: intIds } } });
        });
        return res.json({ deleted: intIds.length, action });
      }

      case 'export': {
        const leads = await prisma.lead.findMany({ where: { id: { in: intIds } } });
        const headers = ['id', 'name', 'company', 'mobile', 'email', 'country', 'product', 'quantity', 'status', 'score', 'leadTier', 'source', 'tags', 'notes', 'createdAt'];
        const rows = leads.map((l) =>
          headers.map((h) => {
            const v = l[h] == null ? '' : String(l[h]);
            return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
          }).join(',')
        );
        const csv = [headers.join(','), ...rows].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="leads-export.csv"');
        return res.send(csv);
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/import/batches', async (req, res) => {
  try {
    const batches = await csvImporter.getBatches();
    res.json(batches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/export/csv', requireRole('manager'), async (req, res) => {
  try {
    const csvString = await csvExporter.exportLeads(req.query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads-export.csv');
    res.send(csvString);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== CAMPAIGNS ========================

app.get('/api/campaigns', requireRole('manager'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const status = req.query.status;
    const search = req.query.search;

    const where = {};
    if (status) where.status = status;
    if (search) where.name = { contains: search };

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.campaign.count({ where }),
    ]);
    res.json({ campaigns, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/campaigns', requireRole('manager'), async (req, res) => {
  try {
    const { name, description, messageTemplate, targetFilter, channel, emailSubject, senderAccountId, variantBTemplate, variantBSubject, poolId, waCampaignName } = req.body;
    if (!name || !messageTemplate) {
      return res.status(400).json({ error: 'Name and message template are required' });
    }
    if (channel && !VALID_CHANNELS.includes(channel)) {
      return res.status(400).json({ error: `Invalid channel. Must be one of: ${VALID_CHANNELS.join(', ')}` });
    }
    if (name.length > 200) return res.status(400).json({ error: 'Campaign name too long (max 200 chars)' });
    if ((channel === 'email' || channel === 'both') && !emailSubject) {
      return res.status(400).json({ error: 'Email subject is required for email/both campaigns' });
    }

    // Pool resolution: explicit poolId from the request (must be one the
    // user has access to) or fall back. Pool scoping is what stops a
    // partner-team manager from spinning up a campaign that quietly targets
    // team-pool leads.
    let resolvedPoolId = poolId ? parseInt(poolId) : null;
    if (resolvedPoolId && !(await userCanAccessPool(req, resolvedPoolId))) {
      return res.status(403).json({ error: 'You do not have access to this lead pool.' });
    }
    if (!resolvedPoolId) {
      const accessible = await getAccessiblePoolIds(req);
      // Platform admin (null) or no pools seeded yet: fall back to the
      // default pool if one exists, otherwise allow null poolId so initial
      // setup before pool seeding doesn't break.
      if (accessible === null || accessible.length !== 1) {
        const def = await prisma.leadPool.findFirst({ where: { isDefault: true }, select: { id: true } });
        resolvedPoolId = def?.id ?? null;
        if (!resolvedPoolId && accessible !== null && accessible.length > 1) {
          return res.status(400).json({ error: 'poolId is required when you have access to multiple lead pools.' });
        }
      } else {
        resolvedPoolId = accessible[0];
      }
    }

    const campaign = await campaignEngine.createCampaign({
      name, description, messageTemplate, targetFilter, channel, emailSubject, senderAccountId,
      waCampaignName: waCampaignName ? String(waCampaignName).trim() : null,
      variantBTemplate: variantBTemplate || null,
      variantBSubject: variantBSubject || null,
      poolId: resolvedPoolId,
    });
    activityLog.add(EVENT_TYPES.CAMPAIGN_STARTED, `Campaign "${name}" (${channel || 'whatsapp'}) created`);
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/campaigns/:id', requireRole('manager'), async (req, res) => {
  try {
    const campaign = await campaignEngine.getCampaign(parseInt(req.params.id));
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/campaigns/:id/populate', requireRole('manager'), async (req, res) => {
  try {
    const result = await campaignEngine.populateCampaign(parseInt(req.params.id));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/campaigns/:id/start', requireRole('manager'), async (req, res) => {
  try {
    const result = await campaignEngine.startCampaign(parseInt(req.params.id));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/campaigns/:id/pause', requireRole('manager'), async (req, res) => {
  try {
    await campaignEngine.pauseCampaign(parseInt(req.params.id));
    res.json({ status: 'paused' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/campaigns/:id — edit campaign (draft only)
app.patch('/api/campaigns/:id', requireRole('manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status !== 'draft') return res.status(400).json({ error: 'Can only edit draft campaigns' });

    const allowed = ['name', 'description', 'messageTemplate', 'emailSubject', 'channel', 'targetFilter', 'senderAccountId', 'variantBTemplate', 'variantBSubject', 'waCampaignName'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.targetFilter && typeof updates.targetFilter === 'object') {
      updates.targetFilter = JSON.stringify(updates.targetFilter);
    }

    const updated = await prisma.campaign.update({ where: { id }, data: updates });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/campaigns/:id — delete campaign (draft or completed only)
app.delete('/api/campaigns/:id', requireRole('manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status === 'running') return res.status(400).json({ error: 'Cannot delete a running campaign. Pause it first.' });

    await prisma.$transaction([
      prisma.campaignLead.deleteMany({ where: { campaignId: id } }),
      prisma.campaign.delete({ where: { id } }),
    ]);

    logger.info(`🗑️ Campaign ${id} (${campaign.name}) deleted by ${req.user?.email || 'unknown'}`);
    res.json({ success: true, deleted: id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/campaigns/:id/leads', requireRole('manager'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const status = req.query.status;
    const where = { campaignId: parseInt(req.params.id) };
    if (status) where.status = status;

    const [campaignLeads, total] = await Promise.all([
      prisma.campaignLead.findMany({
        where,
        include: { lead: { select: { name: true, mobile: true, status: true, score: true } } },
        orderBy: { sentAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.campaignLead.count({ where }),
    ]);
    res.json({ leads: campaignLeads, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/campaigns/preview-leads', requireRole('manager'), async (req, res) => {
  try {
    // Preview must be pool-scoped or it would lie about reach. Use explicit
    // poolId when supplied (membership already checked by requirePoolAccess
    // when the caller passes one in the body), else any single pool the user
    // has access to.
    let previewPoolId = req.body.poolId ? parseInt(req.body.poolId) : null;
    if (previewPoolId && !(await userCanAccessPool(req, previewPoolId))) {
      return res.status(403).json({ error: 'You do not have access to this lead pool.' });
    }
    if (!previewPoolId) {
      const accessible = await getAccessiblePoolIds(req);
      previewPoolId = accessible.length === 1 ? accessible[0] : null;
    }
    const leads = await campaignEngine.getMatchingLeads(req.body.filter || {}, previewPoolId);
    res.json({ count: leads.length, sample: leads.slice(0, 10), poolId: previewPoolId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== SYSTEM CONTROLS ========================

app.get('/api/whatsapp/status', async (req, res) => {
  try {
    const status = await whatsappManager.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


  // ── WhatsApp Account CRUD ──

  app.get('/api/whatsapp/accounts', async (req, res) => {
    try {
      const tzOffset = parseTimezoneOffset(req.query.tzOffset);
      const { start: startOfDayUTC, end: endOfDayUTC } =
      getLocalDayRangeUTC(tzOffset);

      const [accounts, sentTodayRows] = await Promise.all([
        prisma.whatsAppAccount.findMany({ orderBy: { id: 'asc' } }),
        prisma.message.groupBy({
          by: ['waAccount'],
          where: {
            channel: 'whatsapp',
            direction: 'outbound',
            status: { in: DELIVERED_MESSAGE_STATUSES },
            sentAt: { gte: startOfDayUTC, lt: endOfDayUTC },
            waAccount: { gt: 0 },
          },
          _count: { id: true },
        }),
      ]);

      const sentTodayByAccount = new Map(sentTodayRows.map((row) => [row.waAccount, row._count.id]));

      // Merge the live client readiness so the cards reflect REAL connection
      // state, not the persisted DB status (which goes stale after a restart —
      // an account that didn't reconnect keeps its old 'connected' value).
      // Without this the Settings cards said "connected" while the health banner
      // (isReady-based) correctly said "disconnected".
      let liveById = new Map();
      try {
        const live = await whatsappManager.getStatus();
        liveById = new Map(live.map((s) => [s.id, s]));
      } catch (_) { /* fall back to DB status */ }

      res.json(accounts.map((account) => {
        const live = liveById.get(account.id);
        const isReady = live ? !!live.isReady : undefined;
        let status = account.status;
        // Correct the dangerous "looks connected but isn't" case. Keep specific
        // transient states (qr_pending / qr_expired / connecting) as-is.
        if (isReady === true) {
          status = 'connected';
        } else if (isReady === false && account.enabled && status === 'connected') {
          status = 'disconnected';
        }
        const {
          aisensyApiKey,
          aisensyCampaignApiKey,
          cloudApiToken,
          ...safeAccount
        } = account;
        return {
          ...safeAccount,
          ...publicCredentialSummary(account),
          status,
          isReady: isReady ?? null,
          messagesSentToday: sentTodayByAccount.get(account.id) || 0,
        };
      }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/whatsapp/accounts', requireRole('admin'), async (req, res) => {
    try {
      const account = await whatsappManager.addAccount(req.body);
      res.json({ success: true, account });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/whatsapp/accounts/:id/enable', requireRole('admin'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid account id' });
      const result = await whatsappManager.enableAccount(id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/whatsapp/accounts/:id/disable', requireRole('admin'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid account id' });
      const result = await whatsappManager.disableAccount(id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/whatsapp/accounts/:id', requireRole('admin'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid account id' });
      const account = await whatsappManager.updateAccount(id, req.body);
      if (!account) return res.status(400).json({ error: 'No valid fields to update' });
      res.json({ success: true, account });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/whatsapp/accounts/:id/profile', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid account id' });
      const profile = await whatsappManager.getAccountProfile(id);
      if (!profile) return res.status(404).json({ error: 'Account not found' });
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/whatsapp/accounts/:id', requireRole('admin'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid account id' });
      await whatsappManager.disableAccount(id);
      await prisma.whatsAppAccount.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── WhatsApp Admin Operations ──

  app.post('/api/whatsapp/reset-counters', requireRole('admin'), async (req, res) => {
    try {
      await prisma.whatsAppAccount.updateMany({
        data: { messagesSentToday: 0, lastResetAt: new Date() }
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Message Admin Operations ──

  app.post('/api/messages/cancel-all', requireRole('manager'), async (req, res) => {
    try {
      const result = await prisma.message.updateMany({
        where: { status: 'queued', direction: 'outbound' },
        data: { status: 'cancelled' }
      });
      res.json({ success: true, count: result.count });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Dead Letter Queue: visibility into permanently-failed messages ──
  // Without this surface, send failures (bad SMTP creds, banned WA number,
  // unreachable lead phones) accumulate silently. The dashboard polls this
  // to show a "Failed messages" badge and admins can manually requeue.
  app.get('/api/messages/failed', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const channel = req.query.channel;
      const poolId = req.query.poolId ? parseInt(req.query.poolId) : null;
      const where = { status: 'permanently_failed', direction: 'outbound' };
      if (['whatsapp', 'email', 'imessage'].includes(channel)) where.channel = channel;
      // Pool scoping: explicit poolId already verified by middleware. Without
      // one, restrict to leads in pools the user has membership for. Platform
      // admins skip the filter entirely.
      if (poolId) {
        where.lead = { poolId };
      } else {
        const accessiblePools = await getAccessiblePoolIds(req);
        if (accessiblePools !== null) where.lead = { poolId: { in: accessiblePools } };
      }

      const [items, total] = await Promise.all([
        prisma.message.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          take: limit,
          select: {
            id: true,
            leadId: true,
            channel: true,
            content: true,
            retryCount: true,
            maxRetries: true,
            createdAt: true,
            updatedAt: true,
            scheduledAt: true,
            emailSubject: true,
            waAccount: true,
            emailAccountId: true,
            campaignId: true,
            lead: {
              select: { id: true, name: true, mobile: true, email: true, poolId: true, lastError: true, lastErrorAt: true },
            },
          },
        }),
        prisma.message.count({ where }),
      ]);
      res.json({ items, total });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/messages/:id/requeue', requireRole('manager'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const msg = await prisma.message.findUnique({ where: { id } });
      if (!msg) return res.status(404).json({ error: 'Message not found' });
      if (msg.status !== 'permanently_failed') {
        return res.status(409).json({ error: `Cannot requeue message in status '${msg.status}'` });
      }
      await prisma.message.update({
        where: { id },
        data: {
          status: 'queued',
          retryCount: 0,
          scheduledAt: new Date(Date.now() + 60 * 1000),
        },
      });
      logger.info(`↩️  Message ${id} manually requeued by ${req.user?.email || 'unknown'}`);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Analytics: 7-Day Daily Breakdown ──

  app.get('/api/analytics/daily', async (req, res) => {
    try {
      const days = Math.min(
      90,
      Math.max(1, Number.parseInt(req.query.days, 10) || 7),
    );
    const tzOffset = parseTimezoneOffset(req.query.tzOffset);
    const { start: todayStart } = getLocalDayRangeUTC(tzOffset);
    const accessiblePools = await getAccessiblePoolIds(req);
      const poolFilter = req.query.poolId
      ? { poolId: Number.parseInt(req.query.poolId, 10) }
      : accessiblePools === null
        ? {}
        : { poolId: { in: accessiblePools } };
    const result = [];

      for (let i = days - 1; i >= 0; i--) {
        const dayStart = new Date(todayStart.getTime() - i * 24 * 60 * 60_000);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60000);
        const label = new Date(
        dayStart.getTime() - tzOffset * 60000).toLocaleDateString('en-GB', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        });

        const [leadsCreated, msgsSent, replies] = await Promise.all([
          prisma.lead.count({ where: { ...poolFilter, ...buildNewLeadDateWhere(dayStart, dayEnd) } }),
          prisma.message.count({
            where: {
              direction: 'outbound',
              status: { in: DELIVERED_MESSAGE_STATUSES },
              sentAt: { gte: dayStart, lt: dayEnd },
            lead: poolFilter,
          },
          }),
          prisma.message.count({ where: { direction: 'inbound',
            ...buildMessageEventDateWhere(dayStart, dayEnd),
            lead: poolFilter,
          } }),
        ]);

        result.push({ label, leadsCreated, msgsSent, replies });
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

app.get('/api/config', requireRole('manager'), async (req, res) => {
  try {
    const configs = await prisma.systemConfig.findMany();
    const configMap = Object.fromEntries(configs.map((c) => [c.key, c.value]));

    res.json({
      ...configMap,
      businessHoursStart: config.businessHours.start,
      businessHoursEnd: config.businessHours.end,
      waMaxMessages: config.whatsapp.maxMessagesPerDay,
      waWarmupMode: config.whatsapp.warmupMode,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

import businessProfile from './businessProfile.js';
app.get('/api/config/brand', (req, res) => {
  res.json({
    brandName: businessProfile.dashboardBrand,
    tagline: businessProfile.dashboardTagline,
    businessName: businessProfile.businessName,
    businessCity: businessProfile.businessCity,
    businessCountry: businessProfile.businessCountry,
    businessIndustry: businessProfile.businessIndustry,
    businessCertifications: businessProfile.businessCertifications,
    personaName: businessProfile.personaName,
    personaGender: businessProfile.personaGender,
    personaTitle: businessProfile.personaTitle,
    timezone: businessProfile.timezone,
    // Home currency: what supplier costs, bank credits and profit are in.
    currency: process.env.BUSINESS_CURRENCY || 'USD',
  });
});

// POST /api/config/env — kept for the Workspace settings form. It used to
// rewrite .env and `pm2 reload`, which silently did nothing in Docker (no
// PM2, and the container never re-reads .env). Values now go through the
// workspace profile: stored in the database and applied immediately.
app.post('/api/config/env', requireRole('admin'), async (req, res) => {
  try {
    const profile = await saveWorkspaceProfile(req.body || {});
    res.json({ success: true, message: 'Saved.', profile });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, fields: error.fields });
  }
});

// ======================== WORKSPACE & ONBOARDING ========================

app.get('/api/workspace/profile', requireRole('manager'), (_req, res) => {
  res.json(getWorkspaceProfile());
});

app.put('/api/workspace/profile', requireRole('admin'), async (req, res) => {
  try {
    res.json(await saveWorkspaceProfile(req.body || {}));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, fields: error.fields });
  }
});

// What a new workspace still has to do. Drives the setup wizard and the
// "finish setting up" checklist on the overview.
app.get('/api/onboarding/status', requireRole('manager'), async (_req, res) => {
  try {
    const profile = getWorkspaceProfile();
    const [whatsappAccounts, emailAccounts, telegramAccounts, imessageAccounts, leadSources, leads, users, dismissed, sheetsRow, subscriptions] = await Promise.all([
      prisma.whatsAppAccount.findMany({
        where: { enabled: true },
        select: { provider: true, cloudApiPhoneId: true, cloudApiToken: true, aisensyProjectId: true, aisensyApiKey: true, aisensyCampaignApiKey: true },
      }),
      prisma.emailAccount.count({ where: { enabled: true } }),
      prisma.telegramAccount.count({ where: { enabled: true, status: 'connected' } }),
      prisma.iMessageAccount.count({ where: { enabled: true } }),
      prisma.webhookSource.count({ where: { enabled: true } }),
      prisma.lead.count(),
      prisma.user.count({ where: { enabled: true } }),
      isOnboardingDismissed(),
      prisma.systemConfig.findUnique({ where: { key: 'sheets.enabled' } }),
      prisma.webhookSubscription.count(),
    ]);
    const channels = {
      whatsapp: whatsappAccounts.some((account) => credentialState(account).ready),
      email: emailAccounts > 0,
      telegram: telegramAccounts > 0,
      imessage: imessageAccounts > 0,
    };
    const steps = {
      profile: Boolean(profile.BUSINESS_NAME),
      channel: Object.values(channels).some(Boolean),
      leadSource: leadSources > 0 || leads > 0,
      team: users > 1,
    };
    res.json({
      dismissed,
      complete: steps.profile && steps.channel && steps.leadSource,
      steps,
      channels,
      counts: { leadSources, leads, users, outgoingWebhooks: subscriptions },
      integrations: {
        googleSheets: sheetsRow?.value === 'true',
        outgoingWebhooks: subscriptions > 0,
        mcp: Boolean(process.env.MCP_SERVICE_TOKEN),
      },
      profile: {
        BUSINESS_NAME: profile.BUSINESS_NAME,
        BUSINESS_TIMEZONE: profile.BUSINESS_TIMEZONE,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/onboarding/dismiss', requireRole('admin'), async (req, res) => {
  try {
    await setOnboardingDismissed(req.body?.dismissed !== false);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/config', requireRole('admin'), async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await prisma.systemConfig.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== REPORTING API ========================

app.get('/api/reports/status', requireRole('admin'), async (req, res) => {
  try {
    const status = await reportingService.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reports/send', requireRole('admin'), async (req, res) => {
  try {
    const { type = 'weekly', force = false, recipient } = req.body || {};
    const result = await reportingService.sendReport({
      type,
      force: Boolean(force),
      recipientOverride: recipient || null,
    });
    res.json(result);
  } catch (error) {
    res.status(422).json({ error: error.message });
  }
});

// ==================== INBOX API ====================

app.get('/api/inbox/channel-health', requireRole('agent'), async (_req, res) => {
  try {
    const [whatsappAccounts, imessageAccounts, emailAccounts, telegramAccounts] = await Promise.all([
      prisma.whatsAppAccount.findMany({
        where: { enabled: true },
        select: {
          id: true,
          status: true,
          provider: true,
          cloudApiPhoneId: true,
          cloudApiToken: true,
          aisensyProjectId: true,
          aisensyApiKey: true,
          aisensyCampaignApiKey: true,
        },
      }),
      prisma.iMessageAccount.findMany({
        where: { enabled: true },
        select: { id: true, status: true },
      }),
      prisma.emailAccount.findMany({
        where: { enabled: true },
        select: { id: true, status: true, provider: true, imapHost: true },
      }),
      prisma.telegramAccount.findMany({
        where: { enabled: true },
        select: { id: true, status: true },
      }),
    ]);

    const whatsappStates = whatsappAccounts.map((account) => credentialState(account));
    const campaignReady = whatsappStates.filter((state) => state.templates).length;
    const projectReady = whatsappStates.filter((state) => state.session).length;
    const imessageOnline = imessageAccounts.filter((account) => account.status === 'online').length;
    const emailVerified = emailAccounts.filter((account) => account.status === 'verified').length;
    const emailInbound = emailAccounts.filter((account) => Boolean(account.imapHost)).length;
    const telegramConnected = telegramAccounts.filter((account) => account.status === 'connected').length;
    const publicWebhookConfigured = Boolean(process.env.PUBLIC_URL || process.env.APP_PUBLIC_URL);

    res.json({
      whatsapp: {
        status: campaignReady > 0 ? projectReady > 0 ? 'ready' : 'limited'
              : 'offline',
        total: whatsappAccounts.length,
        campaignReady,
        projectReady,
        detail: campaignReady > 0
          ? projectReady > 0
            ? 'Outreach and session replies ready'
            : 'Approved outreach ready · session replies need AiSensy Project API credentials'
          : 'Connect a WhatsApp number in Settings → WhatsApp',
      },
      imessage: {
        status: imessageOnline > 0 ? 'ready' : 'offline',
        total: imessageAccounts.length,
        online: imessageOnline,
        detail: imessageOnline > 0 ? 'BlueBubbles online' : 'BlueBubbles server offline',
      },
      email: {
        status: emailVerified > 0 ? emailInbound > 0 ? 'ready' : 'limited'
              : 'offline',
        total: emailAccounts.length,
        verified: emailVerified,
        inbound: emailInbound,
        detail: emailVerified > 0
          ? emailInbound > 0
            ? `${emailVerified} sender(s) and reply sync ready`
            : `${emailVerified} sender(s) ready · replies are send-only`
          : 'No verified email sender',
      },
      telegram: {
        status: telegramConnected > 0 ? 'ready' : 'offline',
        total: telegramAccounts.length,
        connected: telegramConnected,
        detail: telegramConnected > 0
          ? `${telegramConnected} account(s) ready for manual messages`
          : 'No connected Telegram account',
      },
      inbound: {
        publicWebhookConfigured,
        detail: publicWebhookConfigured
          ? 'Public webhook origin configured'
          : 'WhatsApp inbound needs a stable public HTTPS tunnel',
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/inbox/threads', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = String(req.query.query || req.query.search || '').trim();
    const channel = ['whatsapp', 'email', 'imessage', 'telegram'].includes(String(req.query.channel || ''))
      ? String(req.query.channel)
      : null;
    const state = String(req.query.state || '').trim().toLowerCase();
    const leadId = parsePositiveInt(req.query.leadId);
    const assignedToMe = req.query.assignedToMe === 'true';
    const assigned =
      req.query.assigned === 'true'
        ? true
        : req.query.assigned === 'false'
          ? false
          : null;

    const poolId = parsePositiveInt(req.query.poolId);

    const visibleMessageWhere = {
      status: { notIn: INBOX_HIDDEN_MESSAGE_STATUSES },
      ...(channel ? { channel } : {}),
    };
    const where = { messages: { some: visibleMessageWhere } };
    if (poolId) {
      where.poolId = poolId;
    } else {
      const accessiblePools = await getAccessiblePoolIds(req);
      if (accessiblePools !== null) where.poolId = { in: accessiblePools };
    }
    if (leadId) where.id = leadId;
    if (assignedToMe && req.user?.sub) {
      where.assignedToId = Number(req.user.sub);
    } else if (assigned === true) {
      where.assignedToId = { not: null };
    } else if (assigned === false) {
      where.assignedToId = null;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { company: { contains: search } },
        { mobile: { contains: search } },
        { email: { contains: search } },
        {
          messages: {
            some: {
              status: { notIn: INBOX_HIDDEN_MESSAGE_STATUSES },
              OR: [
                { content: { contains: search } },
                { emailSubject: { contains: search } },
              ],
            },
          },
        },
      ];
    }

    const [leads, total, emailAccounts, telegramSenderAccounts] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          messages: {
            where: visibleMessageWhere,
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              messages: { where: { status: { notIn: INBOX_HIDDEN_MESSAGE_STATUSES } } },
            },
          },
        },
      }),
      prisma.lead.count({ where }),
      prisma.emailAccount.findMany({
        where: { enabled: true },
        orderBy: { id: 'asc' },
      }),
      prisma.telegramAccount.findMany({
        where: { enabled: true },
        select: { id: true, name: true, displayName: true },
        orderBy: { id: 'asc' },
      }),
    ]);

    const emailAccountsById = Object.fromEntries(emailAccounts.map((account) => [account.id, account]));
    const telegramAccountsById = Object.fromEntries(telegramSenderAccounts.map((account) => [account.id, account]));
    let threads = leads.map((lead) => buildInboxThreadSummary(lead, emailAccountsById, telegramAccountsById));

    if (state && state !== 'all') {
      threads = threads.filter((thread) => {
        if (state === 'needs_reply') return thread.replyNeeded;
        if (state === 'assigned') return thread.assignmentState === 'assigned';
        if (state === 'unassigned') return thread.assignmentState === 'unassigned';
        if (state === 'resolved') return thread.threadState === 'resolved';
        if (state === 'open') return thread.threadState !== 'resolved';
        return true;
      });
    }

    res.json({
      threads,
      total: state && state !== 'all' ? threads.length : total,
      page,
      pages: state && state !== 'all' ? 1 : Math.ceil(total / limit),
      unread: threads.filter((thread) => thread.unread).length,
      needsReply: threads.filter((thread) => thread.replyNeeded).length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function sendInboxThreadDetail(req, res) {
  try {
    const leadId = parseInt(req.params.leadId);
    if (!leadId) return res.status(400).json({ error: 'Valid lead ID required' });

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        messages: {
          where: { status: { notIn: INBOX_HIDDEN_MESSAGE_STATUSES } },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            messages: { where: { status: { notIn: INBOX_HIDDEN_MESSAGE_STATUSES } } },
          },
        },
      },
    });

    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const [emailAccounts, availableSenderAccounts, telegramSenderAccounts] = await Promise.all([
      prisma.emailAccount.findMany({
        where: {
          id: {
            in: [
              ...new Set([
                ...lead.messages.map((message) => message.emailAccountId).filter(Boolean),
                lead.assignedEmailAccountId || null,
              ].filter(Boolean)),
            ],
          },
        },
      }),
      getPermittedEmailSenderAccounts({ leadId, user: req.user }),
      prisma.telegramAccount.findMany({
        where: { id: { in: [...new Set(lead.messages.map((message) => message.telegramAccountId).filter(Boolean))] } },
        select: { id: true, name: true, displayName: true },
      }),
    ]);

    const emailAccountsById = Object.fromEntries(emailAccounts.map((account) => [account.id, account]));
    const telegramAccountsById = Object.fromEntries(telegramSenderAccounts.map((account) => [account.id, account]));
    const mappedMessages = lead.messages.map((message) => buildInboxMessage(message, emailAccountsById, telegramAccountsById));
    const lastMessage = lead.messages[lead.messages.length - 1] || null;
    const summary = buildInboxThreadSummary({
      ...lead,
      messages: lastMessage ? [lastMessage] : [],
    }, emailAccountsById, telegramAccountsById);

    res.json({
      ...summary,
      messages: mappedMessages,
      senderAccount: lead.assignedEmailAccountId ? sanitizeSenderAccount(emailAccountsById[lead.assignedEmailAccountId]) : null,
      sender: lead.assignedEmailAccountId ? sanitizeSenderAccount(emailAccountsById[lead.assignedEmailAccountId]) : null,
      availableSenderAccounts: availableSenderAccounts.map(sanitizeSenderAccount),
      threadStatus: summary.threadState === 'resolved' ? 'resolved' : summary.replyNeeded ? 'waiting' : 'open',
      assignedUserId: lead.assignedToId || null,
      assignedUserName: null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

app.get('/api/inbox/thread/:leadId', sendInboxThreadDetail);
app.get('/api/inbox/threads/:leadId', sendInboxThreadDetail);
app.get('/api/inbox/threads/:leadId/messages', async (req, res) => {
  try {
    const leadId = parsePositiveInt(req.params.leadId);
    if (!leadId) return res.status(400).json({ error: 'Valid lead ID required' });
    const messages = await prisma.message.findMany({
      where: {
        leadId,
        status: { notIn: INBOX_HIDDEN_MESSAGE_STATUSES },
      },
      orderBy: { createdAt: 'asc' },
    });
    const [emailAccounts, telegramSenderAccounts] = await Promise.all([
      prisma.emailAccount.findMany({
        where: { id: { in: [...new Set(messages.map((message) => message.emailAccountId).filter(Boolean))] } },
      }),
      prisma.telegramAccount.findMany({
        where: { id: { in: [...new Set(messages.map((message) => message.telegramAccountId).filter(Boolean))] } },
        select: { id: true, name: true, displayName: true },
      }),
    ]);
    const emailAccountsById = Object.fromEntries(emailAccounts.map((account) => [account.id, account]));
    const telegramAccountsById = Object.fromEntries(telegramSenderAccounts.map((account) => [account.id, account]));
    res.json(messages.map((message) => buildInboxMessage(message, emailAccountsById, telegramAccountsById)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INBOX THREAD-STATE OPERATIONS ====================

// POST /api/inbox/threads/:leadId/resolve — mark thread as resolved (sets lead status to closed)
app.post('/api/inbox/threads/:leadId/resolve', requireRole('agent'), async (req, res) => {
  try {
    const leadId = parseInt(req.params.leadId);
    if (!leadId) return res.status(400).json({ error: 'Valid lead ID required' });

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.status === 'closed') return res.json({ id: leadId, status: 'closed', threadState: 'resolved', message: 'Already resolved' });

    await prisma.lead.update({ where: { id: leadId }, data: { status: 'closed' } });
    webhookDispatcher.dispatch('lead.status_changed', {
      leadId, name: lead.name, oldStatus: lead.status, newStatus: 'closed',
    }).catch(() => {});

    res.json({ id: leadId, status: 'closed', threadState: 'resolved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/inbox/threads/:leadId/reopen — reopen a resolved thread (sets lead status to engaged)
app.post('/api/inbox/threads/:leadId/reopen', requireRole('agent'), async (req, res) => {
  try {
    const leadId = parseInt(req.params.leadId);
    if (!leadId) return res.status(400).json({ error: 'Valid lead ID required' });

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.status !== 'closed') return res.json({ id: leadId, status: lead.status, message: 'Thread is not resolved' });

    await prisma.lead.update({ where: { id: leadId }, data: { status: 'engaged' } });
    webhookDispatcher.dispatch('lead.status_changed', {
      leadId, name: lead.name, oldStatus: 'closed', newStatus: 'engaged',
    }).catch(() => {});

    res.json({ id: leadId, status: 'engaged', threadState: 'unassigned' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/inbox/threads/:leadId/assign-self — assign thread to the current user
app.post('/api/inbox/threads/:leadId/assign-self', requireRole('agent'), async (req, res) => {
  try {
    const leadId = parseInt(req.params.leadId);
    if (!leadId) return res.status(400).json({ error: 'Valid lead ID required' });

    const userId = req.user?.sub ? parseInt(req.user.sub) : null;
    if (!userId) return res.status(400).json({ error: 'Could not determine current user' });

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    await prisma.lead.update({ where: { id: leadId }, data: { assignedToId: userId } });

    res.json({ id: leadId, assignedToId: userId, threadState: 'assigned' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INTERVENTION / PRIORITY INBOX API ====================

// Priority inbox — leads sorted by urgency needing human action
app.get('/api/inbox/priority', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const leads = await interventionEngine.getPriorityInbox(limit);
    res.json({
      leads,
      unreadAlerts: interventionEngine.getUnreadCount(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get intervention alerts
app.get('/api/alerts', (req, res) => {
  try {
    const { limit, priority, type, unreadOnly } = req.query;
    const alerts = interventionEngine.getAlerts({
      limit: parseInt(limit) || 50,
      priority,
      type,
      unreadOnly: unreadOnly === 'true',
    });
    res.json({
      alerts,
      unreadCount: interventionEngine.getUnreadCount(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark alert as read
app.post('/api/alerts/:id/read', (req, res) => {
  try {
    interventionEngine.markAlertRead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all alerts as read
app.post('/api/alerts/read-all', (req, res) => {
  try {
    interventionEngine.markAllRead();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unread alert count (lightweight polling endpoint)
app.get('/api/alerts/count', (req, res) => {
  res.json({ unreadCount: interventionEngine.getUnreadCount() });
});

// ==================== EMAIL API ====================

// Provider presets
app.get('/api/email/providers', (req, res) => {
  res.json(emailService.getProviderPresets());
});

// List email accounts
app.get('/api/email/accounts', requireRole('manager'), async (req, res) => {
  try {
    const accounts = await emailService.listAccounts();
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single email account
app.get('/api/email/accounts/:id', requireRole('manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid account ID' });
    const account = await emailService.getAccount(id);
    if (!account) return res.status(404).json({ error: 'Email account not found' });
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Safe sender list for compose surfaces
app.get('/api/email/senders', requireRole('agent'), async (req, res) => {
  try {
    const leadId = parsePositiveInt(req.query.leadId);
    const accounts = await getPermittedEmailSenderAccounts({ leadId, user: req.user });
    res.json(accounts.map(sanitizeSenderAccount));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/inbox/senders', requireRole('agent'), async (req, res) => {
  try {
    const leadId = parsePositiveInt(req.query.leadId);
    const accounts = await getPermittedEmailSenderAccounts({ leadId, user: req.user });
    res.json(accounts.map(sanitizeSenderAccount));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create email account
app.post('/api/email/accounts', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, provider, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass,
      imapHost, imapPort, imapSecure, imapUser, imapPass, senderName, signature,
      whatsappAccountId } = req.body;
    if (!email) return res.status(400).json({ error: 'Email address is required' });
    if (!smtpPass) return res.status(400).json({ error: 'SMTP password/app password is required' });

    // Validate whatsappAccountId points at a real WA account if provided
    if (whatsappAccountId != null && whatsappAccountId !== '') {
      const waId = Number(whatsappAccountId);
      if (!Number.isFinite(waId) || waId < 1) {
        return res.status(400).json({ error: 'whatsappAccountId must be a positive integer' });
      }
      const wa = await prisma.whatsAppAccount.findUnique({ where: { id: waId } });
      if (!wa) return res.status(400).json({ error: `WhatsApp account ${waId} does not exist` });
    }

    const account = await emailService.createAccount({
      name, email, provider, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass,
      imapHost, imapPort, imapSecure, imapUser, imapPass, senderName, signature,
      whatsappAccountId,
    });
    res.json({ success: true, account });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'An account with this email already exists' });
    res.status(500).json({ error: error.message });
  }
});

// Update email account
app.patch('/api/email/accounts/:id', requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid account ID' });

    // Validate whatsappAccountId if it's being set (null is allowed to unlink)
    if (req.body.whatsappAccountId != null && req.body.whatsappAccountId !== '') {
      const waId = Number(req.body.whatsappAccountId);
      if (!Number.isFinite(waId) || waId < 1) {
        return res.status(400).json({ error: 'whatsappAccountId must be a positive integer or null' });
      }
      const wa = await prisma.whatsAppAccount.findUnique({ where: { id: waId } });
      if (!wa) return res.status(400).json({ error: `WhatsApp account ${waId} does not exist` });
    }

    const account = await emailService.updateAccount(id, req.body);
    if (!account) return res.status(400).json({ error: 'No valid fields to update' });
    res.json({ success: true, account });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete email account
app.delete('/api/email/accounts/:id', requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid account ID' });
    await emailService.deleteAccount(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test email account SMTP connection
app.post('/api/email/accounts/:id/test', requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid account ID' });
    const result = await emailService.testConnection(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Daily marketing batch, rotated across the configured senders. Queue creation is idempotent by day;
// actual delivery remains governed by the global sending pause.
app.get('/api/email/daily/status', requireRole('manager'), async (req, res) => {
  try { res.json(await dailyEmailScheduler.getStatus()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.patch('/api/email/daily/settings', requireRole('admin'), async (req, res) => {
  try {
    const updates = [];
    if (typeof req.body.enabled === 'boolean') updates.push(['email.daily.enabled', String(req.body.enabled)]);
    if (typeof req.body.marketingEnabled === 'boolean') {
      await brevoMarketingCampaigns.setEnabled(req.body.marketingEnabled);
    }
    if (req.body.brevoFolderId !== undefined) {
      const rawFolderId = req.body.brevoFolderId;
      if (rawFolderId != null && String(rawFolderId).trim() !== '' && !/^[1-9]\d*$/.test(String(rawFolderId).trim())) {
        return res.status(400).json({ error: 'brevoFolderId must be a positive integer or null' });
      }
      await brevoMarketingCampaigns.setFolderId(req.body.brevoFolderId);
    }
    if (req.body.batchSize != null) {
      const batchSize = Number(req.body.batchSize);
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 200) {
        return res.status(400).json({ error: 'batchSize must be an integer from 1 to 200' });
      }
      updates.push(['email.daily.batch_size', String(batchSize)]);
    }
    for (const [key, value] of updates) {
      await prisma.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
    res.json({ success: true, ...(await dailyEmailScheduler.getStatus()) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/email/daily/preview', requireRole('manager'), async (req, res) => {
  try { res.json(await dailyEmailScheduler.run({ dryRun: true, force: true, limit: req.body?.limit })); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/email/daily/queue', requireRole('admin'), async (req, res) => {
  try { res.json(await dailyEmailScheduler.run({ force: req.body?.force === true, limit: req.body?.limit })); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// Send a message from Inbox across supported channels
app.post('/api/inbox/send', requireRole('agent'), async (req, res) => {
  try {
    const leadId = parsePositiveInt(req.body?.leadId);
    const channel = String(req.body?.channel || '').trim().toLowerCase();
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });
    if (!['whatsapp', 'email', 'imessage', 'telegram'].includes(channel)) {
      return res.status(400).json({ error: 'channel must be whatsapp, email, imessage, or telegram' });
    }

    if (channel === 'imessage') {
      const text = String(req.body?.text || req.body?.body || '').trim();
      if (!text) return res.status(400).json({ error: 'text is required for iMessage sends' });

      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      if (!lead.mobile) return res.status(400).json({ error: 'Lead has no mobile number' });

      const result = await imessageService.sendMessage(lead.mobile, text);
      if (!result.success) {
        return res.status(502).json({ success: false, reason: result.reason, error: result.rawError });
      }

      const savedMsg = await prisma.message.create({
        data: {
          leadId,
          direction: 'outbound',
          channel: 'imessage',
          imessageAccountId: result.accountId || null,
          imessageMessageId: result.messageId || null,
          content: text,
          status: 'sent',
          sentAt: new Date(),
        },
      });
      await prisma.lead.update({
        where: { id: leadId },
        data: { imessageStatus: 'sent', lastImessageAt: new Date() },
      });

      broadcastEvent('manual_reply', {
        leadId,
        channel: 'imessage',
        threadKey: `imessage:${leadId}`,
      });
      return res.json({ success: true, channel: 'imessage', message: savedMsg });
    }

    if (channel === 'telegram') {
      const text = String(req.body?.text || req.body?.body || '').trim();
      if (!text) return res.status(400).json({ error: 'text is required for Telegram sends' });
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      if (!lead.telegramPeer) {
        return res.status(400).json({ error: 'Add a Telegram @username, phone number, or peer ID to this lead first' });
      }

      const result = await telegramService.sendMessage({
        accountId: parsePositiveInt(req.body?.accountId),
        peer: lead.telegramPeer,
        message: text,
      });
      const now = result.sentAt || new Date();
      const [savedMsg] = await prisma.$transaction([
        prisma.message.create({
          data: {
            leadId,
            direction: 'outbound',
            channel: 'telegram',
            telegramAccountId: result.accountId,
            telegramMessageId: result.messageId || null,
            content: text,
            status: 'sent',
            sentAt: now,
          },
        }),
        prisma.lead.update({
          where: { id: leadId },
          data: {
            telegramStatus: 'sent',
            assignedTelegramAccountId: result.accountId,
            lastMessageAt: now,
          },
        }),
      ]);
      broadcastEvent('manual_reply', {
        leadId,
        accountId: result.accountId,
        channel: 'telegram',
        threadKey: `telegram:${leadId}`,
      });
      return res.json({ success: true, channel: 'telegram', message: savedMsg });
    }

    if (channel === 'whatsapp') {
      const text = String(req.body?.text || req.body?.body || '').trim();
      const attachmentIds = Array.isArray(req.body?.attachmentIds) ? req.body.attachmentIds : [];

      // Files, with the typed text as the first file's caption.
      if (attachmentIds.length > 0) {
        const sent = await sendWhatsAppFiles({ leadId, mediaFileIds: attachmentIds, caption: text });
        broadcastEvent('manual_reply', {
          leadId: sent.lead.id,
          accountId: sent.accountId,
          channel: 'whatsapp',
          threadKey: `whatsapp:${sent.lead.id}`,
        });
        return res.json({ success: true, channel: 'whatsapp', message: sent.messages[0], messages: sent.messages });
      }

      if (!text) return res.status(400).json({ error: 'text is required for WhatsApp sends' });

      const result = await sendManualWhatsAppMessage({ leadId, text });
      broadcastEvent('manual_reply', {
        leadId: result.lead.id,
        accountId: result.accountId,
        channel: 'whatsapp',
        threadKey: `whatsapp:${result.lead.id}`,
      });
      return res.json({ success: true, channel: 'whatsapp', message: result.message });
    }

    let subject = req.body?.subject;
    let body = req.body?.body;
    let htmlBody = req.body?.htmlBody;

    if (req.body?.templateId) {
      const rendered = await renderEmailTemplateForLead(req.body.templateId, leadId);
      subject = subject || rendered.subject;
      body = body || rendered.body;
      htmlBody = htmlBody || rendered.htmlBody;
    }

    if (!body && !htmlBody) {
      return res.status(400).json({ error: 'Email body is required' });
    }

    const { inReplyTo, replyMessage } = await resolveEmailReplyContext({
      leadId,
      replyToMessageId: req.body?.replyToMessageId,
      inReplyTo: req.body?.inReplyTo,
    });
    const emailAccount = await resolveEmailSenderAccount({
      leadId,
      requestedAccountId: req.body?.accountId || replyMessage?.emailAccountId,
      user: req.user,
    });

    if (!emailAccount) {
      return res.status(503).json({ error: 'No verified email accounts available. Add one in Settings.' });
    }

    // Resolve file attachments if provided
    let attachments;
    const attachmentIds = Array.isArray(req.body?.attachmentIds) ? req.body.attachmentIds : [];
    if (attachmentIds.length > 0) {
      const mediaFiles = await prisma.mediaFile.findMany({
        where: { id: { in: attachmentIds.map(Number).filter(Boolean) } },
      });
      attachments = mediaFiles.map((f) => ({
        filename: f.originalName,
        path: path.resolve(f.path),
        contentType: f.mimeType,
      }));
    }

    // CC/BCC — accept comma-separated strings or arrays
    const cc = Array.isArray(req.body?.cc)
      ? req.body.cc.join(', ')
      : typeof req.body?.cc === 'string' ? req.body.cc.trim() : undefined;
    const bcc = Array.isArray(req.body?.bcc)
      ? req.body.bcc.join(', ')
      : typeof req.body?.bcc === 'string' ? req.body.bcc.trim() : undefined;

    // Schedule for later — create queued message instead of sending now
    const scheduledAt = req.body?.scheduledAt ? new Date(req.body.scheduledAt) : null;
    if (scheduledAt && scheduledAt > new Date()) {
      const normalizedSubject = subject || replyMessage?.emailSubject || 'No subject';
      const queuedMsg = await prisma.message.create({
        data: {
          leadId,
          direction: 'outbound',
          channel: 'email',
          content: body || htmlBody || '',
          waAccount: 0,
          emailAccountId: emailAccount.id,
          status: 'queued',
          emailSubject: normalizedSubject,
          emailInReplyTo: inReplyTo || null,
          emailCc: cc || null,
          emailBcc: bcc || null,
          scheduledAt,
        },
      });
      return res.json({ success: true, channel: 'email', scheduled: true, scheduledAt, message: queuedMsg });
    }

    const result = await emailService.sendEmail({
      leadId,
      accountId: emailAccount.id,
      subject: subject || replyMessage?.emailSubject || undefined,
      body,
      htmlBody,
      inReplyTo,
      attachments,
      cc: cc || undefined,
      bcc: bcc || undefined,
    });

    if (result.success) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: 'engaged', engagementLevel: 'high' },
      });
      broadcastEvent('email_sent', {
        leadId,
        accountId: emailAccount.id,
        channel: 'email',
        messageId: result.messageId || null,
        threadKey: `email:${leadId}`,
      });
    } else {
      broadcastEvent('email_failed', {
        leadId,
        accountId: emailAccount.id,
        channel: 'email',
        error: result.error || 'unknown_error',
        threadKey: `email:${leadId}`,
      });
    }

    return res.json({
      ...result,
      channel: 'email',
      sender: sanitizeSenderAccount(emailAccount),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.reason ? { reason: error.reason } : {}),
    });
  }
});

// Backward-compatible WhatsApp reply route for the current dashboard
app.post('/api/inbox/reply', requireRole('agent'), async (req, res) => {
  try {
    const leadId = parsePositiveInt(req.body?.leadId);
    const text = String(req.body?.text || '').trim();
    if (!leadId || !text) return res.status(400).json({ error: 'leadId and text are required' });

    const result = await sendManualWhatsAppMessage({ leadId, text });
    broadcastEvent('manual_reply', {
      leadId: result.lead.id,
      accountId: result.accountId,
      channel: 'whatsapp',
      threadKey: `whatsapp:${result.lead.id}`,
    });
    res.json({ success: true, message: result.message });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message,
      ...(error.reason ? { reason: error.reason } : {}),
    });
  }
});

// Send email to a lead (manual from inbox or lead drawer)
app.post('/api/leads/:id/email/send', requireRole('agent'), async (req, res) => {
  try {
    const leadId = parseInt(req.params.id);
    if (isNaN(leadId) || leadId < 1) return res.status(400).json({ error: 'Invalid lead ID' });

    const { subject, body, htmlBody, accountId, replyToMessageId, inReplyTo } = req.body;
    if (!body && !htmlBody) return res.status(400).json({ error: 'Email body is required' });

    const { inReplyTo: resolvedInReplyTo, replyMessage } = await resolveEmailReplyContext({
      leadId,
      replyToMessageId,
      inReplyTo,
    });
    const emailAccount = await resolveEmailSenderAccount({
      leadId,
      requestedAccountId: accountId || replyMessage?.emailAccountId,
      user: req.user,
    });
    if (!emailAccount) {
      return res.status(503).json({ error: 'No verified email accounts available. Add one in Settings.' });
    }

    const result = await emailService.sendEmail({
      leadId,
      accountId: emailAccount.id,
      subject: subject || replyMessage?.emailSubject || undefined,
      body,
      htmlBody,
      inReplyTo: resolvedInReplyTo,
    });

    if (result.success) {
      // Mark lead as engaged (manual takeover)
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: 'engaged', engagementLevel: 'high' },
      });
      broadcastEvent('email_sent', {
        leadId,
        accountId: emailAccount.id,
        channel: 'email',
        messageId: result.messageId || null,
        threadKey: `email:${leadId}`,
      });
    } else {
      broadcastEvent('email_failed', {
        leadId,
        accountId: emailAccount.id,
        channel: 'email',
        error: result.error || 'unknown_error',
        threadKey: `email:${leadId}`,
      });
    }

    res.json({
      ...result,
      sender: sanitizeSenderAccount(emailAccount),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post('/api/leads/:id/assign-email-account', requireRole('manager'), async (req, res) => {
  try {
    const leadId = parsePositiveInt(req.params.id);
    if (!leadId) return res.status(400).json({ error: 'Invalid lead ID' });

    const assignedEmailAccountId =
      req.body?.assignedEmailAccountId == null
        ? null
        : parsePositiveInt(req.body.assignedEmailAccountId);

    if (req.body?.assignedEmailAccountId != null && !assignedEmailAccountId) {
      return res.status(400).json({ error: 'assignedEmailAccountId must be a positive integer or null' });
    }

    if (assignedEmailAccountId) {
      const account = await prisma.emailAccount.findUnique({ where: { id: assignedEmailAccountId } });
      if (!account) return res.status(404).json({ error: 'Email account not found' });
    }

    await prisma.lead.update({
      where: { id: leadId },
      data: { assignedEmailAccountId },
    });

    res.json({ success: true, leadId, assignedEmailAccountId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger manual IMAP sync
app.post('/api/email/sync', requireRole('admin'), async (req, res) => {
  try {
    await emailService.syncAllReplies();
    res.json({ success: true, message: 'Email sync completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ACTIVITY FEED API ====================
app.get('/api/activity', async (req, res) => {
  try {
    // Fetch last 15 leads
    const recentLeads = await prisma.lead.findMany({
      take: 15,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, source: true, createdAt: true }
    });

    // Fetch last 15 messages
    const recentMessages = await prisma.message.findMany({
      where: { status: { in: ['sent', 'delivered', 'read', 'failed'] } },
      take: 15,
      orderBy: { createdAt: 'desc' },
      select: { id: true, direction: true, channel: true, status: true, createdAt: true, lead: { select: { name: true } } }
    });

    // Synthesize into a unified timeline
    const activities = [];

    recentLeads.forEach((lead) => {
      let type = 'lead_created';
      let message = `Captured new lead <strong>${lead.name}</strong>`;
      
      if (lead.source === 'csv_import') {
        type = 'lead_imported';
        message = `Imported new lead <strong>${lead.name}</strong> via CSV`;
      } else if (lead.source === 'manual') {
        type = 'lead_created';
        message = `Manually created new lead <strong>${lead.name}</strong>`;
      } else if (lead.source) {
        message = `Captured new lead <strong>${lead.name}</strong> from ${lead.source}`;
      }

      activities.push({
        id: `lead_${lead.id}`,
        type,
        message,
        timestamp: lead.createdAt
      });
    });

    recentMessages.forEach((msg) => {
      let type = 'system_error';
      let text = 'Unknown message event';
      const channelLabel = msg.channel === 'email'
        ? '📧 email'
        : msg.channel === 'imessage'
          ? '💬 iMessage'
          : msg.channel === 'telegram'
            ? '✈️ Telegram'
            : '💬 WhatsApp';

      if (msg.direction === 'inbound') {
        type = 'reply_received';
        text = `Received a ${channelLabel} reply from <strong>${msg.lead?.name || 'Unknown'}</strong>`;
      } else {
        if (msg.status === 'failed' || msg.status === 'permanently_failed') {
          type = 'message_failed';
          text = `Failed to send ${channelLabel} to <strong>${msg.lead?.name || 'Unknown'}</strong>`;
        } else {
          type = 'message_sent';
          text = `Sent ${channelLabel} outreach to <strong>${msg.lead?.name || 'Unknown'}</strong>`;
        }
      }

      activities.push({
        id: `msg_${msg.id}`,
        type,
        message: text,
        timestamp: msg.createdAt
      });
    });

    // Sort combined feed descending by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(activities.slice(0, 20)); // Return top 20 events
  } catch (error) {
    logger.error('Failed to fetch activity feed:', error);
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
});

// ======================== START SERVER ========================

export function startApiServer() {
  const port = config.api.port || 3001;
  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`✨ Dashboard API running securely on public interface http://0.0.0.0:${port}`);
  });
  return server; // Return http.Server so index.js can close it on shutdown
}

// ======================== CONVERSION FUNNEL ========================
// GET /api/analytics/funnel?range=30d&source=website&country=India&tier=HOT
// GET /api/analytics/whatsapp-pricing — this month's WhatsApp messages as
// Meta will bill them, grouped by pricing category, from the pricing block
// on its status webhooks. Meta sends categories, not amounts; rates are on
// its rate card. From 1 October 2026 service replies are charged too.
app.get('/api/analytics/whatsapp-pricing', async (_req, res) => {
  try {
    const timeZone = workspaceTimezone();
    const now = zonedParts(new Date(), timeZone);
    const since = zonedTimeToUtc(now.year, now.month, 1, 0, 0, timeZone);
    const scope = { channel: 'whatsapp', direction: 'outbound', createdAt: { gte: since } };

    const [grouped, unpriced] = await Promise.all([
      prisma.message.groupBy({
        by: ['pricingCategory', 'billable'],
        where: { ...scope, pricingCategory: { not: null } },
        _count: { _all: true },
      }),
      prisma.message.count({
        where: { ...scope, pricingCategory: null, status: { in: ['sent', 'delivered', 'read'] } },
      }),
    ]);

    const byCategory = {};
    for (const row of grouped) {
      const key = row.pricingCategory;
      byCategory[key] ||= { category: key, billable: 0, free: 0 };
      if (row.billable === false) byCategory[key].free += row._count._all;
      else byCategory[key].billable += row._count._all;
    }
    const categories = Object.values(byCategory).sort((a, b) => (b.billable + b.free) - (a.billable + a.free));
    res.json({
      since: since.toISOString(),
      timeZone,
      categories,
      billable: categories.reduce((sum, c) => sum + c.billable, 0),
      free: categories.reduce((sum, c) => sum + c.free, 0),
      // Sent through a provider that reports no pricing (AiSensy campaigns),
      // or not yet acknowledged by Meta.
      unpriced,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/analytics/funnel', async (req, res) => {
  try {
    const { range = '30d', source, country, tier } = req.query;
    const days = range === '7d' ? 7 : range === '90d' ? 90 : range === 'all' ? null : 30;

    const now = new Date();
    const dateFilter = days ? buildNewLeadDateWhere(new Date(now.getTime() - days * 86400000), now)
      : {};
    const baseWhere = {
      ...dateFilter,
      ...(source ? { source } : {}),
      ...(country ? { country: { contains: country } } : {}),
      ...(tier ? { leadTier: tier } : {}),
    };
    const activeWhere = {
      ...baseWhere,
      status: { notIn: ['paused', 'wa_unavailable'] },
    };

    const stages = ['new', 'contacted', 'replied', 'engaged', 'closed'];

    // Count leads at each stage across the active lead set.
    const stageCounts = await Promise.all(
      stages.map((stage) => {
        return prisma.lead.count({ where: { ...activeWhere, status: stage } });
      })
    );

    // Additional counts
    const [total, paused, waUnavailable, allContactedPlus] = await Promise.all([
      prisma.lead.count({ where: activeWhere }),
      prisma.lead.count({ where: { ...baseWhere, status: 'paused' } }),
      prisma.lead.count({ where: { ...baseWhere, status: 'wa_unavailable' } }),
      prisma.lead.count({ where: { ...activeWhere, status: { in: ['contacted', 'replied', 'engaged', 'closed'] } } }),
    ]);

    // Build funnel stages with conversion rates
    const funnelData = [];
    let prevCount = total;
    for (let i = 0; i < stages.length; i++) {
      const count = stageCounts[i];
      const reachedCount = i === 0 ? total : i === 1 ? allContactedPlus :
        stageCounts.slice(i).reduce((a, b) => a + b, 0);
      const convRate = prevCount > 0 ? Math.round((reachedCount / prevCount) * 100) : 0;
      const dropoff = i > 0 ? prevCount - reachedCount : 0;
      funnelData.push({
        stage: stages[i],
        label: stages[i].charAt(0).toUpperCase() + stages[i].slice(1),
        count: i === 0 ? total - allContactedPlus : stageCounts[i],
        cumulative: i === 0 ? total : i === 1 ? allContactedPlus : stageCounts.slice(i).reduce((a, b) => a + b, 0),
        conversionRate: convRate,
        dropoff: i === 0 ? 0 : dropoff,
      });
      if (i === 0) prevCount = allContactedPlus;
      else prevCount = stageCounts.slice(i).reduce((a, b) => a + b, 0);
    }

    // Source breakdown
    const sourceCounts = await prisma.lead.groupBy({
      by: ['source'],
      where: activeWhere,
      _count: { id: true },
    });

    // Tier breakdown
    const tierCounts = await prisma.lead.groupBy({
      by: ['leadTier'],
      where: activeWhere,
      _count: { id: true },
    });

    // Reply intent breakdown (from classified leads)
    const intentCounts = await prisma.lead.groupBy({
      by: ['lastReplyIntent'],
      where: { ...activeWhere, lastReplyIntent: { not: null } },
      _count: { id: true },
    });

    // Avg reply time is measured from the first delivered outbound message to
    // the first later inbound message. Lead insertion/import time is not an
    // outreach event and made recovered historical data look artificially slow.
    const repliedLeads = await prisma.lead.findMany({
      where: { ...activeWhere,
        messages: { some: { direction: "inbound" } },
      },
      select: {
        messages: {
          where: {
            OR: [
              { direction: "inbound" },
              {
                direction: "outbound",
                status: { in: DELIVERED_MESSAGE_STATUSES },
              },
            ],
          },
          select: { direction: true, createdAt: true, sentAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
      take: 500,
    });
    const replyDurations = repliedLeads.flatMap(({ messages }) => {
      const outbound = messages.find((message) => message.direction === "outbound",
      );
      if (!outbound) return [];
      const sentAt = new Date(outbound.sentAt || outbound.createdAt);
      const inbound = messages.find(
        (message) =>
          message.direction === "inbound" &&
          new Date(message.createdAt) >= sentAt,
      );
      return inbound ? [(new Date(inbound.createdAt) - sentAt) / 3600000] : [];
    });
    const avgReplyHours =
      replyDurations.length > 0
        ? Math.round(
            (replyDurations.reduce((sum, hours) => sum + hours, 0) /
              replyDurations.length) * 10) / 10
      : null;

    res.json({
      range,
      total,
      paused,
      waUnavailable,
      funnel: funnelData,
      avgReplyHours,
      bySource: sourceCounts.map((s) => ({ source: s.source, count: s._count.id })),
      byTier: tierCounts.map((t) => ({ tier: t.leadTier || 'unknown', count: t._count.id })),
      byIntent: intentCounts.map((i) => ({ intent: i.lastReplyIntent, count: i._count.id })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/analytics/recompute-weights — force refresh conversion affinity weights
app.post('/api/analytics/recompute-weights', requireRole('manager'), async (req, res) => {
  try {
    // Invalidate cache so next call recomputes
    await prisma.systemConfig.deleteMany({ where: { key: 'scoring.conversionWeights' } });
    const weights = await leadScorer.getConversionWeights();
    res.json({ ok: true, sampleSize: weights.sampleSize, countries: Object.keys(weights.countryRates).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ======================== CAMPAIGN ROI ========================
// GET /api/analytics/campaign-roi?range=30d
app.get('/api/analytics/campaign-roi', async (req, res) => {
  try {
    const { range = '30d' } = req.query;
    const days = range === '7d' ? 7 : range === '90d' ? 90 : range === 'all' ? null : 30;
    const dateFilter = days ? { createdAt: { gte: new Date(Date.now() - days * 86400000) } } : {};

    const campaigns = await prisma.campaign.findMany({
      where: dateFilter,
      include: {
        campaignLeads: {
          include: {
            lead: {
              select: {
                id: true,
                status: true,
                dealValue: true,
                convertedAt: true,
                lastReplyIntent: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const attributedLeadMap = new Map();
    campaigns.forEach((campaign) => {
      campaign.campaignLeads.forEach(({ lead }) => {
        if (!lead) return;
        attributedLeadMap.set(lead.id, lead);
      });
    });

    const attributedClosedLeads = Array.from(attributedLeadMap.values()).filter(
      (lead) => lead.status === 'closed' && lead.dealValue != null
    );
    const totalDealValue = attributedClosedLeads.reduce((sum, lead) => sum + (lead.dealValue || 0), 0);
    const convertedCount = attributedClosedLeads.length;
    const avgDeal = convertedCount > 0 ? Math.round(totalDealValue / convertedCount) : 0;

    const roiRows = campaigns.map((c) => {
      const leads = c.campaignLeads.map((cl) => cl.lead);
      const sent = c.campaignLeads.filter((cl) =>
        ["sent", "replied"].includes(cl.status),
      ).length;
      const replied = c.campaignLeads.filter(
        (cl) => cl.status === "replied",
      ).length;
      const converted = leads.filter(
        (l) => l.status === 'closed' && l.dealValue != null).length;
      const revenue = leads
        .filter((lead) => lead.status === 'closed' && lead.dealValue != null)
        .reduce((sum, lead) => sum + (lead.dealValue || 0), 0);
      const replyRate = sent > 0 ? Math.round((replied / sent) * 100) : 0;
      const convRate = sent > 0 ? Math.round((converted / sent) * 100) : 0;

      return {
        id: c.id,
        name: c.name,
        channel: c.channel,
        status: c.status,
        totalLeads: c.totalLeads,
        sent,
        replied,
        converted,
        replyRate,
        conversionRate: convRate,
        revenue,
        avgDealValue: converted > 0 ? Math.round(revenue / converted) : 0,
        startedAt: c.startedAt,
        completedAt: c.completedAt,
      };
    });

    res.json({
      range,
      pipeline: {
        totalDealValue,
        convertedLeads: convertedCount,
        avgDealValue: avgDeal,
      },
      campaigns: roiRows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/analytics/email-performance?range=30d
// Reports reply rate per email templateVariant so prompt rewrites can be A/B compared
// over time. Only counts AI-generated emails (templateVariant IS NOT NULL); manual
// campaign sends are excluded by design.
app.get('/api/analytics/email-performance', async (req, res) => {
  try {
    const { range = '30d' } = req.query;
    const days = range === '7d' ? 7 : range === '14d' ? 14 : range === '90d' ? 90 : range === 'all' ? null : 30;
    const { start: todayStartUTC } = getLocalDayRangeUTC(parseTimezoneOffset(req.query.tzOffset));
    const since = days ? new Date(todayStartUTC.getTime() - (days - 1) * 86400000) : null;

    // Keep non-variant sends in the timeline: a later manual email must not
    // cause a reply to be credited to an earlier template variant.
    const outboundEmails = await prisma.message.findMany({
      where: {
        channel: 'email',
        direction: 'outbound',
        status: { in: DELIVERED_MESSAGE_STATUSES },
        sentAt: since ? { gte: since } : { not: null },
      },
      select: {
        id: true,
        leadId: true,
        templateVariant: true,
        sentAt: true,
        emailMessageId: true,
      },
      orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
    });

    const buckets = new Map();
    const outboundByLead = new Map();
    const variantLeadIds = new Set();
    for (const message of outboundEmails) {
      if (!outboundByLead.has(message.leadId)) outboundByLead.set(message.leadId, []);
      outboundByLead.get(message.leadId).push(message);
      if (!message.templateVariant) continue;
      variantLeadIds.add(message.leadId);
      if (!buckets.has(message.templateVariant)) {
        buckets.set(message.templateVariant, {
          variant: message.templateVariant,
          sentLeadIds: new Set(),
          repliedLeadIds: new Set(),
        });
      }
      buckets.get(message.templateVariant).sentLeadIds.add(message.leadId);
    }

    const inboundEmails = variantLeadIds.size
      ? await prisma.message.findMany({
          where: {
            leadId: { in: [...variantLeadIds] },
            channel: 'email',
            direction: 'inbound',
            ...(since ? { createdAt: { gte: since } } : {}),
          },
          select: {
            leadId: true,
            emailInReplyTo: true,
            providerCreatedAt: true,
            sentAt: true,
            createdAt: true,
          },
        })
      : [];

    for (const inbound of inboundEmails) {
      const eventAt = inbound.providerCreatedAt || inbound.sentAt || inbound.createdAt;
      const outbound = outboundByLead.get(inbound.leadId) || [];
      // Prefer the email thread header. Without one, conservatively attribute
      // to the latest email sent before the inbound event, including manual
      // sends. Never use lead.repliedAt: it may be a WhatsApp/iMessage reply.
      const matched = inbound.emailInReplyTo
        ? outbound.findLast((message) => message.emailMessageId === inbound.emailInReplyTo)
        : outbound.findLast((message) => message.sentAt <= eventAt);
      if (!matched?.templateVariant || matched.sentAt > eventAt) continue;
      buckets.get(matched.templateVariant).repliedLeadIds.add(inbound.leadId);
    }

    const variants = [...buckets.values()]
      .map(({ variant, sentLeadIds, repliedLeadIds }) => {
        const sent = sentLeadIds.size;
        const replied = repliedLeadIds.size;
        return {
          variant,
          sent,
          replied,
          replyRate: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.replyRate - a.replyRate || b.sent - a.sent);

    const totalSent = variants.reduce((s, v) => s + v.sent, 0);
    const totalReplied = variants.reduce((s, v) => s + v.replied, 0);

    res.json({
      range,
      totals: {
        sent: totalSent,
        replied: totalReplied,
        replyRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 1000) / 10 : 0,
      },
      variants,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/analytics/team — per-agent performance stats
app.get('/api/analytics/team', requireRole('manager'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { not: 'viewer' } },
      select: { id: true, name: true, email: true, role: true, lastLoginAt: true },
      orderBy: { name: 'asc' },
    });

    const stats = await Promise.all(users.map(async (u) => {
      const [assigned, replied, engaged, closed, scoreAgg] = await Promise.all([
        prisma.lead.count({ where: { assignedToId: u.id } }),
        prisma.lead.count({ where: { assignedToId: u.id, status: 'replied' } }),
        prisma.lead.count({ where: { assignedToId: u.id, status: 'engaged' } }),
        prisma.lead.count({ where: { assignedToId: u.id, status: 'closed' } }),
        prisma.lead.aggregate({
          where: { assignedToId: u.id, score: { gt: 0 } },
          _avg: { score: true },
        }),
      ]);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        lastLoginAt: u.lastLoginAt,
        leadsAssigned: assigned,
        replied: replied + engaged, // engaged is a deeper form of replied
        closed,
        avgScore: Math.round(scoreAgg._avg.score || 0),
        conversionRate: assigned > 0 ? Math.round((closed / assigned) * 100) : 0,
      };
    }));

    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/leads/:id/deal — record deal value when a lead closes
app.patch('/api/leads/:id/deal', requireRole('agent'), async (req, res) => {
  try {
    const { dealValue, convertedAt } = req.body;
    if (dealValue == null) return res.status(400).json({ error: 'dealValue required' });

    const lead = await prisma.lead.update({
      where: { id: parseInt(req.params.id) },
      data: {
        dealValue: parseFloat(dealValue),
        convertedAt: convertedAt ? new Date(convertedAt) : new Date(),
        status: 'closed',
      },
    });
    res.json({ ok: true, lead });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ======================== LEAD ENRICHMENT ========================
app.post('/api/leads/:id/enrich', requireRole('agent'), async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Don't re-enrich if enriched within last 24h
    if (lead.enrichedData) {
      const existing = JSON.parse(lead.enrichedData);
      if (existing.enrichedAt && Date.now() - new Date(existing.enrichedAt) < 86400000) {
        return res.json({ enrichedData: existing, cached: true });
      }
    }

    return res.status(410).json({
      error: 'Lead enrichment was removed along with the AI layer.',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leads/:id/enriched', async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { id: true, enrichedData: true },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ enrichedData: lead.enrichedData ? JSON.parse(lead.enrichedData) : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ======================== DUPLICATE DETECTION + MERGE ========================
// GET /api/leads/duplicates — find potential duplicates by name+company similarity
app.get('/api/leads/duplicates', async (req, res) => {
  try {
    // Strategy: find leads with no unique mobile (impossible due to unique constraint)
    // but similar names + different mobile — or same email different mobile
    const leads = await prisma.lead.findMany({
      where: { email: { not: null } },
      select: { id: true, name: true, mobile: true, email: true, company: true, source: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    // Group by normalized email
    const emailGroups = {};
    for (const lead of leads) {
      if (!lead.email) continue;
      const key = lead.email.toLowerCase().trim();
      if (!emailGroups[key]) emailGroups[key] = [];
      emailGroups[key].push(lead);
    }

    const duplicateGroups = Object.entries(emailGroups)
      .filter(([, group]) => group.length > 1)
      .map(([email, group]) => ({ matchKey: email, matchType: 'email', leads: group }));

    // Also find leads with very similar names from same country (no email)
    // Quick heuristic: same first name + same last name (case-insensitive)
    const noEmailLeads = await prisma.lead.findMany({
      where: { email: null },
      select: { id: true, name: true, mobile: true, email: true, company: true, source: true, status: true, country: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 3000,
    });

    const nameGroups = {};
    for (const lead of noEmailLeads) {
      const key = lead.name.toLowerCase().trim().replace(/\s+/g, ' ');
      if (!nameGroups[key]) nameGroups[key] = [];
      nameGroups[key].push(lead);
    }

    const nameMatches = Object.entries(nameGroups)
      .filter(([, group]) => group.length > 1)
      .map(([name, group]) => ({ matchKey: name, matchType: 'name', leads: group }));

    res.json({
      total: duplicateGroups.length + nameMatches.length,
      emailDuplicates: duplicateGroups,
      nameDuplicates: nameMatches,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leads/merge — merge secondary lead into primary
// Moves all messages, notes, tasks to primary. Deletes secondary.
app.post('/api/leads/merge', requireRole('manager'), async (req, res) => {
  try {
    const { primaryId, secondaryId } = req.body;
    if (!primaryId || !secondaryId) return res.status(400).json({ error: 'primaryId and secondaryId required' });
    if (primaryId === secondaryId) return res.status(400).json({ error: 'Cannot merge a lead into itself' });

    const [primary, secondary] = await Promise.all([
      prisma.lead.findUnique({ where: { id: parseInt(primaryId) } }),
      prisma.lead.findUnique({ where: { id: parseInt(secondaryId) } }),
    ]);
    if (!primary) return res.status(404).json({ error: 'Primary lead not found' });
    if (!secondary) return res.status(404).json({ error: 'Secondary lead not found' });

    // Merge in a transaction
    await prisma.$transaction(async (tx) => {
      // Move messages
      await tx.message.updateMany({ where: { leadId: secondary.id }, data: { leadId: primary.id } });
      // Move notes
      await tx.leadNote.updateMany({ where: { leadId: secondary.id }, data: { leadId: primary.id } });
      // Move tasks
      await tx.leadTask.updateMany({ where: { leadId: secondary.id }, data: { leadId: primary.id } });
      // Remove secondary from campaign leads (to avoid unique constraint violation)
      await tx.campaignLead.deleteMany({ where: { leadId: secondary.id } });

      // Merge fields: fill primary's null fields with secondary's values
      const mergedUpdates = {};
      const fieldsToMerge = ['email', 'company', 'country', 'product', 'quantity', 'notes', 'tags', 'enrichedData'];
      for (const f of fieldsToMerge) {
        if (!primary[f] && secondary[f]) mergedUpdates[f] = secondary[f];
      }
      // Merge tags
      if (primary.tags && secondary.tags) {
        const merged = [...new Set([...primary.tags.split(','), ...secondary.tags.split(',')].map((t) => t.trim()).filter(Boolean))];
        mergedUpdates.tags = merged.join(', ');
      }

      if (Object.keys(mergedUpdates).length > 0) {
        await tx.lead.update({ where: { id: primary.id }, data: mergedUpdates });
      }

      // Delete secondary
      await tx.lead.delete({ where: { id: secondary.id } });
    });

    const merged = await prisma.lead.findUnique({ where: { id: primary.id } });
    res.json({ ok: true, lead: merged });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ======================== GOOGLE SHEETS SYNC ========================
// GET /api/settings/sheets-webhook
app.get('/api/settings/sheets-webhook', requireRole('manager'), async (req, res) => {
  try {
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: ['sheets.webhook_url', 'sheets.enabled', 'sheets.events'] } },
    });
    const cfg = {};
    for (const r of rows) cfg[r.key] = r.value;
    res.json({
      url: cfg['sheets.webhook_url'] || null,
      enabled: cfg['sheets.enabled'] === 'true',
      events: cfg['sheets.events'] ? JSON.parse(cfg['sheets.events']) : ['lead.created', 'lead.replied', 'lead.engaged'],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/settings/sheets-webhook
app.post('/api/settings/sheets-webhook', requireRole('admin'), async (req, res) => {
  try {
    const { url, enabled = true, events } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    const upsert = async (key, value) => prisma.systemConfig.upsert({
      where: { key }, update: { value }, create: { key, value },
    });

    await Promise.all([
      upsert('sheets.webhook_url', url),
      upsert('sheets.enabled', String(!!enabled)),
      upsert('sheets.events', JSON.stringify(events || ['lead.created', 'lead.replied', 'lead.engaged'])),
    ]);

    sheetsSync.reload();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/settings/sheets-webhook/test
app.post('/api/settings/sheets-webhook/test', requireRole('admin'), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const result = await sheetsSync.test(url);
    res.json(result);
  } catch (e) { res.status(422).json({ error: e.message }); }
});

// DELETE /api/settings/sheets-webhook
app.delete('/api/settings/sheets-webhook', requireRole('admin'), async (req, res) => {
  try {
    await prisma.systemConfig.deleteMany({
      where: { key: { in: ['sheets.webhook_url', 'sheets.enabled', 'sheets.events'] } },
    });
    sheetsSync.reload();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ======================== WEBHOOK SUBSCRIPTIONS ========================
app.get('/api/webhooks/subscriptions', requireRole('manager'), async (req, res) => {
  try {
    const subs = await prisma.webhookSubscription.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(subs.map((s) => ({ ...s, secret: s.secret ? '••••••••' : '' })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/webhooks/subscriptions', requireRole('admin'), async (req, res) => {
  try {
    const { name, url, events = [], secret = '' } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url required' });
    new URL(url); // validate URL format
    const sub = await prisma.webhookSubscription.create({
      data: { name, url, events: JSON.stringify(events), secret },
    });
    res.json(sub);
  } catch (e) {
    if (e instanceof TypeError) return res.status(400).json({ error: 'Invalid URL' });
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/webhooks/subscriptions/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, url, events, secret, enabled } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (url !== undefined) { new URL(url); data.url = url; }
    if (events !== undefined) data.events = JSON.stringify(events);
    if (secret !== undefined) data.secret = secret;
    if (enabled !== undefined) data.enabled = Boolean(enabled);
    const sub = await prisma.webhookSubscription.update({ where: { id: parseInt(req.params.id) }, data });
    res.json({ ...sub, secret: sub.secret ? '••••••••' : '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/webhooks/subscriptions/:id', requireRole('admin'), async (req, res) => {
  try {
    await prisma.webhookSubscription.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Test-fire a webhook subscription with a sample payload
app.post('/api/webhooks/subscriptions/:id/test', requireRole('admin'), async (req, res) => {
  try {
    const sub = await prisma.webhookSubscription.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    await webhookDispatcher.dispatch('webhook.test', { message: 'This is a test event from Outbound OS', subscriptionId: sub.id });
    res.json({ ok: true, message: 'Test event dispatched' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ======================== AI INSIGHTS ========================
app.get('/api/leads/:id/insights', async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { id: true, name: true, lastReplyIntent: true, aiInsights: true },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({
      leadId: lead.id,
      lastReplyIntent: lead.lastReplyIntent,
      aiInsights: lead.aiInsights ? JSON.parse(lead.aiInsights) : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leads/:id/timeline — chronological event log
app.get('/api/leads/:id/timeline', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const [messages, notes, tasks] = await Promise.all([
      prisma.message.findMany({
        where: { leadId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, direction: true, channel: true, content: true,
          status: true, sentAt: true, createdAt: true,
          emailSubject: true, waAccount: true,
        },
      }),
      prisma.leadNote.findMany({
        where: { leadId: id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, content: true, type: true, createdAt: true },
      }),
      prisma.leadTask.findMany({
        where: { leadId: id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true, dueAt: true, done: true, createdAt: true },
      }),
    ]);

    // Merge into unified timeline
    const events = [
      // Lead created
      { type: 'lead_created', ts: lead.createdAt, data: { source: lead.source, tier: lead.leadTier } },
      // Messages
      ...messages.map((m) => ({
        type: m.direction === 'outbound' ? 'message_sent' : 'message_received',
        ts: m.sentAt || m.createdAt,
        data: { id: m.id, channel: m.channel, content: m.content.slice(0, 200), status: m.status, subject: m.emailSubject, account: m.waAccount },
      })),
      // Notes
      ...notes.map((n) => ({
        type: 'note_added',
        ts: n.createdAt,
        data: { id: n.id, content: n.content, noteType: n.type },
      })),
      // Tasks
      ...tasks.map((t) => ({
        type: t.done ? 'task_completed' : 'task_created',
        ts: t.createdAt,
        data: { id: t.id, title: t.title, dueAt: t.dueAt, done: t.done },
      })),
      // Status milestones
      ...(lead.repliedAt ? [{ type: 'status_change', ts: lead.repliedAt, data: { status: 'replied' } }] : []),
      ...(lead.convertedAt ? [{ type: 'deal_closed', ts: lead.convertedAt, data: { status: 'closed', dealValue: lead.dealValue } }] : []),
    ];

    // Sort by timestamp
    events.sort((a, b) => new Date(a.ts) - new Date(b.ts));

    res.json({ leadId: id, total: events.length, events });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ======================== MEDIA FILE LIBRARY ========================
// POST /api/media/upload — upload an image/PDF/video for WA sending
app.post('/api/media/upload', requireRole('agent'), mediaUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const ext = path.extname(req.file.originalname) || '';
    const storedName = `${randomUUID()}${ext}`;
    const storedPath = path.join(MEDIA_DIR, storedName);
    const relativePath = `data/media/${storedName}`;

    // Write buffer to disk
    const ws = createWriteStream(storedPath);
    await new Promise((resolve, reject) => {
      ws.write(req.file.buffer, (err) => { if (err) reject(err); else { ws.end(); resolve(); } });
      ws.on('error', reject);
    });

    const mediaFile = await prisma.mediaFile.create({
      data: {
        filename: storedName,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: relativePath,
      },
    });
    res.json(mediaFile);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/messages/:id/media — the photo, document, voice note or video on
// a message, for signed-in users only. Files live in data/media and are never
// served statically. They are sent with a sandbox policy and nosniff, so a
// file a stranger sent can never run as a page on this origin.
app.get('/api/messages/:id/media', async (req, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { mediaUrl: true, mediaType: true, mediaFilename: true },
    });
    if (!message?.mediaUrl) return res.status(404).json({ error: 'No file on this message' });
    const absolute = path.resolve(__dirname, '..', message.mediaUrl);
    if (!absolute.startsWith(path.resolve(WHATSAPP_MEDIA_DIR) + path.sep) || !existsSync(absolute)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const inline = ['image', 'video', 'audio', 'pdf'].includes(message.mediaType);
    const name = String(message.mediaFilename || path.basename(absolute)).replace(/["\\\r\n]/g, '_');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self'; media-src 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${name}"`);
    res.sendFile(absolute);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/media — list all uploaded media files
app.get('/api/media', async (req, res) => {
  try {
    const files = await prisma.mediaFile.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(files);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/media/:id
app.delete('/api/media/:id', requireRole('agent'), async (req, res) => {
  try {
    const f = await prisma.mediaFile.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!f) return res.status(404).json({ error: 'File not found' });
    const fullPath = path.join(__dirname, '..', f.path);
    try { unlinkSync(fullPath); } catch {}
    await prisma.mediaFile.delete({ where: { id: f.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leads/:id/send-media — send files from the media library on
// WhatsApp. Body: { mediaFileIds: [id…] | mediaFileId, caption?, accountId? }.
// Uploads each file to Meta and sends it by media id (sendWhatsAppFiles).
app.post('/api/leads/:id/send-media', requireRole('agent'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.mediaFileIds) ? req.body.mediaFileIds : [req.body?.mediaFileId].filter(Boolean);
    const sent = await sendWhatsAppFiles({
      leadId: parseInt(req.params.id),
      mediaFileIds: ids,
      caption: req.body?.caption,
      accountId: parsePositiveInt(req.body?.accountId),
    });
    broadcastEvent('manual_reply', { leadId: sent.lead.id, accountId: sent.accountId, channel: 'whatsapp', threadKey: `whatsapp:${sent.lead.id}` });
    res.json({ success: true, messages: sent.messages });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message, reason: e.reason });
  }
});

// ======================== EMAIL TEMPLATES ========================
app.get('/api/email/templates', requireRole('agent'), async (req, res) => {
  try {
    const templates = await prisma.emailTemplate.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(templates);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email/templates', requireRole('manager'), async (req, res) => {
  try {
    const { name, subject, htmlBody, textBody = '', category = 'outreach' } = req.body;
    if (!name || !subject || !htmlBody) return res.status(400).json({ error: 'name, subject, htmlBody required' });
    // Extract {{variable}} names
    const variables = JSON.stringify([...new Set([...htmlBody.matchAll(/\{\{(\w+(?:\.\w+)*)\}\}/g)].map((m) => m[1]))]);
    const t = await prisma.emailTemplate.create({ data: { name, subject, htmlBody, textBody, variables, category } });
    res.json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/email/templates/:id', requireRole('agent'), async (req, res) => {
  try {
    const t = await prisma.emailTemplate.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!t) return res.status(404).json({ error: 'Template not found' });
    res.json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/email/templates/:id', requireRole('manager'), async (req, res) => {
  try {
    const { name, subject, htmlBody, textBody, category } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (subject !== undefined) data.subject = subject;
    if (category !== undefined) data.category = category;
    if (textBody !== undefined) data.textBody = textBody;
    if (htmlBody !== undefined) {
      data.htmlBody = htmlBody;
      data.variables = JSON.stringify([...new Set([...htmlBody.matchAll(/\{\{(\w+(?:\.\w+)*)\}\}/g)].map((m) => m[1]))]);
    }
    const t = await prisma.emailTemplate.update({ where: { id: parseInt(req.params.id) }, data });
    res.json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/email/templates/:id', requireRole('manager'), async (req, res) => {
  try {
    await prisma.emailTemplate.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Render a template with lead data (preview or actual send)
app.post('/api/email/templates/:id/render', requireRole('agent'), async (req, res) => {
  try {
    const t = await prisma.emailTemplate.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!t) return res.status(404).json({ error: 'Template not found' });
    const { leadId } = req.body;
    let ctx = req.body.context || {};
    if (leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: parseInt(leadId) } });
      if (lead) ctx = { ...ctx, lead };
    }
    const render = (str) => str.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
      const val = path.split('.').reduce((o, k) => o?.[k], ctx);
      return val != null ? String(val) : '';
    });
    res.json({ subject: render(t.subject), htmlBody: render(t.htmlBody), textBody: render(t.textBody) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leads/:id/email/send-template — send rendered HTML email template
app.post('/api/leads/:id/email/send-template', requireRole('agent'), async (req, res) => {
  try {
    const leadId = parsePositiveInt(req.params.id);
    const { templateId, accountId, replyToMessageId, inReplyTo } = req.body;
    if (!leadId) return res.status(400).json({ error: 'Invalid lead ID' });
    if (!templateId) return res.status(400).json({ error: 'templateId required' });

    const rendered = await renderEmailTemplateForLead(templateId, leadId);
    const { inReplyTo: resolvedInReplyTo, replyMessage } = await resolveEmailReplyContext({
      leadId,
      replyToMessageId,
      inReplyTo,
    });
    const emailAccount = await resolveEmailSenderAccount({
      leadId,
      requestedAccountId: accountId || replyMessage?.emailAccountId,
      user: req.user,
    });
    if (!emailAccount) {
      return res.status(503).json({ error: 'No verified email accounts available. Add one in Settings.' });
    }

    const result = await emailService.sendEmail({
      leadId,
      accountId: emailAccount.id,
      subject: rendered.subject || replyMessage?.emailSubject || undefined,
      body: rendered.body,
      htmlBody: rendered.htmlBody,
      inReplyTo: resolvedInReplyTo,
    });

    if (result.success) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: 'engaged', engagementLevel: 'high' },
      });
      broadcastEvent('email_sent', {
        leadId,
        accountId: emailAccount.id,
        channel: 'email',
        messageId: result.messageId || null,
        threadKey: `email:${leadId}`,
      });
    } else {
      broadcastEvent('email_failed', {
        leadId,
        accountId: emailAccount.id,
        channel: 'email',
        error: result.error || 'unknown_error',
        threadKey: `email:${leadId}`,
      });
    }

    res.json({
      ok: result.success,
      ...result,
      sender: sanitizeSenderAccount(emailAccount),
    });
  } catch (e) { res.status(e.statusCode || 500).json({ error: e.message }); }
});

// ======================== WHATSAPP CREDENTIALS ========================

// PATCH /api/whatsapp/accounts/:id/cloud-credentials
// Chooses the account's provider and stores its credentials.
//   meta:    { provider: 'meta', metaPhoneNumberId, metaAccessToken, metaWabaId?, templateLanguage? }
//   aisensy: { provider: 'aisensy', aisensyProjectId, aisensyApiKey, aisensyCampaignApiKey, defaultCampaignName }
// Omitted fields are left as they are, so a secret never has to be re-entered
// to change something else. Secrets are never returned to the browser.
app.patch('/api/whatsapp/accounts/:id/cloud-credentials', requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid account id' });
    const {
      provider,
      metaPhoneNumberId, metaAccessToken, metaWabaId, templateLanguage,
      aisensyApiKey, aisensyProjectId, aisensyCampaignApiKey, defaultCampaignName,
    } = req.body || {};

    if (provider !== undefined && !Object.values(WHATSAPP_PROVIDERS).includes(provider)) {
      return res.status(400).json({ error: `provider must be one of: ${Object.values(WHATSAPP_PROVIDERS).join(', ')}` });
    }

    const data = { waAccountType: 'cloud_api' };
    if (provider !== undefined) data.provider = provider;
    if (metaPhoneNumberId !== undefined) data.cloudApiPhoneId = String(metaPhoneNumberId).replace(/\s+/g, '');
    if (metaAccessToken) data.cloudApiToken = whatsappCloudApi.encryptToken(String(metaAccessToken).trim());
    if (metaWabaId !== undefined) data.metaWabaId = String(metaWabaId).trim();
    if (templateLanguage !== undefined) data.templateLanguage = String(templateLanguage).trim() || 'en';
    if (aisensyApiKey) data.aisensyApiKey = whatsappCloudApi.encryptToken(aisensyApiKey);
    if (aisensyProjectId) data.aisensyProjectId = String(aisensyProjectId).trim();
    if (aisensyCampaignApiKey) data.aisensyCampaignApiKey = whatsappCloudApi.encryptToken(aisensyCampaignApiKey);
    if (defaultCampaignName !== undefined) data.defaultCampaignName = String(defaultCampaignName).trim();

    if (Object.keys(data).length === 1) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    let account = await prisma.whatsAppAccount.update({ where: { id }, data });

    // Flip the persisted status so the Settings cards reflect the new state
    // immediately rather than waiting for the next boot reconciliation.
    const ready = Boolean(account.enabled && credentialState(account).ready);
    if (ready !== (account.status === 'connected')) {
      account = await prisma.whatsAppAccount.update({
        where: { id },
        data: { status: ready ? 'connected' : 'disconnected' },
      });
    }

    res.json({
      ok: true,
      id: account.id,
      ...publicCredentialSummary(account),
      aisensyProjectId: account.aisensyProjectId,
      defaultCampaignName: account.defaultCampaignName,
      templateLanguage: account.templateLanguage,
      metaWabaId: account.metaWabaId,
      ready,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/whatsapp/accounts/:id/test-connection
// Verifies stored credentials with the provider without messaging anyone.
app.post('/api/whatsapp/accounts/:id/test-connection', requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid account id' });
    const result = await whatsappCloudApi.testCredentials(id);
    // `error` is the field every dashboard error toast reads.
    res.status(result.ok ? 200 : 422).json(result.ok ? result : { ...result, error: result.message });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leads/:id/send-cloud-text
app.post('/api/leads/:id/send-cloud-text', requireRole('agent'), async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.mobile) return res.status(422).json({ error: 'Lead has no mobile number' });

    const { text, accountId } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

    const result = await whatsappCloudApi.sendTextMessage(lead.mobile, text.trim(), accountId ? parseInt(accountId) : null);

    const message = await prisma.message.create({
      data: {
        leadId: lead.id,
        direction: 'outbound',
        channel: 'whatsapp',
        content: text.trim(),
        waAccount: accountId || 0,
        status: result.success ? 'sent' : 'failed',
        sentAt: result.success ? new Date() : null,
      },
    });

    if (!result.success) return res.status(422).json({ error: result.reason, rawError: result.rawError });
    res.json({ ok: true, messageId: result.messageId, dbId: message.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leads/:id/send-cloud-template — send Meta HSM approved template
app.post('/api/leads/:id/send-cloud-template', requireRole('agent'), async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.mobile) return res.status(422).json({ error: 'Lead has no mobile number' });

    const { templateName, languageCode = 'en', components = [], accountId } = req.body;
    if (!templateName) return res.status(400).json({ error: 'templateName required' });

    const result = await whatsappCloudApi.sendTemplate(
      lead.mobile, templateName, languageCode, components,
      accountId ? parseInt(accountId) : null
    );

    if (!result.success) return res.status(422).json({ error: result.reason, rawError: result.rawError });
    res.json({ ok: true, messageId: result.messageId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/imessage/accounts — list all iMessage accounts
app.get('/api/imessage/accounts', requireRole('manager'), async (req, res) => {
  try {
    const accounts = await prisma.iMessageAccount.findMany({
      orderBy: { createdAt: 'asc' },
    });
    // Strip encrypted password from response
    res.json(accounts.map((a) => ({ ...a, password: undefined })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/imessage/accounts — add a new BlueBubbles server account
app.post('/api/imessage/accounts', requireRole('manager'), async (req, res) => {
  try {
    const { name, serverUrl, password, appleId, hourlyLimit, dailyLimit, enabled } = req.body;
    if (!name || !serverUrl || !password) {
      return res.status(400).json({ error: 'name, serverUrl, and password are required' });
    }

    const normalizedServerUrl = normalizeIMessageServerUrl(serverUrl);
    const account = await prisma.iMessageAccount.create({
      data: {
        name: String(name),
        serverUrl: normalizedServerUrl,
        password: imessageService.encryptPassword(String(password)),
        appleId: String(appleId || ''),
        hourlyLimit: parseInt(hourlyLimit) || 15,
        dailyLimit: parseInt(dailyLimit) || 100,
        enabled: enabled !== false,
      },
    });

    await imessageService.ping(account.id);
    const connectedAccount = await prisma.iMessageAccount.findUnique({ where: { id: account.id } });
    res.json({ ...connectedAccount, password: undefined });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/imessage/accounts/:id — update account settings
app.put('/api/imessage/accounts/:id', requireRole('manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid account ID' });
    const { name, serverUrl, password, appleId, hourlyLimit, dailyLimit, enabled } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = String(name);
    if (serverUrl !== undefined) updateData.serverUrl = normalizeIMessageServerUrl(serverUrl);
    if (password !== undefined && password !== '') {
      updateData.password = imessageService.encryptPassword(String(password));
    }
    if (appleId !== undefined) updateData.appleId = String(appleId);
    if (hourlyLimit !== undefined) updateData.hourlyLimit = parseInt(hourlyLimit);
    if (dailyLimit !== undefined) updateData.dailyLimit = parseInt(dailyLimit);
    if (enabled !== undefined) updateData.enabled = Boolean(enabled);

    const account = await prisma.iMessageAccount.update({
      where: { id },
      data: updateData,
    });

    res.json({ ...account, password: undefined });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/imessage/accounts/:id — remove account
app.delete('/api/imessage/accounts/:id', requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid account ID' });
    await prisma.iMessageAccount.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/imessage/accounts/:id/ping — manually test connectivity
app.post('/api/imessage/accounts/:id/ping', requireRole('manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid account ID' });
    const online = await imessageService.ping(id);
    res.json({ online, accountId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/imessage/send — send a one-off iMessage (from inbox / manual send)
app.post('/api/imessage/send', requireRole('agent'), async (req, res) => {
  try {
    const { leadId, message, accountId } = req.body;
    if (!leadId || !message) {
      return res.status(400).json({ error: 'leadId and message are required' });
    }

    const lead = await prisma.lead.findUnique({ where: { id: parseInt(leadId) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.mobile) return res.status(400).json({ error: 'Lead has no mobile number' });

    const result = await imessageService.sendMessage(lead.mobile, message, accountId || null);

    if (result.success) {
      const savedMsg = await prisma.message.create({
        data: {
          leadId: lead.id,
          direction: 'outbound',
          channel: 'imessage',
          imessageAccountId: result.accountId || null,
          imessageMessageId: result.messageId || null,
          content: message,
          status: 'sent',
          sentAt: new Date(),
        },
      });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { imessageStatus: 'sent', lastImessageAt: new Date() },
      });
      res.json({ success: true, message: savedMsg });
    } else {
      res.status(502).json({ success: false, reason: result.reason, error: result.rawError });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== A/B TESTING ========================
// GET /api/campaigns/:id/ab-results
app.get('/api/campaigns/:id/ab-results', requireRole('manager'), async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (!campaign.variantBTemplate) {
      return res.json({ abEnabled: false, message: 'No B variant configured for this campaign' });
    }

    const [aLeads, bLeads] = await Promise.all([
      prisma.campaignLead.count({ where: { campaignId, variant: 'A' } }),
      prisma.campaignLead.count({ where: { campaignId, variant: 'B' } }),
    ]);
    const [aReplied, bReplied] = await Promise.all([
      prisma.campaignLead.count({ where: { campaignId, variant: 'A', status: 'replied' } }),
      prisma.campaignLead.count({ where: { campaignId, variant: 'B', status: 'replied' } }),
    ]);

    res.json({
      abEnabled: true,
      campaignId,
      variantA: {
        template: campaign.messageTemplate.slice(0, 100) + '…',
        sent: aLeads,
        replied: aReplied,
        replyRate: aLeads > 0 ? Math.round((aReplied / aLeads) * 100) : 0,
      },
      variantB: {
        template: campaign.variantBTemplate.slice(0, 100) + '…',
        sent: bLeads,
        replied: bReplied,
        replyRate: bLeads > 0 ? Math.round((bReplied / bLeads) * 100) : 0,
      },
      winner: aReplied === bReplied ? 'tie' : aReplied > bReplied ? 'A' : 'B',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/campaigns/:id/test-send — send a test email using campaign's template + sender
app.post('/api/campaigns/:id/test-send', requireRole('manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (!['email', 'both'].includes(campaign.channel)) {
      return res.status(400).json({ error: 'Test-send is only available for email campaigns' });
    }
    if (!campaign.senderAccountId) {
      return res.status(400).json({ error: 'Campaign has no sender account. Select one before testing.' });
    }
    if (!campaign.messageTemplate) {
      return res.status(400).json({ error: 'Campaign has no message template' });
    }

    const senderAccount = await prisma.emailAccount.findUnique({ where: { id: campaign.senderAccountId } });
    if (!senderAccount || !senderAccount.enabled) {
      return res.status(400).json({ error: 'Sender account is disabled or not found' });
    }
    if (senderAccount.status !== 'verified') {
      return res.status(400).json({ error: 'Sender account is not verified. Test the connection first.' });
    }

    const testEmail = req.body.testEmail || req.user?.email;
    if (!testEmail) {
      return res.status(400).json({ error: 'No test email address provided and user has no email' });
    }

    // Render template with sample variables
    const renderedBody = campaign.messageTemplate
      .replace(/\{\{name\}\}/gi, 'Test Lead')
      .replace(/\{\{product\}\}/gi, 'Sample Product')
      .replace(/\{\{company\}\}/gi, 'Test Company')
      .replace(/\{\{country\}\}/gi, 'India')
      .replace(/\{\{quantity\}\}/gi, '100 units');

    const subject = campaign.emailSubject
      ? campaign.emailSubject
          .replace(/\{\{name\}\}/gi, 'Test Lead')
          .replace(/\{\{product\}\}/gi, 'Sample Product')
          .replace(/\{\{company\}\}/gi, 'Test Company')
      : `[TEST] Campaign: ${campaign.name}`;

    const result = await emailService.sendSystemEmail({
      to: testEmail,
      subject: `[TEST] ${subject}`,
      textBody: renderedBody,
      accountId: campaign.senderAccountId,
      tag: 'campaign-test',
    });

    logger.info(`🧪 Campaign ${id} test-send to ${testEmail} by ${req.user?.email || 'unknown'}`);
    res.json({ success: true, sentTo: testEmail, subject, messageId: result.messageId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== INBOUND WEBHOOKS ========================
app.get('/api/webhooks/sources', requireRole('manager'), async (req, res) => {
  try {
    const sources = await prisma.webhookSource.findMany({ orderBy: { createdAt: 'desc' } });
    // Never expose raw apiKey — send masked version
    res.json(sources.map((s) => ({ ...s, apiKey: s.apiKey.slice(0, 8) + '••••••••' })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/webhooks/sources/presets — built-in field maps for popular platforms
app.get('/api/webhooks/sources/presets', requireRole('admin'), (req, res) => {
  res.json([
    {
      id: 'justdial',
      name: 'JustDial',
      description: 'JustDial Lead Push API — receives leads from their CRM push',
      fieldMap: {
        name: 'sender_name',
        mobile: 'sender_mobile',
        email: 'sender_email',
        company: 'company_name',
        product: 'cat',
        country: 'sender_country',
        quantity: 'quantity',
      },
      responseFormat: 'json',
      notes: 'JustDial sends POST with Content-Type: application/x-www-form-urlencoded. ' +
             'Set the push URL in JustDial Business panel → Settings → Lead Push URL.',
    },
    {
      id: 'tradeindia',
      name: 'TradeIndia',
      description: 'TradeIndia Lead Notification Webhook',
      fieldMap: {
        name: 'Name',
        mobile: 'Mobile',
        email: 'Email',
        company: 'CompanyName',
        product: 'Subject',
        country: 'Country',
        quantity: 'Quantity',
      },
      responseFormat: 'json',
      notes: 'TradeIndia sends JSON POST. Configure webhook URL in TradeIndia Seller Dashboard.',
    },
    {
      id: 'indiamart',
      name: 'IndiaMART (Webhook)',
      description: 'IndiaMART Lead Manager pushes each new enquiry to this URL',
      // IndiaMART's Push API wraps the lead: {CODE, STATUS, RESPONSE: {...}}.
      fieldMap: {
        name: 'RESPONSE.SENDER_NAME',
        mobile: 'RESPONSE.SENDER_MOBILE',
        email: 'RESPONSE.SENDER_EMAIL',
        company: 'RESPONSE.SENDER_COMPANY',
        product: 'RESPONSE.QUERY_PRODUCT_NAME',
        country: 'RESPONSE.SENDER_COUNTRY_ISO',
      },
      responseFormat: 'json',
      notes: 'IndiaMART seller panel → Lead Manager → Import/Export Leads → Push API → Other. IndiaMART sends no auth header, so paste the webhook URL with ?apiKey=<key> on the end.',
    },
    {
      id: 'facebook',
      name: 'Facebook Lead Ads',
      description: 'Facebook Lead Ads via Zapier/Make webhook bridge',
      fieldMap: {
        name: 'full_name',
        mobile: 'phone_number',
        email: 'email',
        company: 'company_name',
        product: 'what_product',
        country: 'country',
      },
      responseFormat: 'json',
      notes: 'Use Zapier or Make.com to forward Facebook Lead Ads to this webhook. ' +
             'Map "full_name" from the lead form field names.',
    },
    {
      id: 'website',
      name: 'Website Contact Form',
      description: 'Generic website form (works with any form builder)',
      fieldMap: {
        name: 'name',
        mobile: 'phone',
        email: 'email',
        company: 'company',
        product: 'message',
        country: 'country',
      },
      responseFormat: 'json',
      notes: 'Point your form POST action to this webhook URL with x-api-key header.',
    },
  ]);
});

// POST /api/webhooks/sources/from-preset — auto-create source from a preset
app.post('/api/webhooks/sources/from-preset', requireRole('admin'), async (req, res) => {
  try {
    const { presetId, name } = req.body;
    if (!presetId) return res.status(400).json({ error: 'presetId required' });

    const PRESETS = {
      justdial:   { name: 'JustDial', fieldMap: { name:'sender_name', mobile:'sender_mobile', email:'sender_email', company:'company_name', product:'cat', country:'sender_country' } },
      tradeindia: { name: 'TradeIndia', fieldMap: { name:'Name', mobile:'Mobile', email:'Email', company:'CompanyName', product:'Subject', country:'Country', quantity:'Quantity' } },
      indiamart:  { name: 'IndiaMART (Webhook)', fieldMap: { name:'RESPONSE.SENDER_NAME', mobile:'RESPONSE.SENDER_MOBILE', email:'RESPONSE.SENDER_EMAIL', company:'RESPONSE.SENDER_COMPANY', product:'RESPONSE.QUERY_PRODUCT_NAME', country:'RESPONSE.SENDER_COUNTRY_ISO' } },
      facebook:   { name: 'Facebook Lead Ads', fieldMap: { name:'full_name', mobile:'phone_number', email:'email', company:'company_name', product:'what_product', country:'country' } },
      website:    { name: 'Website Form', fieldMap: { name:'name', mobile:'phone', email:'email', company:'company', product:'message', country:'country' } },
      // Engyne Cloud posts an envelope, not a flat body: the buyer sits under
      // data.lead.*, which is why these are dot paths. The inbound handler
      // resolves them; a flat key here would match nothing and every lead
      // would fail the "mobile or email" check.
      engyne:     { name: 'Engyne Cloud', fieldMap: { name:'data.lead.buyerName', mobile:'data.lead.buyerMobile', email:'data.lead.buyerEmail', company:'data.lead.buyerCompany', product:'data.lead.title', country:'data.lead.country', quantity:'data.lead.quantityRaw' } },
    };

    const preset = PRESETS[presetId];
    if (!preset) return res.status(404).json({ error: `Unknown preset: ${presetId}` });

    const apiKey = randomBytes(24).toString('hex');
    const slug = presetId + '-' + Date.now().toString(36);

    const ws = await prisma.webhookSource.create({
      data: {
        name: name || preset.name,
        source: slug,
        apiKey,
        fieldMap: JSON.stringify(preset.fieldMap),
        enabled: true,
      },
    });

    res.json({
      ...ws,
      apiKey, // return full key once
      webhookUrl: `/api/webhooks/inbound/${slug}`,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/webhooks/sources', requireRole('admin'), async (req, res) => {
  try {
    const { name, source, fieldMap = {}, poolId } = req.body;
    if (!name || !source) return res.status(400).json({ error: 'name and source slug required' });
    const slug = source.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const apiKey = randomBytes(24).toString('hex');
    const ws = await prisma.webhookSource.create({
      data: {
        name, source: slug, apiKey,
        fieldMap: JSON.stringify(fieldMap),
        poolId: poolId ? parseInt(poolId) : null,
      },
    });
    res.json({ ...ws, apiKey }); // return full key once on creation
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Source slug already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/webhooks/sources/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, fieldMap, enabled, poolId } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (enabled !== undefined) data.enabled = Boolean(enabled);
    if (fieldMap !== undefined) data.fieldMap = JSON.stringify(fieldMap);
    if (poolId !== undefined) data.poolId = poolId ? parseInt(poolId) : null;
    const ws = await prisma.webhookSource.update({ where: { id: parseInt(req.params.id) }, data });
    res.json({ ...ws, apiKey: ws.apiKey.slice(0, 8) + '••••••••' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/webhooks/sources/:id', requireRole('admin'), async (req, res) => {
  try {
    await prisma.webhookSource.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Inbound lead webhook — called by JustDial, TradeIndia, website forms, etc.
// ======================== NOTES ========================
app.get('/api/leads/:id/notes', async (req, res) => {
  try {
    const notes = await prisma.leadNote.findMany({
      where: { leadId: parseInt(req.params.id) },
      orderBy: { createdAt: 'desc' },
    });
    res.json(notes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads/:id/notes', requireRole('agent'), async (req, res) => {
  try {
    const { content, type = 'note' } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content required' });
    const note = await prisma.leadNote.create({
      data: { leadId: parseInt(req.params.id), content: content.trim(), type },
    });
    res.json(note);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/leads/:id/notes/:noteId', requireRole('agent'), async (req, res) => {
  try {
    await prisma.leadNote.delete({ where: { id: parseInt(req.params.noteId) } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ======================== TASKS ========================
app.get('/api/leads/:id/tasks', async (req, res) => {
  try {
    const tasks = await prisma.leadTask.findMany({
      where: { leadId: parseInt(req.params.id) },
      orderBy: [{ done: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(tasks);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads/:id/tasks', requireRole('agent'), async (req, res) => {
  try {
    const { title, dueAt } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title required' });
    const task = await prisma.leadTask.create({
      data: { leadId: parseInt(req.params.id), title: title.trim(), dueAt: dueAt ? new Date(dueAt) : null },
    });
    res.json(task);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/leads/:id/tasks/:taskId', requireRole('agent'), async (req, res) => {
  try {
    const { done, title, dueAt } = req.body;
    const data = {};
    if (done !== undefined) data.done = Boolean(done);
    if (title !== undefined) data.title = title;
    if (dueAt !== undefined) data.dueAt = dueAt ? new Date(dueAt) : null;
    const task = await prisma.leadTask.update({ where: { id: parseInt(req.params.taskId) }, data });
    res.json(task);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/leads/:id/tasks/:taskId', requireRole('agent'), async (req, res) => {
  try {
    await prisma.leadTask.delete({ where: { id: parseInt(req.params.taskId) } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Global task list (overdue + upcoming) for sidebar badge
app.get('/api/tasks', async (req, res) => {
  try {
    const now = new Date();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const showDone = req.query.done === 'true';
    const where = showDone ? {} : { done: false };
    const tasks = await prisma.leadTask.findMany({
      where,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });
    // Attach lead name
    const leadIds = [...new Set(tasks.map((t) => t.leadId))];
    const leads = await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } });
    const leadMap = Object.fromEntries(leads.map((l) => [l.id, l.name]));
    const enriched = tasks.map((t) => ({ ...t, leadName: leadMap[t.leadId] || '—', overdue: t.dueAt && t.dueAt < now }));
    res.json({ tasks: enriched, overdueCount: enriched.filter((t) => t.overdue).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ======================== STUB ROUTES (NOT YET IMPLEMENTED) ========================
// These return structured 501 responses so the frontend fails gracefully instead of silent 404s.

const notImplemented = (feature) => (req, res) => {
  res.status(501).json({ error: `${feature} is not yet implemented`, code: 'NOT_IMPLEMENTED' });
};

// Team management (still stubbed for the group-level routes not yet in scope)
app.get('/api/team/summary', requireRole('manager'), notImplemented('Team summary'));
app.get('/api/team/members', requireRole('manager'), notImplemented('Team members'));
app.post('/api/team/members', requireRole('admin'), notImplemented('Invite team member'));
app.patch('/api/team/members/:id', requireRole('admin'), notImplemented('Update team member'));
app.delete('/api/team/members/:id', requireRole('admin'), notImplemented('Remove team member'));

// ── Team Invitations ────────────────────────────────────────────────────────

// GET /api/team/invitations — list pending (not yet accepted, not expired) invitations
app.get('/api/team/invitations', requireRole('manager'), async (req, res) => {
  // Email invitations are a Clerk feature. With built-in sign-in an admin adds
  // teammates directly (POST /api/users), so there is never anything pending.
  if (!clerkClient) return res.json([]);
  try {
    const result = await clerkClient.organizations.getOrganizationInvitationList({
      organizationId: req.user.orgId,
      status: ['pending'],
    });
    res.json(result.data.map((inv) => ({
      id: inv.id,
      email: inv.emailAddress,
      role: String(inv.role).replace(/^org:/, ''),
      createdAt: new Date(inv.createdAt).toISOString(),
      expiresAt: new Date(inv.expiresAt).toISOString(),
      // Clerk's list already excludes expired/accepted/revoked via status: ['pending'].
      expired: false,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/team/invitations — invite someone into the caller's Clerk organization.
// Clerk sends and hosts the whole email + accept flow; nothing local to track.
app.post('/api/team/invitations', requireRole('admin'), async (req, res) => {
  if (!clerkClient) {
    return res.status(409).json({
      error: 'Email invitations need Clerk sign-in. Add the teammate under Team → Users with a starting password instead.',
      code: 'INVITES_REQUIRE_CLERK',
    });
  }
  try {
    const { email, role = 'agent' } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });
    const orgRole = role.startsWith('org:') ? role : `org:${role}`;

    const invitation = await clerkClient.organizations.createOrganizationInvitation({
      organizationId: req.user.orgId,
      emailAddress: email.toLowerCase(),
      role: orgRole,
      inviterUserId: req.user.id,
    });

    res.status(201).json({
      invitation: { id: invitation.id, email: invitation.emailAddress, role, createdAt: new Date(invitation.createdAt).toISOString(), expired: false },
      emailSent: true,
    });
  } catch (e) {
    // Clerk's Backend API errors carry { errors: [{ longMessage }] }, e.g. "already a member".
    const msg = e?.errors?.[0]?.longMessage || e.message;
    res.status(e?.status && e.status >= 400 && e.status < 600 ? e.status : 500).json({ error: msg });
  }
});

// DELETE /api/team/invitations/:id — revoke a pending Clerk invitation
app.delete('/api/team/invitations/:id', requireRole('admin'), async (req, res) => {
  if (!clerkClient) return res.status(404).json({ error: 'Invitation not found' });
  try {
    await clerkClient.organizations.revokeOrganizationInvitation({
      organizationId: req.user.orgId,
      invitationId: req.params.id,
      requestingUserId: req.user.id,
    });
    res.json({ ok: true });
  } catch (e) {
    if (e?.status === 404) return res.status(404).json({ error: 'Invitation not found' });
    res.status(e?.status && e.status >= 400 && e.status < 600 ? e.status : 500).json({ error: e.message });
  }
});

// Invitation acceptance is now Clerk's own hosted ticket-accept flow —
// see the invitation `url` Clerk returns from POST /api/team/invitations.
// No local route needed.

// Lead sync profiles
app.get('/api/lead-sync/stats', notImplemented('Lead sync stats'));
app.get('/api/lead-sync/presets', notImplemented('Lead sync presets'));
app.get('/api/lead-sync/profiles', notImplemented('Lead sync profiles'));
app.post('/api/lead-sync/profiles', requireRole('manager'), notImplemented('Create lead sync profile'));
app.patch('/api/lead-sync/profiles/:id', requireRole('manager'), notImplemented('Update lead sync profile'));
app.delete('/api/lead-sync/profiles/:id', requireRole('manager'), notImplemented('Delete lead sync profile'));
app.get('/api/lead-sync/deliveries', notImplemented('Lead sync deliveries'));

// POST /api/lead-sync/run — backfill: push all leads in the pool as 'lead.created' events
app.post('/api/lead-sync/run', requireRole('manager'), async (req, res) => {
  try {
    const poolId = req.query.poolId ? parseInt(req.query.poolId) : undefined;
    const leads = await prisma.lead.findMany({
      where: poolId ? { poolId } : {},
      select: {
        id: true, name: true, company: true, mobile: true, country: true,
        product: true, status: true, score: true, leadTier: true, source: true,
        dealValue: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const count = leads.length;
    // Dispatch asynchronously — don't block the HTTP response on large pools
    setImmediate(async () => {
      for (const lead of leads) {
        await sheetsSync.dispatch('lead.created', lead).catch(() => {});
      }
    });
    res.json({ ok: true, count, message: `Dispatching ${count} leads to Google Sheets in the background.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// POST /api/email/accounts/test-config — validate SMTP creds without persisting
// Body: { provider, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure? }
app.post('/api/email/accounts/test-config', requireRole('manager'), async (req, res) => {
  try {
    const { smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure = false } = req.body;
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return res.status(400).json({ success: false, error: 'smtpHost, smtpPort, smtpUser, smtpPass are required' });
    }
    const { createTransport } = await import('nodemailer');
    const transport = createTransport({
      host: smtpHost,
      port: parseInt(smtpPort),
      secure: Boolean(smtpSecure),
      auth: { user: smtpUser, pass: smtpPass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    try {
      await transport.verify();
      res.json({ success: true });
    } catch (e) {
      res.json({ success: false, error: e.message });
    } finally {
      transport.close();
    }
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── SPA catch-all — serve index.html for all non-API routes ──────────────────
// Enables client-side routing on the dashboard.
// Placed after all /api/* routes so API paths are never caught here.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(WEB_DIST, 'index.html'));
});

// ── Global error handler — sanitize errors in production ──────────────────────
app.use((err, req, res, _next) => {
  logger.error(`Unhandled error on ${req.method} ${req.path}: ${err.message}`);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
});

export default app;
