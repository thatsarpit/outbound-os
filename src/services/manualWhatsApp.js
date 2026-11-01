import { sendMediaFile, mediaKind } from './whatsappMedia.js';
import { randomUUID } from 'node:crypto';
import { reconcileMetaReceipts } from './whatsappDelivery.js';
import prisma from '../utils/prismaClient.js';
import whatsappManager from './whatsapp.js';
import whatsappCloudApi from './whatsappCloudApi.js';
import { whatsappAddress } from '../utils/whatsappAddress.js';
import { whatsappSession } from '../utils/whatsappSession.js';
import leadStateService from '../domain/leadStateService.js';

function fail(message, statusCode = 400, reason) {
  return Object.assign(new Error(message), { statusCode, reason });
}
export async function whatsappReplyContext(lead, requestedAccountId = null) {
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { enabled: true },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, phone: true },
  });
  const inbound = await prisma.message.findMany({
    where: { leadId: lead.id, channel: 'whatsapp', direction: 'inbound' },
    select: {
      direction: true,
      channel: true,
      waAccount: true,
      sentAt: true,
      createdAt: true,
    },
    orderBy: { id: 'desc' },
  });
  // Keep the same sender identity even when its connection is disabled.
  const selectedId =
    requestedAccountId || lead.assignedAccount || inbound[0]?.waAccount;
  const account = selectedId
    ? accounts.find((row) => row.id === selectedId)
    : accounts[0];
  return {
    ...whatsappSession(inbound, account?.id || null),
    senderName: account?.name || null,
    senderPhone: account?.phone || null,
  };
}
export async function requireWhatsAppWindow(lead, accountId) {
  const inbound = await prisma.message.findMany({
    where: {
      leadId: lead.id,
      channel: 'whatsapp',
      direction: 'inbound',
      waAccount: accountId,
    },
    select: {
      direction: true,
      channel: true,
      waAccount: true,
      sentAt: true,
      createdAt: true,
    },
  });
  if (!whatsappSession(inbound, accountId).isOpen)
    throw fail(
      'The 24-hour WhatsApp reply window is closed. Send an approved template and wait for the customer to reply.',
      409,
      're_engagement_required',
    );
}

