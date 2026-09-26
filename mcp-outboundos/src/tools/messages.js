import { z } from 'zod';
import { get, post } from '../client.js';
import { LeadId, ok, err } from '../schemas/common.js';

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function registerMessageTools(server) {

  // ── list_messages ──
  server.tool(
    'list_messages',
    'Get all messages (WhatsApp + email) for a lead, sorted chronologically',
    { lead_id: LeadId },
    async ({ lead_id }) => {
      try {
        const { data } = await get(`/api/leads/${lead_id}/messages`);
        return ok(data.map(m => ({
          id: m.id,
          direction: m.direction,
          channel: m.channel || 'whatsapp',
          content: m.content,
          status: m.status,
          emailSubject: m.emailSubject || undefined,
          sentAt: m.sentAt,
          createdAt: m.createdAt,
        })));
      } catch (e) { return err(e.message); }
    },
  );

  // ── send_whatsapp ──
  server.tool(
    'send_whatsapp',
    'Send a WhatsApp message to a lead. The message is sent immediately via the assigned (or round-robin) WhatsApp account.',
    {
      lead_id: LeadId,
      message: z.string().min(1).describe('Message text to send'),
    },
    async ({ lead_id, message }) => {
      try {
        const { data } = await post(`/api/leads/${lead_id}/send`, { message });
        return ok({
          success: data.success,
          reason: data.reason,
          messageId: data.message?.id,
          status: data.message?.status,
        });
      } catch (e) { return err(e.message); }
    },
  );

  // ── send_email ──
  server.tool(
    'send_email',
    'Send an email to a lead. Requires subject and body. Optionally reply to an existing thread.',
    {
      lead_id:           LeadId,
      subject:           z.string().optional().describe('Email subject line'),
      body:              z.string().min(1).describe('Plain-text email body'),
      htmlBody:          z.string().optional().describe('HTML email body (optional)'),
      accountId:         z.number().int().optional().describe('Sender email account ID (auto-selected if omitted)'),
      replyToMessageId:  z.number().int().optional().describe('Message ID to reply to (threads the email)'),
    },
    async ({ lead_id, ...body }) => {
      try {
        const { data } = await post(`/api/leads/${lead_id}/email/send`, body);
        return ok({
          success: data.success,
          messageId: data.messageId,
          sender: data.sender,
        });
      } catch (e) { return err(e.message); }
    },
  );

  // ── ai_reply_suggestion ──
  server.tool(
    'ai_reply_suggestion',
    'Get an AI-generated reply suggestion for a lead based on conversation history',
    { lead_id: LeadId },
    async ({ lead_id }) => {
      try {
        const { data } = await post(`/api/leads/${lead_id}/ai-reply`);
        return ok({ suggestion: data.suggestion });
      } catch (e) { return err(e.message); }
    },
  );
}
