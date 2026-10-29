import { recordMetaReceipt } from '../services/whatsappDelivery.js';
import { Router } from 'express';
import crypto from 'node:crypto';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import replyDetector from '../services/replyDetector.js';
import brevoMarketingCampaigns from '../services/brevoMarketingCampaigns.js';
import imessageService from '../services/imessage.js';
import { downloadInboundMedia, metaInboundMedia } from '../services/whatsappMedia.js';
import { metaInboundText } from '../utils/metaWebhook.js';
import ycloudRoutes from './ycloud.js';

const router = Router();
router.use(ycloudRoutes);

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// ======================== META WHATSAPP WEBHOOK ========================
// Meta's Cloud API delivers inbound messages and delivery receipts here.
// In the Meta app: WhatsApp → Configuration → Webhook, callback URL
// https://<your host>/webhook/meta, verify token = META_WEBHOOK_VERIFY_TOKEN,
// then subscribe to the "messages" field.
//
// Every POST is signed with the app secret (X-Hub-Signature-256). Requests are
// rejected until META_APP_SECRET is set: an unsigned endpoint would let anyone
// who learns the URL inject fake replies.

function secretsEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function metaSignatureValid(req) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !req.rawBody) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
  return secretsEqual(req.get('X-Hub-Signature-256'), expected);
}

/**
 * Fetch an incoming photo, document, voice note or video from Meta and keep
 * it in the data volume, so it can be opened from the inbox. A failure is
 * logged and the message is still recorded, with its text placeholder.
 */
async function storeMetaInboundMedia(msg, accountId) {
  const media = metaInboundMedia(msg);
  if (!media) return null;
  // Meta retries deliveries; a message already recorded keeps its file.
  const seen = msg?.id
    ? await prisma.message.findFirst({ where: { waMessageId: String(msg.id), direction: 'inbound' }, select: { id: true } })
    : null;
  if (seen) return null;
  try {
    return await downloadInboundMedia(media, accountId || null);
  } catch (error) {
    logger.warn(`Meta media ${media.type} ${media.id} not stored: ${error.message}`);
    return null;
  }
}

// Subscription handshake: Meta calls this once when the webhook is saved.
router.get('/webhook/meta', (req, res) => {
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (req.query['hub.mode'] === 'subscribe' && expected && secretsEqual(req.query['hub.verify_token'], expected)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).end(String(req.query['hub.challenge'] || ''));
  }
  return res.sendStatus(403);
});

router.post('/webhook/meta', async (req, res) => {
  if (!metaSignatureValid(req)) {
    logger.warn(process.env.META_APP_SECRET
      ? 'Meta webhook rejected — bad X-Hub-Signature-256'
      : 'Meta webhook rejected — set META_APP_SECRET to accept Meta webhooks');
    return res.sendStatus(401);
  }
  // Acknowledge only after messages and receipt facts are durable. Failures must be retried by Meta.

  try {
    for (const entry of req.body?.entry || []) {
      for (const change of entry?.changes || []) {
        if (change?.field !== 'messages') continue;
        const value = change.value || {};
        const phoneNumberId = value.metadata?.phone_number_id;
        const account = phoneNumberId
          ? await prisma.whatsAppAccount.findFirst({ where: { cloudApiPhoneId: String(phoneNumberId) } })
          : null;
        const accountId = account?.id || 0;

        // Who sent what. Meta identifies every user by a business-scoped user
        // id (user_id / from_user_id) and omits the phone number (wa_id /
        // from) for people using a WhatsApp username who have not been in
        // touch for 30 days. Skipping messages without `from` silently lost
        // them; the user id is enough to find or create their lead.
        const contactsByUserId = new Map();
        const contactsByPhone = new Map();
        for (const contact of value.contacts || []) {
          if (contact?.user_id) contactsByUserId.set(String(contact.user_id), contact);
          if (contact?.wa_id) contactsByPhone.set(String(contact.wa_id), contact);
        }

        for (const msg of value.messages || []) {
          if (msg?.id && await prisma.message.findFirst({ where: { waMessageId: msg.id, direction: 'inbound' }, select: { id: true } })) continue;
          const contact = (msg?.from_user_id && contactsByUserId.get(String(msg.from_user_id)))
            || (msg?.from && contactsByPhone.get(String(msg.from)))
            || (value.contacts?.length === 1 ? value.contacts[0] : null);
          const phone = msg?.from || contact?.wa_id || '';
          const waUserId = msg?.from_user_id || contact?.user_id || '';
          if (!phone && !waUserId) continue;
          const text = metaInboundText(msg);
          if (!text) continue;
          const sentAt = Number(msg.timestamp);
          const who = phone ? `*${String(phone).slice(-4)}` : `user id *${String(waUserId).slice(-4)}`;
          logger.info(`📥 Meta inbound from ${who} (type=${msg.type || 'text'})`);
          const media = await storeMetaInboundMedia(msg, accountId);
          await replyDetector.handleReply(String(phone), text, accountId, {
            source: 'meta',
            media: media || undefined,
            messageId: msg.id,
            timestamp: Number.isFinite(sentAt) && sentAt > 0 ? new Date(sentAt * 1000).toISOString() : undefined,
            messageType: msg.type,
            waUserId: waUserId ? String(waUserId) : undefined,
            waUsername: contact?.profile?.username || undefined,
            senderName: contact?.profile?.name || undefined,
          });
        }

        for (const receipt of value.statuses || []) {
          const error = receipt?.errors?.[0];
          await recordMetaReceipt({
            accountId,
            timestamp: receipt?.timestamp,
            waMessageId: receipt?.id,
            status: receipt?.status,
            phone: receipt?.recipient_id,
            failureCode: error?.code,
            failureReason: error?.error_data?.details || error?.title || error?.message,
            pricing: receipt?.pricing,
          });
        }
      }
    }
    res.sendStatus(200);
  } catch {
    logger.error('Meta webhook persistence failed; requesting provider retry.');
    res.sendStatus(503);
  }
});

