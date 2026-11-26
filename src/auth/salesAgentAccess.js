import prisma from '../utils/prismaClient.js';
import { leadAssignmentWhere, memberAssignmentWhere } from '../utils/workspaceMember.js';

export function privateSalesEnabled(env = process.env) {
  return Boolean(env.OUTBOUNDOS_AGENT_INBOUND_SINCE?.trim());
}

export function isPrivateSalesAgent(user, env = process.env) {
  return privateSalesEnabled(env) && user?.role === 'agent';
}

export function claimableInboundWhere(env = process.env) {
  const cutoff = Date.parse(env.OUTBOUNDOS_AGENT_INBOUND_SINCE || '');
  // Invalid or absent cutoff opens no claimable work.
  if (!Number.isFinite(cutoff)) return { id: { in: [] } };
  return {
    ...leadAssignmentWhere(false),
    createdAt: { gte: new Date(cutoff) },
    inboxResolvedAt: null,
    status: { notIn: ['closed', 'paused', 'lost'] },
    messages: { none: { direction: 'outbound' } },
    OR: [
      { source: 'whatsapp_inbound', messages: { some: { channel: 'whatsapp', direction: 'inbound' } } },
      { source: 'browser_chat_widget', messages: { some: { channel: 'webchat', direction: 'inbound' } } },
    ],
  };
}

export function salesAgentLeadScope(req) {
  return req.privateSalesAgent ? memberAssignmentWhere(req.user) : {};
}

const workspaceReads = new Set([
  '/auth/me', '/system/version', '/config/brand', '/inbox/channel-health', '/inbox/threads',
  '/inbox/claimable', '/leads', '/tasks',
]);

// Keep the entire workspace API closed to restricted agents unless a handler
// is expressly safe for shared reads or is bound to one owned lead.
export function privateSalesAccess({ db = prisma, env = process.env } = {}) {
  return async (req, res, next) => {
    if (!isPrivateSalesAgent(req.user, env)) return next();
    req.privateSalesAgent = true;
    res.set('Cache-Control', 'private, no-store');
    const { method, path } = req;
    const fail = () => res.status(403).json({ error: 'This action is outside your sales workspace access.' });
    if (method === 'GET' && workspaceReads.has(path)) return next();
    if (method === 'POST' && /^\/inbox\/threads\/[1-9]\d*\/assign-self$/.test(path)) return next();

    let id;
    const browserChat = path.match(/^\/browser-chats\/([1-9]\d*)(?:\/([1-9]\d*)(\/messages)?)?$/);
    if (browserChat && (
      (!browserChat[2] && ['GET', 'POST'].includes(method)) ||
      (browserChat[2] && !browserChat[3] && method === 'DELETE') ||
      (browserChat[3] && method === 'POST')
    )) {
      id = browserChat[1];
    } else if (method === 'GET') {
      id = path.match(/^\/inbox\/threads?\/([1-9]\d*)(?:\/messages)?$/)?.[1]
        ?? path.match(/^\/leads\/([1-9]\d*)(?:\/(?:notes|tasks|timeline|messages))?$/)?.[1];
      if (path === '/inbox/senders') id = req.query.leadId;
    } else if (method === 'POST') {
      id = path.match(/^\/inbox\/threads\/([1-9]\d*)\/(?:read|resolve|reopen|messages\/[1-9]\d*\/reaction)$/)?.[1]
        ?? path.match(/^\/leads\/([1-9]\d*)\/(?:notes|tasks)$/)?.[1];
      if (path === '/inbox/send') {
        const { leadId, channel, attachmentIds, scheduledAt, templateId, whatsappTemplate, cc, bcc } = req.body || {};
        if (!['whatsapp', 'email'].includes(channel) || attachmentIds?.length || scheduledAt || templateId || whatsappTemplate || cc || bcc) return fail();
        if (channel === 'whatsapp') delete req.body.accountId;
        id = leadId;
      }
    } else if (method === 'PATCH') {
      id = path.match(/^\/leads\/([1-9]\d*)(?:\/(?:deal|tasks\/[1-9]\d*))?$/)?.[1];
      if (/^\/leads\/[1-9]\d*$/.test(path) &&
          Object.keys(req.body || {}).some(key => !['name', 'company', 'product', 'country', 'quantity', 'status', 'notes'].includes(key))) return fail();
    } else if (method === 'DELETE') {
      id = path.match(/^\/leads\/([1-9]\d*)\/(?:notes|tasks)\/[1-9]\d*$/)?.[1];
    }
    const leadId = Number(id);
    if ((typeof id !== 'string' && typeof id !== 'number') || !/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(leadId)) return fail();
    try {
      const lead = await db.lead.findFirst({ where: { id: leadId, ...memberAssignmentWhere(req.user, env) }, select: { id: true } });
      if (!lead) return res.status(404).json({ error: 'Lead not found.' });
      return next();
    } catch (error) {
      return res.status(error.statusCode || 503).json({ error: 'Could not verify lead access.' });
    }
  };
}
