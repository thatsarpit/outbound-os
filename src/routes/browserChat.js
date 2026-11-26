import { createHash, randomBytes } from 'node:crypto';
import { Router, json } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';
import { workspaceMemberIdentity } from '../utils/workspaceMember.js';

const identityPattern = /^[A-Za-z0-9_-]{43}$/;
const requestPattern = /^[a-z0-9_-]{16,80}$/i;
const digest = secret => createHash('sha256').update(secret).digest('hex');
const positive = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const active = (now) => ({ revokedAt: null, expiresAt: { gt: now } });
const chatFields = { id: true, createdAt: true, expiresAt: true, revokedAt: true };
const messageFields = { id: true, content: true, direction: true, createdAt: true };

function noStore(_req, res, next) {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
  next();
}

function validMessage(body) {
  return typeof body?.content === 'string' && body.content.trim().length > 0 &&
    body.content.length <= 4000 && typeof body.clientMessageId === 'string' && requestPattern.test(body.clientMessageId);
}

async function saveMessage(tx, chat, direction, body, now) {
  const key = `browser-chat:${chat.id}:${direction}:${body.clientMessageId}`;
  const content = body.content.trim();
  const prior = await tx.message.findUnique({ where: { manualSendKey: key }, select: messageFields });
  if (prior) return prior.content === content ? { message: prior, duplicate: true } : { conflict: true };
  const message = await tx.message.create({
    data: { leadId: chat.leadId, browserChatId: chat.id, channel: 'webchat', direction,
      content, status: 'delivered', sentAt: now, manualSendKey: key },
    select: messageFields,
  });
  await tx.lead.updateMany({
    where: { id: chat.leadId, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: now } }] },
    data: { lastMessageAt: now },
  });
  if (direction === 'inbound') {
    await tx.lead.updateMany({ where: { id: chat.leadId, status: { in: ['new', 'contacted', 'wa_unavailable', 'wa_undelivered'] } }, data: { status: 'replied', repliedAt: now } });
    await tx.message.updateMany({
      where: { leadId: chat.leadId, direction: 'outbound', status: 'queued', OR: [
        { automationKey: { not: null } }, { campaignId: { not: null } },
      ] },
      data: { status: 'cancelled', providerStatusReason: 'human_reply_received' },
    });
  }
  return { message, duplicate: false };
}

function sendResult(res, result) {
  if (!result) return res.status(404).json({ error: 'This chat link is no longer available.' });
  if (result.conflict) return res.status(409).json({ error: 'This message action was already used.' });
  return res.status(result.duplicate ? 200 : 201).json(result);
}

export function createBrowserChatRouters({ db = prisma, guard = requireRole, env = process.env,
  now = () => new Date(), notify = () => {} } = {}) {
  const guest = Router();
  const staff = Router();
  const failure = (error, _req, res, _next) => {
    if (error.status === 413) return res.status(413).json({ error: 'The message is too large.' });
    if (error.status === 400) return res.status(400).json({ error: 'The message is invalid.' });
    return res.status(503).json({ error: 'Chat is temporarily unavailable. Try again.' });
  };
  const handle = action => (req, res, next) => Promise.resolve(action(req, res)).catch(next);
  const feature = (_req, res, next) => !env.OUTBOUNDOS_WORKSPACE_ID && env.OUTBOUNDOS_BROWSER_CHAT === 'true'
    ? next() : res.status(404).json({ error: 'Browser chat is unavailable.' });

  guest.use(noStore, feature, rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false }));
  guest.use((req, res, next) => {
    const token = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (!token || !identityPattern.test(token)) return res.status(404).json({ error: 'This chat link is no longer available.' });
    req.chatTokenHash = digest(token);
    next();
  });
  guest.post('/messages', rateLimit({ windowMs: 60_000, limit: 12,
    keyGenerator: req => req.chatTokenHash, standardHeaders: 'draft-8', legacyHeaders: false }), json({ limit: '20kb' }), handle(async (req, res) => {
    if (!validMessage(req.body)) return res.status(400).json({ error: 'Enter a message up to 4,000 characters.' });
    const time = now();
    const data = await db.$transaction(async tx => {
      const chat = await tx.browserChat.findUnique({ where: { tokenHash: req.chatTokenHash, ...active(time) }, select: { id: true, leadId: true } });
      if (!chat) return null;
      const result = await saveMessage(tx, chat, 'inbound', req.body, time);
      return { ...result, leadId: chat.leadId };
    });
    if (data?.message && !data.duplicate) notify(data.leadId);
    return sendResult(res, data && { message: data.message, duplicate: data.duplicate, conflict: data.conflict });
  }));
  guest.get('/messages', handle(async (req, res) => {
    const chat = await db.browserChat.findUnique({
      where: { tokenHash: req.chatTokenHash, ...active(now()) },
      select: { messages: { orderBy: { id: 'desc' }, take: 100, select: messageFields } },
    });
    if (!chat) return res.status(404).json({ error: 'This chat link is no longer available.' });
    res.json({ messages: chat.messages.reverse() });
  }));
  guest.use(failure);

  staff.use(noStore, feature, guard('agent'));
  staff.use((req, res, next) => {
    const who = workspaceMemberIdentity(req.user, env);
    if (!who || req.user.delegated) return res.status(403).json({ error: 'Sign in personally to manage Browser chat.' });
    req.chatStaff = who.key;
    next();
  });
  staff.get('/:leadId', handle(async (req, res) => {
    const leadId = positive(req.params.leadId);
    if (!leadId) return res.status(400).json({ error: 'Choose a lead.' });
    const chats = await db.browserChat.findMany({ where: { leadId }, select: chatFields, orderBy: { id: 'desc' }, take: 30 });
    res.json({ chats });
  }));
  staff.post('/:leadId', handle(async (req, res) => {
    const leadId = positive(req.params.leadId);
    if (!leadId || !await db.lead.findUnique({ where: { id: leadId }, select: { id: true } })) {
      return res.status(404).json({ error: 'Lead not found.' });
    }
    const token = randomBytes(32).toString('base64url');
    const time = now();
    const chat = await db.$transaction(async tx => {
      await tx.browserChat.updateMany({ where: { leadId, ...active(time) }, data: { revokedAt: time } });
      return tx.browserChat.create({
        data: { leadId, tokenHash: digest(token), createdBy: req.chatStaff, expiresAt: new Date(+time + 24 * 3600_000) },
        select: chatFields,
      });
    });
    res.status(201).json({ chat, token });
  }));
  staff.delete('/:leadId/:chatId', handle(async (req, res) => {
    const leadId = positive(req.params.leadId), id = positive(req.params.chatId);
    if (!leadId || !id) return res.status(400).json({ error: 'Choose a lead and chat.' });
    const result = await db.browserChat.updateMany({ where: { id, leadId, ...active(now()) }, data: { revokedAt: now() } });
    res.json({ revoked: Boolean(result.count) });
  }));
  staff.post('/:leadId/:chatId/messages', handle(async (req, res) => {
    const leadId = positive(req.params.leadId), id = positive(req.params.chatId);
    if (!leadId || !id || !validMessage(req.body)) return res.status(400).json({ error: 'Choose a chat and enter a message up to 4,000 characters.' });
    const time = now();
    const data = await db.$transaction(async tx => {
      const chat = await tx.browserChat.findUnique({ where: { id, leadId, ...active(time) }, select: { id: true, leadId: true } });
      return chat ? saveMessage(tx, chat, 'outbound', req.body, time) : null;
    });
    if (data?.message && !data.duplicate) notify(leadId);
    return sendResult(res, data);
  }));
  staff.use(failure);
  return { guest, staff };
}
