import { z } from 'zod';
import { get, post, mcpRequestContext } from '../client.js';
import { ok, err } from '../schemas/common.js';

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function registerSystemTools(server) {
  server.tool('verify_email_addresses', 'Start a free background email check for selected lead IDs, pasted addresses, or all lead emails. Checks syntax, disposable domains and MX; does not send mail or prove mailbox existence. Use before populating an email campaign.', {
    lead_ids: z.array(z.number().int().positive()).max(20000).optional(),
    emails: z.array(z.string().max(320)).max(20000).optional(),
    all_leads: z.boolean().optional(),
  }, async ({ lead_ids, emails, all_leads }) => {
    try { const { data } = await post('/api/email/verification/jobs', {
      ...(lead_ids !== undefined ? { leadIds: lead_ids } : {}),
      ...(emails !== undefined ? { emails } : {}),
      ...(all_leads !== undefined ? { allLeads: all_leads } : {}),
    }); return ok(data); } catch (error) { return err(error.message); }
  });
  server.tool('email_verification_status', 'Read email verification batches or paginated results. Mail domain ready is not confirmation of an individual mailbox. Unknown/invalid/unchecked addresses are excluded from protected email campaign audiences.', {
    job_id: z.string().uuid().optional(), page: z.number().int().min(1).max(400).optional(),
  }, async ({ job_id, page = 1 }) => {
    try { const { data } = await get(job_id ? `/api/email/verification/jobs/${encodeURIComponent(job_id)}?page=${page}` : '/api/email/verification/jobs'); return ok(data); }
    catch (error) { return err(error.message); }
  });
  server.tool('email_accounts', 'List sending email account IDs and readiness without credentials.', {}, async () => {
    try {
      const { data } = await get('/api/email/accounts');
      return ok(data.map(a => ({ id: a.id, name: a.name, email: a.email, enabled: a.enabled,
        provider: a.provider, status: a.status, dailyLimit: a.dailyLimit, sentToday: a.sentToday,
        whatsappAccountId: a.whatsappAccountId })));
    } catch (e) { return err(e.message); }
  });

  // ── system_status ──
  server.tool(
    'system_status',
    'Get connected/enabled WhatsApp account counts and active dashboard connections.',
    {},
    async () => {
      try {
        const { data } = await get('/api/system/status');
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );

  // ── system_pause_resume ──
  server.tool(
    'system_pause_resume',
    'Pause or resume the automated message sending queue. When paused, no automated messages (followups, campaigns) are sent.',
    {
      action: z.enum(['pause', 'resume']).describe('pause to stop sending, resume to restart'),
    },
    async ({ action }) => {
      try {
        const { data } = await post(`/api/system/${action}`);
        return ok({ sendingPaused: data.sendingPaused });
      } catch (e) { return err(e.message); }
    },
  );

  // ── whatsapp_accounts ──
  server.tool(
    'whatsapp_accounts',
    'List all WhatsApp accounts with connection status and daily send counts',
    {},
    async () => {
      try {
        const { data } = await get('/api/whatsapp/accounts');
        return ok(data.map(a => ({
          id: a.id,
          label: a.name || a.label || `WhatsApp #${a.id}`,
          status: a.status ?? null,
          provider: a.provider ?? null,
          phone: a.phone,
          enabled: a.enabled,
          isReady: a.isReady,
          dailyLimit: a.dailyLimit,
          messagesSentToday: a.messagesSentToday,
        })));
      } catch (e) { return err(e.message); }
    },
  );

  // ── whatsapp_templates ──
  server.tool(
    'whatsapp_templates',
    'List approved Meta WhatsApp templates for a sending account, including language, category and body variables. Use before creating a WhatsApp campaign.',
    { account_id: z.number().int().positive().describe('WhatsApp account ID from whatsapp_accounts') },
    async ({ account_id }) => {
      try {
        const { data } = await get(`/api/whatsapp/accounts/${account_id}/templates`);
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );

  // ── list_users ──
  server.tool(
    'list_users',
    'List workspace members. In legacy mode, memberKey identifies the exact provider-scoped target for lead_assign; local members also retain numeric IDs. Personal read-only connections list existing local users and cannot assign leads.',
    {},
    async () => {
      try {
        if (!mcpRequestContext.getStore()?.personalToken || mcpRequestContext.getStore()?.personalScope?.split(' ').includes('mcp:write')) {
          try {
            const { data } = await get('/api/workspace/members');
            if (!Array.isArray(data?.members)) throw new Error('The workspace member response was incomplete. Try again after checking the API version.');
            return ok(data.members.map(member => ({
              id: member.provider === 'local' ? Number(member.externalId) : member.externalId,
              memberKey: member.key, provider: member.provider, orgId: member.orgId,
              name: member.name, email: member.email, role: member.role,
            })));
          } catch (error) {
            // A staggered rollout may still run an API without the directory.
            // Permission or provider failures must not fall back to a different identity list.
            if (error.status !== 404) throw error;
          }
        }
        const { data } = await get('/api/users');
        // The API returns an array. Accept the older envelope as well so a
        // staggered API/MCP upgrade does not turn a successful read into an
        // invalid MCP response containing undefined text.
        const users = Array.isArray(data) ? data : data?.users;
        if (!Array.isArray(users)) throw new Error('The team response was incomplete. Try again after checking the API version.');
        return ok(users.filter(user => user.enabled !== false));
      } catch (e) { return err(e.message); }
    },
  );
}
