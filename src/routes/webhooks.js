import { Router } from 'express';
import crypto from 'node:crypto';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import replyDetector from '../services/replyDetector.js';
import brevoMarketingCampaigns from '../services/brevoMarketingCampaigns.js';
import imessageService from '../services/imessage.js';
import { downloadInboundMedia, metaInboundMedia } from '../services/whatsappMedia.js';
import { metaInboundText } from '../utils/metaWebhook.js';

const router = Router();

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// ── AiSensy webhook ─────────────────────────────────────────────────────────
// AiSensy POSTs notifications here for the topics subscribed in their dashboard.
// Envelope: { id, created_at, topic, delivery_attempt, project_id, data }
// Headers:  X-AiSensy-Signature, X-AiSensy-API-Version, X-AiSensy-Project-Id
// Docs:     https://aisensy.stoplight.io/docs/project-api/

// AiSensy retries until it gets a 2xx, so the same notification id can arrive
// several times. Remember recent ids to keep replies from double-processing —
// a duplicate inbound would re-trigger reply classification and can cause a
// duplicate outbound send.
const AISENSY_SEEN_MAX = 2000;
const aisensySeenNotifications = new Map(); // notification id → expiry ms

function aisensyAlreadyHandled(notificationId) {
  if (!notificationId) return false;
  const now = Date.now();
  for (const [id, expiry] of aisensySeenNotifications) {
    if (expiry <= now) aisensySeenNotifications.delete(id);
  }
  if (aisensySeenNotifications.has(notificationId)) return true;
  if (aisensySeenNotifications.size >= AISENSY_SEEN_MAX) {
    aisensySeenNotifications.delete(aisensySeenNotifications.keys().next().value);
  }
  aisensySeenNotifications.set(notificationId, now + 6 * 60 * 60 * 1000);
  return false;
}

/**
 * Authenticate an AiSensy webhook delivery. Accepted when either:
 *   - X-AiSensy-Signature is HMAC-SHA256 (hex) of the raw body with
 *     AISENSY_WEBHOOK_SECRET, or
 *   - the webhook URL carries ?token=<AISENSY_WEBHOOK_SECRET>, for accounts
 *     where AiSensy does not sign deliveries (set the URL in their dashboard
 *     as https://<host>/webhook/whatsapp-cloud?token=<secret>).
 *
 * With no secret configured every delivery is rejected. An open endpoint here
 * would let anyone who learns the URL inject fake replies, which stop
 * follow-ups and can mark leads as interested.
 */
function aisensySignatureValid(req) {
  const secret = process.env.AISENSY_WEBHOOK_SECRET;
  if (!secret) return false;

  const provided = String(req.get('X-AiSensy-Signature') || '').replace(/^sha256=/, '');
  if (provided && req.rawBody) {
    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    if (secretsEqual(provided, expected)) return true;
  }
  return secretsEqual(req.query.token, secret);
}

/** Map an AiSensy message status onto our Message.ackStatus scale. */
function aisensyAckStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'sent': return 1;
    case 'delivered': return 2;
    case 'read': return 3;
    default: return 0;
  }
}

/**
 * Record a delivery receipt (sent / delivered / read / failed) from either
 * WhatsApp provider against the outbound message it belongs to.
 */
