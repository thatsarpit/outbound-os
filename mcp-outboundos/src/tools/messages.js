import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { get, post } from '../client.js';
import { LeadId, ok, err } from '../schemas/common.js';

const ClientMessageId = z
  .string()
  .regex(/^[\w-]{16,100}$/)
  .optional()
  .describe(
    'Known request ID required before sending. Omit to prepare an ID without sending; reuse it for retries of the same request.',
  );

function prepareRequestId() {
  return {
    ...ok({
      success: false,
      reason: 'request_id_required',
      client_message_id: randomUUID(),
      nextStep:
        'No message was sent. Call this tool again with this client_message_id. Keep it for any retry of this exact request; use a new ID for a separate intentional message.',
    }),
    isError: true,
  };
}

function sendError(error, clientMessageId) {
  const payload = error.data || {};
  return {
    ...ok({
      success: false,
      error: error.message,
      reason:
        payload.reason ||
        (!error.status || error.status >= 500 || error.status === 408
          ? 'confirmation_unknown'
          : 'request_rejected'),
      ...(payload.code ? { code: payload.code } : {}),
      ...(error.status ? { httpStatus: error.status } : {}),
      client_message_id: clientMessageId,
      nextStep:
        'Read the conversation before retrying. If the result is uncertain, reuse this request ID; do not create another send.',
    }),
    isError: true,
  };
}

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function registerMessageTools(server) {
  // ── list_messages ──
  server.tool(
    'list_messages',
    'Get all channel messages for a lead, including failed/unconfirmed attempts, provider delivery reasons and sending account. Accepted is not delivered.',
    { lead_id: LeadId },
    async ({ lead_id }) => {
      try {
        const { data } = await get(`/api/leads/${lead_id}/messages`);
        return ok(
          data.map((m) => ({
            id: m.id,
            direction: m.direction,
            channel: m.channel || 'whatsapp',
            content: m.content,
            status: m.status,
            providerStatusReason: m.providerStatusReason ?? null,
            providerDeliveryStatus: m.providerDeliveryStatus ?? null,
            providerDeliveryAt: m.providerDeliveryAt ?? null,
            waAccount: m.waAccount ?? null,
            waMessageId: m.waMessageId ?? null,
            ackStatus: m.ackStatus ?? null,
            ackUpdatedAt: m.ackUpdatedAt ?? null,
            pricingCategory: m.pricingCategory ?? null,
            pricingType: m.pricingType ?? null,
            billable: m.billable ?? null,
            mediaType: m.mediaType ?? null,
            mediaFilename: m.mediaFilename ?? null,
            emailSubject: m.emailSubject || undefined,
            sentAt: m.sentAt,
            createdAt: m.createdAt,
          })),
        );
      } catch (e) {
        return err(e.message);
      }
    },
  );

  // ── send_whatsapp ──
  server.tool(
    'send_whatsapp',
    'Send a normal WhatsApp reply using the assigned sending number. Requires a customer message to that number within 24 hours. Success means provider acceptance; check list_messages for delivery. A caller-known client_message_id is required to send. Omit it to prepare an ID without sending; reuse it if interrupted.',
    {
      lead_id: LeadId,
      message: z.string().min(1).max(4096).describe('Message text to send'),
      client_message_id: ClientMessageId,
    },
    async ({ lead_id, message, client_message_id }) => {
      if (!client_message_id) return prepareRequestId();
      const clientMessageId = client_message_id;
      try {
        const { data } = await post(`/api/leads/${lead_id}/send`, {
          message,
          clientMessageId,
        });
        const result = {
          success: Boolean(data.success),
          reason: data.reason,
          messageId: data.message?.id,
          status: data.message?.status,
          providerStatusReason: data.message?.providerStatusReason ?? null,
          client_message_id: clientMessageId,
        };
        return data.success ? ok(result) : { ...ok(result), isError: true };
      } catch (e) {
        return sendError(e, clientMessageId);
      }
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
        return ok(
          (data || []).map((f) => ({
            id: f.id,
            name: f.originalName,
            type: f.mimeType,
            size: f.size,
            uploaded: f.createdAt,
          })),
        );
      } catch (e) {
        return err(e.message);
      }
    },
  );

  // ── send_whatsapp_file ──
  server.tool(
    'send_whatsapp_file',
    "Send a file from the media library to a lead on WhatsApp (photo, PDF, document, audio or video), with an optional caption. Needs a number on Meta's Cloud API, and like any free-form WhatsApp message it only delivers within 24 hours of the lead's last message.",
    {
      lead_id: LeadId,
      media_file_id: z
        .number()
        .int()
        .positive()
        .describe('Id from list_media_files'),
      caption: z
        .string()
        .max(1024)
        .optional()
        .describe('Text shown with the file (not for audio)'),
      client_message_id: ClientMessageId,
    },
    async ({ lead_id, media_file_id, caption, client_message_id }) => {
      if (!client_message_id) return prepareRequestId();
      const clientMessageId = client_message_id;
      try {
        const { data } = await post(`/api/leads/${lead_id}/send-media`, {
          mediaFileId: media_file_id,
          caption,
          clientMessageId,
        });
        const result = {
          success: Boolean(data.success),
          client_message_id: clientMessageId,
          messages: (data.messages || []).map((m) => ({
            id: m.id,
            file: m.mediaFilename,
            status: m.status,
            providerStatusReason: m.providerStatusReason ?? null,
          })),
        };
        return data.success ? ok(result) : { ...ok(result), isError: true };
      } catch (e) {
        return sendError(e, clientMessageId);
      }
    },
  );

  // ── send_email ──
  server.tool(
    'send_email',
    'Send an email to a lead. Requires subject and body. Optionally reply to an existing thread.',
    {
      lead_id: LeadId,
      subject: z.string().optional().describe('Email subject line'),
      body: z.string().min(1).describe('Plain-text email body'),
      htmlBody: z.string().optional().describe('HTML email body (optional)'),
      accountId: z
        .number()
        .int()
        .optional()
        .describe('Sender email account ID (auto-selected if omitted)'),
      replyToMessageId: z
        .number()
        .int()
        .optional()
        .describe('Message ID to reply to (threads the email)'),
    },
    async ({ lead_id, ...body }) => {
      try {
        const { data } = await post(`/api/leads/${lead_id}/email/send`, body);
        return ok({
          success: data.success,
          messageId: data.messageId,
          sender: data.sender,
        });
      } catch (e) {
        return err(e.message);
      }
    },
  );
}
