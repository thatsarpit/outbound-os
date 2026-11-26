import { z } from 'zod';
import { get, mcpRequestContext } from '../client.js';
import { err, ok, Page } from '../schemas/common.js';

const Limit = z.number().int().min(1).max(50).default(20).describe('Results per page (maximum 50)');
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const hasPersonalConnection = () => Boolean(mcpRequestContext.getStore()?.personalToken);

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function registerTriageTools(server) {
  server.tool(
    'list_inbox_threads',
    'List one page of the dashboard inbox, with reply-needed state, latest message channel and successful outreach channels. Use needs_reply to find conversations requiring a response. No messages are sent, resolved or marked read.',
    {
      state: z.enum(['needs_reply', 'waiting', 'resolved', 'open', 'all']).default('needs_reply'),
      channel: z.enum(['whatsapp', 'email', 'imessage', 'telegram']).optional()
        .describe('Filter the queue by channel. The successful outreach history still includes other channels.'),
      assignment: z.enum(['workspace', 'mine', 'unassigned']).default('workspace')
        .describe('Mine requires a personal MCP connection.'),
      search: z.string().trim().min(1).max(160).optional(),
      include_preview: z.boolean().default(false).describe('Include up to 240 characters from the latest inbox message.'),
      page: Page,
      limit: Limit,
    },
    readOnly,
    async ({ state, channel, assignment, search, include_preview, page, limit }) => {
      const personal = hasPersonalConnection();
      if (assignment === 'mine' && !personal) {
        return err('Use a personal MCP connection to see your assignments, or choose workspace or unassigned.');
      }
      try {
        const { data } = await get('/api/inbox/threads', {
          state, channel, search, page, limit,
          assignedToMe: assignment === 'mine' ? true : undefined,
          assigned: assignment === 'unassigned' ? false : undefined,
        });
        if (!Array.isArray(data?.threads)) return err('The inbox response is unavailable. Check the connected API release.');
        return ok({
          page: data.page,
          pages: data.pages,
          total: data.total,
          counts: {
            all: data.counts?.all ?? null,
            needsReply: data.counts?.needsReply ?? data.needsReply ?? null,
            waiting: data.counts?.waiting ?? null,
            resolved: data.counts?.resolved ?? null,
            unread: personal ? data.unread ?? null : null,
          },
          threads: data.threads.map(thread => ({
            leadId: thread.leadId,
            leadName: thread.leadName,
            leadCompany: thread.leadCompany,
            leadStatus: thread.status ?? null,
            threadState: thread.threadState,
            replyNeeded: thread.replyNeeded,
            unread: personal ? thread.unread ?? null : null,
            assignmentState: thread.assignmentState,
            assigneeName: thread.assignedMember?.name ?? null,
            latestChannel: thread.channel,
            outreachChannels: Array.isArray(thread.outreachChannels) ? thread.outreachChannels : null,
            lastMessageAt: thread.lastMessageAt,
            ...(include_preview ? { preview: String(thread.lastMessagePreview ?? '').slice(0, 240) } : {}),
          })),
        });
      } catch (error) {
        return err(error.message);
      }
    },
  );

  server.tool(
    'list_follow_up_tasks',
    'List one page of pending follow-up tasks from the dashboard. Today and upcoming use the workspace calendar. Use this to see callbacks and other promised follow-ups without editing or completing tasks.',
    {
      due: z.enum(['overdue', 'today', 'upcoming', 'unscheduled', 'all']).default('all'),
      scope: z.enum(['workspace', 'mine']).default('workspace')
        .describe('Mine shows tasks for your assigned leads and requires a personal MCP connection.'),
      page: Page,
      limit: Limit,
    },
    readOnly,
    async ({ due, scope, page, limit }) => {
      if (scope === 'mine' && !hasPersonalConnection()) {
        return err('Use a personal MCP connection to see tasks for your assigned leads, or choose workspace.');
      }
      try {
        const { data } = await get('/api/tasks', { due, scope, page, limit });
        if (!Array.isArray(data?.tasks)) return err('The follow-up queue is unavailable. Check the connected API release.');
        return ok({
          page: data.page,
          pages: data.pages,
          total: data.total,
          pendingCount: data.pendingCount ?? null,
          overdueCount: data.overdueCount ?? null,
          tasks: data.tasks.map(task => ({
            taskId: task.id,
            leadId: task.leadId,
            leadName: task.leadName,
            title: task.title,
            dueAt: task.dueAt ?? null,
            overdue: task.overdue ?? null,
          })),
        });
      } catch (error) {
        return err(error.message);
      }
    },
  );
}