async function applyWhatsAppDeliveryStatus({ provider, waMessageId, status: rawStatus, phone: rawPhone, failureCode, failureReason, pricing }) {
  const status = String(rawStatus || '').toLowerCase();
  const ack = aisensyAckStatus(status);
  const failed = status === 'failed';

  // Only ever move status forward — a late 'sent' must not downgrade a
  // message we already know was read.
  const forward = failed ? { status: 'failed' }
    : ack >= 3 ? { status: 'read' }
      : ack >= 2 ? { status: 'delivered' } : {};
  // Meta's per-message pricing: what the message will be billed as. There is
  // no amount in the webhook — rates are on Meta's rate card — but the
  // category and whether it is billable are enough to count spend by type.
  const priced = pricing && typeof pricing === 'object'
    ? {
        ...(pricing.category ? { pricingCategory: String(pricing.category).slice(0, 40) } : {}),
        ...(pricing.type ? { pricingType: String(pricing.type).slice(0, 40) } : {}),
        ...(typeof pricing.billable === 'boolean' ? { billable: pricing.billable } : {}),
      }
    : {};
  const data = { ackStatus: ack, ackUpdatedAt: new Date(), ...forward, ...priced };

  let updated = { count: 0 };
  if (waMessageId) {
    updated = await prisma.message.updateMany({
      where: { waMessageId: String(waMessageId), direction: 'outbound' },
      data,
    });
  }

  // Fall back to matching on the recipient's number.
  //
  // AiSensy's Campaign API returns HTTP 200 with no provider id, so every
  // message sent through a campaign stores waMessageId as null and can never
  // be matched by id. Without this fallback every such delivery receipt is
  // discarded and the system cannot tell whether a message ever arrived.
  //
  // Matching the most recent un-acked outbound message to that number is
  // safe in practice: outreach sends one message per lead, and the seven
  // day window stops a receipt attaching to an unrelated older send.
  if (updated.count === 0) {
    const phone = String(rawPhone || '').replace(/\D/g, '');
    if (phone) {
      // Stored numbers keep their formatting (+61-491570156), so the suffix
      // has to be short enough to survive a country code and a separator.
      // Nine digits stays specific enough to identify one lead, and the
      // channel and seven day window narrow it further.
      const last9 = phone.slice(-9);
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const candidate = await prisma.message.findFirst({
        where: {
          direction: 'outbound',
          channel: 'whatsapp',
          createdAt: { gte: since },
          ackStatus: { lt: ack || 1 },
          lead: { mobile: { endsWith: last9 } },
        },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      if (candidate) {
        await prisma.message.update({
          where: { id: candidate.id },
          // Backfill the id so a later receipt for the same message matches
          // directly instead of guessing again.
          data: { ...data, ...(waMessageId ? { waMessageId: String(waMessageId) } : {}) },
        });
        updated = { count: 1 };
      }
    }
  }

  if (failed) {
    logger.error(`${provider} delivery FAILED for ${waMessageId || 'no-id'} [${failureCode ?? '?'}] ${failureReason ?? 'no reason given'}`);
  } else if (updated.count === 0) {
    logger.info(`${provider} status '${status}' for ${waMessageId || 'no-id'} — no matching row`);
  }
}

// Reachability check — AiSensy configures webhooks in their dashboard rather
// than through a hub.challenge handshake, so there is nothing to echo back.
router.get('/webhook/whatsapp-cloud', (_req, res) => res.status(200).send('ok'));

router.post('/webhook/whatsapp-cloud', async (req, res) => {
  if (!aisensySignatureValid(req)) {
    logger.warn(process.env.AISENSY_WEBHOOK_SECRET
      ? 'AiSensy webhook rejected — bad signature or token'
      : 'AiSensy webhook rejected — set AISENSY_WEBHOOK_SECRET to accept AiSensy webhooks');
    return res.sendStatus(401);
  }
  // Ack before doing any work; AiSensy retries anything that is not 2xx.
  res.sendStatus(200);

  try {
    const { id: notificationId, topic, data, project_id: projectId, delivery_attempt: attempt } = req.body || {};
    if (!topic) return;

    if (aisensyAlreadyHandled(notificationId)) {
      logger.info(`AiSensy webhook ${topic} ${notificationId} already handled (attempt ${attempt}) — skipping`);
      return;
    }

    const account = projectId
      ? await prisma.whatsAppAccount.findFirst({ where: { aisensyProjectId: String(projectId) } })
      : null;
    const accountId = account?.id || 0;
    const message = data?.message;

    switch (topic) {
      // ── Inbound message from a lead ──
      case 'message.sender.user': {
        const from = message?.phone_number;
        if (!from) return;

        // message_content shape varies by message_type; cover the common ones
        // and fall back to a placeholder so a media-only reply still registers
        // as a reply rather than vanishing.
        const content = message.message_content || {};
        const type = String(message.message_type || '').toLowerCase();
        const text =
          content.text?.body ||
          content.body ||
          content.caption ||
          (typeof content === 'string' ? content : '') ||
          (type && type !== 'text' ? `[${type.toLowerCase()}]` : '');

        if (!text) {
          logger.info(`AiSensy inbound from *${String(from).slice(-4)} had no readable content (type=${type})`);
          return;
        }

        logger.info(`📥 AiSensy inbound from *${String(from).slice(-4)} (type=${type || 'text'})`);
        await replyDetector.handleReply(String(from), text, accountId, {
          source: 'aisensy',
          messageId: message.messageId || message.id,
          timestamp: message.sent_at,
          messageType: type,
        });
        return;
      }

      // ── Delivery status for something we sent ──
      case 'message.status.updated': {
        await applyWhatsAppDeliveryStatus({
          provider: 'AiSensy',
          waMessageId: message?.messageId || message?.id,
          status: message?.status,
          phone: message?.phone_number || message?.phoneNumber,
          failureCode: message?.failureResponse?.code,
          failureReason: message?.failureResponse?.reason,
        });
        return;
      }

      default:
        // Subscribed-but-unhandled topics are expected; the webhook API is in
        // beta and new topics get added. Log rather than throw.
        logger.info(`AiSensy webhook topic '${topic}' received (not handled)`);
    }
  } catch (err) {
    logger.error(`AiSensy webhook error: ${err.message}`);
  }
});

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
    return res.status(200).send(String(req.query['hub.challenge'] || ''));
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
  // Acknowledge first; Meta retries anything that is not a quick 2xx.
  res.sendStatus(200);

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
          if (aisensyAlreadyHandled(`meta:${msg?.id}`)) continue;
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
          await applyWhatsAppDeliveryStatus({
            provider: 'Meta',
            waMessageId: receipt?.id,
            status: receipt?.status,
            phone: receipt?.recipient_id,
            failureCode: error?.code,
            failureReason: error?.title || error?.message,
            pricing: receipt?.pricing,
          });
        }
      }
    }
  } catch (err) {
    logger.error(`Meta webhook error: ${err.message}`);
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
  // Brevo retries a non-2xx response. Acknowledge quickly and reconcile the
  // event idempotently against local leads/messages in the background.
  res.sendStatus(200);
  try {
    await brevoMarketingCampaigns.reconcileWebhook(req.body || {});
  } catch (error) {
    logger.error(`Brevo webhook reconciliation failed: ${error.message}`);
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
