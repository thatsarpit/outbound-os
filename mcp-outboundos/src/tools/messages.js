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

  // ── list_media_files ──
  server.tool(
    'list_media_files',
    'List files in the media library (price lists, catalogues, photos) that can be sent on WhatsApp with send_whatsapp_file. Upload files in the dashboard.',
    {},
    async () => {
      try {
        const { data } = await get('/api/media');
        return ok((data || []).map((f) => ({ id: f.id, name: f.originalName, type: f.mimeType, size: f.size, uploaded: f.createdAt })));
      } catch (e) { return err(e.message); }
    },
  );

  // ── send_whatsapp_file ──
  server.tool(
    'send_whatsapp_file',
    'Send a file from the media library to a lead on WhatsApp (photo, PDF, document, audio or video), with an optional caption. Needs a number on Meta\'s Cloud API, and like any free-form WhatsApp message it only delivers within 24 hours of the lead\'s last message.',
    {
      lead_id: LeadId,
      media_file_id: z.number().int().positive().describe('Id from list_media_files'),
      caption: z.string().max(1024).optional().describe('Text shown with the file (not for audio)'),
    },
    async ({ lead_id, media_file_id, caption }) => {
      try {
        const { data } = await post(`/api/leads/${lead_id}/send-media`, { mediaFileId: media_file_id, caption });
        return ok({ success: data.success, messages: (data.messages || []).map((m) => ({ id: m.id, file: m.mediaFilename, status: m.status })) });
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
}