// ======================== BREVO MARKETING WEBHOOK ========================
// Configure this only after publishing the backend at a TLS URL. The secret
// can be passed as X-Brevo-Webhook-Secret, Authorization: Bearer <secret>, or
// ?secret=<secret>, depending on the header support available in the Brevo
// webhook configuration. We reject every request until a secret is configured.
function brevoWebhookSecretValid(req) {
  const secret = String(process.env.BREVO_WEBHOOK_SECRET || '');
  if (!secret) return false;
  const authorization = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const provided = String(req.get('x-brevo-webhook-secret') || authorization || req.query.secret || '');
  if (!provided || Buffer.byteLength(provided) !== Buffer.byteLength(secret)) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

router.post('/webhook/brevo', async (req, res) => {
  if (!brevoWebhookSecretValid(req)) {
    logger.warn('Brevo webhook rejected — configure and supply BREVO_WEBHOOK_SECRET');
    return res.sendStatus(401);
  }
  const rawAccountId = req.query.accountId;
  const accountId = rawAccountId === undefined ? null : Number(rawAccountId);
  if (rawAccountId !== undefined && (typeof rawAccountId !== 'string' || !/^[1-9]\d*$/.test(rawAccountId) || !Number.isSafeInteger(accountId))) {
    return res.status(400).json({ error: 'Invalid Brevo email account' });
  }
  try {
    await brevoMarketingCampaigns.reconcileWebhook(req.body || {}, { accountId });
    return res.sendStatus(200);
  } catch (error) {
    logger.error(`Brevo webhook reconciliation failed: ${error.message}`);
    // A success response means every fact and its local changes committed.
    // Leave transient failures retryable instead of silently losing receipts.
    return res.status(error.status === 400 ? 400 : 503).json({
      error: error.status === 400 ? error.message : 'Brevo event processing failed; retry this delivery',
    });
  }
});

// ======================== iMESSAGE (BlueBubbles) ========================

/**
 * POST /webhook/imessage
 * BlueBubbles server POSTs here whenever an inbound iMessage arrives.
 * Configure this URL in BlueBubbles Server → Settings → Webhooks.
 * URL: https://<backend-host>/webhook/imessage?accountId=<id>&token=<secret>
 */
router.post('/webhook/imessage', async (req, res) => {
  const secret = process.env.IMESSAGE_WEBHOOK_SECRET || '';
  const provided = String(req.get('x-outboundos-webhook-secret') || req.query.token || '');
  // Always required. The old localhost exception trusted whatever reached the
  // app as 127.0.0.1, which includes public traffic behind a local proxy that
  // does not forward the client address.
  if (!secret || !secretsEqual(provided, secret)) {
    logger.warn(secret
      ? '[iMessage webhook] Rejected request with missing or invalid secret'
      : '[iMessage webhook] Rejected — set IMESSAGE_WEBHOOK_SECRET to accept BlueBubbles webhooks');
    return res.sendStatus(401);
  }

  res.sendStatus(200); // acknowledge before running reply analysis
  try {
    const accountId = parsePositiveInt(req.query.accountId);
    const outbound = await imessageService.reconcileOutboundWebhook(req.body, accountId);
    if (outbound.matched) return;

    const parsed = imessageService.parseWebhookEvent(req.body);
    if (!parsed) return; // not a message event or was sent by us

    const { default: replyDetector } = await import('../services/replyDetector.js').catch(() => ({ default: null }));
    if (replyDetector) {
      await replyDetector.handleReply(parsed.from, parsed.text, accountId, {
        source: 'imessage',
        messageId: parsed.messageId,
        timestamp: parsed.timestamp,
        channel: 'imessage',
      });
    }
  } catch (err) {
    logger.error(`[iMessage webhook] Error: ${err.message}`);
  }
});

export default router;
