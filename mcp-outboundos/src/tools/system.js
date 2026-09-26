import { z } from 'zod';
import { get, post } from '../client.js';
import { ok, err } from '../schemas/common.js';

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function registerSystemTools(server) {

  // ── system_status ──
  server.tool(
    'system_status',
    'Get system status — sending pause state, connected WhatsApp accounts, dashboard connections, LLM usage',
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
          label: a.label,
          phone: a.phone,
          enabled: a.enabled,
          isReady: a.isReady,
          dailyLimit: a.dailyLimit,
          messagesSentToday: a.messagesSentToday,
        })));
      } catch (e) { return err(e.message); }
    },
  );

  // ── list_users ──
  server.tool(
    'list_users',
    'List all enabled team members (for assignment and team management)',
    {},
    async () => {
      try {
        const { data } = await get('/api/users');
        return ok(data.users);
      } catch (e) { return err(e.message); }
    },
  );
}