/** Store every manual attempt before network I/O. Never retry an uncertain send automatically. */
export async function sendManualWhatsApp(
  {
    leadId,
    text,
    template,
    media,
    clientMessageId,
    accountId: requestedAccountId,
  },
  dependencies = {},
) {
  const manager = dependencies.manager || whatsappManager;
  const cloud = dependencies.cloud || whatsappCloudApi;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw fail('Lead not found', 404);
  const context = await whatsappReplyContext(lead, requestedAccountId);
  const accountId = context.accountId;
  if (!accountId) throw fail('No enabled WhatsApp account is available.', 503);
  const address = whatsappAddress(lead);
  if (!address) throw fail('This lead has no WhatsApp address.');
  if (
    clientMessageId !== undefined &&
    (typeof clientMessageId !== 'string' ||
      !/^[\w-]{16,100}$/.test(clientMessageId))
  )
    throw fail('Invalid message request ID.');
  const idempotencyKey = `manual-wa:${leadId}:${clientMessageId || randomUUID()}`;
  if (idempotencyKey) {
    const existing = await prisma.message.findFirst({
      where: { idempotencyKey },
    });
    if (existing)
      return {
        lead,
        accountId,
        message: existing,
        success: ['sent', 'delivered', 'read'].includes(existing.status),
        reason: existing.providerStatusReason || 'send_pending',
        duplicate: true,
      };
  }
  let body = String(text || '').trim();
  let templateName = null,
    language = null,
    parameters = [];
  if (template) {
    const result = await cloud.listApprovedTemplates(accountId);
    if (!result.ok)
      throw fail(
        result.message || 'Could not verify the approved template.',
        502,
      );
    const approved = result.templates.find(
      (row) => row.name === template.name && row.language === template.language,
    );
    if (!approved || approved.manualSupported === false)
      throw fail(
        'Choose an approved text template supported by this composer.',
      );
    parameters = Array.isArray(template.parameters) ? template.parameters : [];
    if (
      parameters.length !== approved.bodyVariables.length ||
      parameters.some(
        (value) =>
          typeof value !== 'string' || !value.trim() || value.length > 1000,
      )
    )
      throw fail('Fill every template variable before sending.');
    if (
      approved.bodyVariables.some((name, index) => name !== String(index + 1))
    )
      throw fail(
        'This template uses named parameters and needs a compatible template editor.',
      );
    templateName = approved.name;
    language = approved.language;
    body = approved.body.replace(
      /\{\{\s*(\d+)\s*\}\}/g,
      (_match, number) => parameters[Number(number) - 1],
    );
  } else {
    if ((!body && !media) || body.length > (media ? 1024 : 4096))
      throw fail('Write a WhatsApp message of 1–4096 characters.');
    await requireWhatsAppWindow(lead, accountId);
  }
  const kind = media ? mediaKind(media.mimeType) : null;
  if (media && !body)
    body = `[${kind === 'pdf' ? 'Document' : kind}] ${media.filename}`;
  // A database constraint arbitrates concurrent tabs without holding a transaction over network I/O.
  let message;
  try {
    message = await prisma.message.create({
      data: {
        leadId,
        direction: 'outbound',
        channel: 'whatsapp',
        content: body,
        waAccount: accountId,
        status: 'sending',
        idempotencyKey,
        manualSendKey: idempotencyKey,
        ...(media
          ? {
              mediaUrl: media.path,
              mediaType: kind,
              mediaCaption: String(text || '').trim() || null,
              mediaFilename: media.filename,
            }
          : {}),
        providerStatusReason: 'provider_pending',
        ...(templateName
          ? {
              waCampaignName: templateName,
              waTemplateParams: JSON.stringify(parameters),
            }
          : {}),
      },
    });
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    const previous = await prisma.message.findUnique({
      where: { manualSendKey: idempotencyKey },
    });
    if (!previous) throw error;
    return {
      lead,
      accountId,
      message: previous,
      success: ['sent', 'delivered', 'read'].includes(previous.status),
      reason: previous.providerStatusReason || 'send_pending',
      duplicate: true,
    };
  }
  let result;
  try {
    result = media
      ? await sendMediaFile({
          address,
          accountId,
          filePath: media.absolutePath,
          mimeType: media.mimeType,
          filename: media.filename,
          caption: String(text || '').trim(),
        })
      : templateName
        ? await manager.sendApprovedTemplate(
            address,
            templateName,
            language,
            parameters,
            accountId,
          )
        : await manager.sendMessage(address, body, accountId);
  } catch {
    result = { success: false, reason: 'confirmation_unknown' };
  }
  const uncertain = [
    'timeout',
    'exception',
    'no_message_id',
    'confirmation_unknown',
  ].includes(result.reason);
  const saved = await prisma.message.update({
    where: { id: message.id },
    data: {
      waMessageId: result.waMessageId || result.messageId || null,
      providerErrorCode: result.success ? null : result.errorCode || null,
      providerErrorMessage: result.success ? null : String(result.rawError || result.error || '').slice(0, 500) || null,
      providerRequestId: result.success ? null : result.requestId || null,
      status: result.success ? 'sent' : uncertain ? 'unconfirmed' : 'failed',
      sentAt: result.success ? new Date() : null,
      providerStatusReason: result.success
        ? 'provider_accepted'
        : result.reason || 'send_failed',
    },
  });
  if (saved.waMessageId) await reconcileMetaReceipts(saved.waMessageId, accountId);
  const confirmed = await prisma.message.findUnique({ where: { id: saved.id } });
  if (['sent', 'delivered', 'read'].includes(confirmed.status)) {
    await prisma.message.updateMany({
      where: { leadId, direction: 'outbound', status: 'queued' },
      data: { status: 'cancelled' },
    });
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        lastMessageAt: new Date(),
        status: leadStateService.computeManualTakeoverStatus(lead.status),
      },
    });
  }
  const finalMessage = await prisma.message.findUnique({
    where: { id: saved.id },
  });
  return {
    lead,
    accountId,
    message: finalMessage,
    success: ['sent', 'delivered', 'read'].includes(finalMessage.status),
    reason: finalMessage.providerStatusReason || result.reason,
  };
}
