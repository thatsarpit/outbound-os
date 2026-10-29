import { Router } from 'express';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import whatsappCloudApi from '../services/whatsappCloudApi.js';
import replyDetector from '../services/replyDetector.js';
import { recordMetaReceipt } from '../services/whatsappDelivery.js';
import { downloadYCloudInboundMedia } from '../services/whatsappMedia.js';
import { metaInboundText } from '../utils/metaWebhook.js';
import { ycloudSignatureValid, ycloudPricing } from '../utils/ycloudWebhook.js';

const router = Router();
const digits = value => String(value || '').replace(/\D/g, '');

// Each endpoint has its own encrypted signing secret and sender/WABA scope.
router.post('/webhook/ycloud/:accountId', async (req, res) => {
  const id = Number(req.params.accountId);
  if (!Number.isSafeInteger(id) || id <= 0) return res.sendStatus(404);
  try {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id } });
    if (!account || account.provider !== 'ycloud') return res.sendStatus(404);
    const secret = whatsappCloudApi.decryptToken(account.ycloudWebhookSecret);
    if (!ycloudSignatureValid(req.rawBody, req.get('YCloud-Signature'), secret)) return res.sendStatus(401);
    const event = req.body || {};
    if (event.type === 'whatsapp.message.updated') {
      const message = event.whatsappMessage || {};
      if ((message.wabaId && String(message.wabaId) !== account.ycloudWabaId)
        || (message.from && digits(message.from) !== digits(account.ycloudPhoneNumber))) return res.sendStatus(422);
      // The YCloud id is returned synchronously even before a wamid exists.
      // Keep it as the receipt key so early receipts can be reconciled later.
      await recordMetaReceipt({ accountId: id, waMessageId: message.id,
        status: message.status, timestamp: message.updateTime || event.createTime,
        failureCode: Number(message.errorCode || message.whatsappApiError?.code) || undefined,
        failureReason: message.whatsappApiError?.error_data?.details || message.errorMessage,
        pricing: ycloudPricing(message) });
    } else if (event.type === 'whatsapp.inbound_message.received') {
      const message = event.whatsappInboundMessage || {};
      if (String(message.wabaId) !== account.ycloudWabaId
        || digits(message.to) !== digits(account.ycloudPhoneNumber)) return res.sendStatus(422);
      const messageId = message.wamid || message.id;
      const senderId = message.fromUserId || message.fromParentUserId;
      if (!messageId || (!message.from && !senderId) || !message.sendTime
        || !Number.isFinite(new Date(message.sendTime).getTime())) return res.sendStatus(400);
      let inbound = await prisma.message.findFirst({ where: { direction: 'inbound', waMessageId: messageId } });
      if (inbound && inbound.waAccount !== id) return res.sendStatus(422);
      if (inbound) {
        // Recover the safety action if the process stopped after saving a reply.
        // Work deliberately scheduled after that reply must survive a replay.
        await prisma.message.updateMany({ where: { leadId: inbound.leadId, id: { lt: inbound.id }, direction: 'outbound', status: 'queued' }, data: { status: 'cancelled' } });
      }
      const text = metaInboundText(message);
      if (!text) return res.sendStatus(400);
      if (!inbound) {
        // Saving the reply and stopping outreach cannot depend on a media host.
        await replyDetector.handleReply(String(message.from || ''), text, id, {
          source: 'ycloud', messageId, timestamp: message.sendTime, messageType: message.type,
          waUserId: senderId || undefined, waUsername: message.customerProfile?.username,
          senderName: message.customerProfile?.name,
        });
        inbound = await prisma.message.findFirst({ where: { direction: 'inbound', waMessageId: messageId, waAccount: id } });
        if (!inbound) throw new Error('Inbound persistence not confirmed.');
      }
      if (!inbound.idempotencyKey) await prisma.message.updateMany({ where: { id: inbound.id, idempotencyKey: null }, data: { idempotencyKey: `ycloud-inbound:${messageId}` } });
      logger.info(`YCloud inbound authenticated and stored for WhatsApp account ${id}.`);
      if (!inbound.mediaUrl && inbound.providerStatusReason !== 'media_unavailable') {
        try {
          const media = await downloadYCloudInboundMedia(message, id);
          if (media) await prisma.message.update({ where: { id: inbound.id }, data: {
            mediaUrl: media.mediaUrl, mediaType: media.mediaType, mediaFilename: media.mediaFilename,
            content: text, providerStatusReason: null,
          } });
        } catch (error) {
          const permanent = ['media_too_large', 'untrusted_media_url', 'media_checksum_mismatch', 'unsupported_media_type'].includes(error.code);
          await prisma.message.update({ where: { id: inbound.id }, data: {
            providerStatusReason: permanent ? 'media_unavailable' : 'media_pending_retry',
            content: `${text}\n[Attachment ${permanent ? 'unavailable' : 'download pending'}]`,
          } });
          logger.warn(`YCloud attachment unavailable for WhatsApp account ${id}; reply retained and outreach stopped.`);
          if (!permanent) return res.sendStatus(503);
        }
      }
    }
    // Reply only after durable storage. A 503 asks YCloud to redeliver safely.
    return res.sendStatus(200);
  } catch {
    logger.error('YCloud webhook persistence failed; requesting provider retry.');
    return res.sendStatus(503);
  }
});

export default router;
