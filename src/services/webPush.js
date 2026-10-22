import webpush from 'web-push';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import { HUMAN_REPLY_WHERE } from '../utils/emailInbound.js';
import { decryptPushSubscription } from '../utils/pushSubscription.js';
import { AUTH_PROVIDER, clerkClient } from '../auth/index.js';
import { clerkWorkspaceIdentity } from '../auth/clerkIdentity.js';

export function pushConfig() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || '';
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || '';
  const subject = process.env.WEB_PUSH_SUBJECT || '';
  return { enabled: Boolean(publicKey && privateKey && /^mailto:[^\s@]+@[^\s@]+$/.test(subject)), publicKey, privateKey, subject };
}
export async function sendDevicePush(subscription, payload) {
  const config = pushConfig();
  if (!config.enabled) throw new Error('Push notifications are not configured.');
  return webpush.sendNotification(decryptPushSubscription(subscription.encryptedData), JSON.stringify(payload), {
    vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
    TTL: 3600, urgency: 'normal', timeout: 10_000,
  });
}

async function ownerStillHasAccess(subscription) {
  if (AUTH_PROVIDER === 'local') {
    if (subscription.orgId !== 'local' || !/^\d+$/.test(subscription.userId)) return false;
    const user = await prisma.user.findUnique({ where: { id: Number(subscription.userId) }, select: { enabled: true, role: true } });
    return Boolean(user?.enabled && ['admin', 'manager', 'agent', 'viewer'].includes(user.role));
  }
  const { data } = await clerkClient.organizations.getOrganizationMembershipList({ organizationId: subscription.orgId, userId: [subscription.userId], limit: 1 });
  const membership = data.find(row => row.publicUserData?.userId === subscription.userId);
  return Boolean(clerkWorkspaceIdentity({ userId: subscription.userId, orgId: subscription.orgId, orgRole: membership?.role }));
}

/** Durable per-device cursor; retries use the same notification tag after a restart. */
export async function deliverDeviceReplies(subscription, send = sendDevicePush) {
  const messages = await prisma.message.findMany({
    where: { id: { gt: subscription.lastMessageId }, createdAt: { gte: subscription.createdAt }, ...HUMAN_REPLY_WHERE },
    orderBy: { id: 'asc' }, take: 25,
    select: { id: true, leadId: true, channel: true },
  });
  for (const message of messages) {
    // Reading in the foreground satisfies this alert; it does not resolve the reply.
    const readState = await prisma.inboxReadState.findUnique({ where: { leadId_viewerKey: { leadId: message.leadId, viewerKey: subscription.viewerKey } } });
    if (!readState || readState.lastReadMessageId < message.id) {
      const label = { whatsapp: 'WhatsApp', email: 'email', imessage: 'iMessage', telegram: 'Telegram' }[message.channel] || 'customer';
      try {
        await send(subscription, { title: `New ${label} message`, body: 'Open Outbound OS to read and reply.', tag: `message-${message.id}`, url: `/m/inbox?leadId=${message.leadId}&channel=${encodeURIComponent(message.channel)}` });
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) {
          await prisma.webPushSubscription.deleteMany({ where: { id: subscription.id } });
          return;
        }
        // Never log the provider's response body, which can include endpoint credentials.
        logger.warn(`Push delivery will retry (status ${Number(error.statusCode) || 'unavailable'}).`);
        return;
      }
    }
    await prisma.webPushSubscription.updateMany({ where: { id: subscription.id, enabled: true }, data: { lastMessageId: message.id } });
  }
}

let timer;
let running = false;
export async function pollWebPush() {
  const config = pushConfig();
  if (running || !config.enabled) return;
  running = true;
  try {
    const subscriptions = await prisma.webPushSubscription.findMany({ where: { enabled: true, vapidKey: config.publicKey }, orderBy: { id: 'asc' } });
    for (const subscription of subscriptions) {
      try {
        if (!(await ownerStillHasAccess(subscription))) {
          await prisma.webPushSubscription.deleteMany({ where: { id: subscription.id } });
          continue;
        }
        await deliverDeviceReplies(subscription);
      } catch {
        logger.warn('Push access check unavailable; delivery deferred.');
      }
    }
  } finally { running = false; }
}
export function startWebPush() {
  if (timer || !pushConfig().enabled) return;
  timer = setInterval(() => { void pollWebPush().catch(() => logger.warn('Push worker unavailable; retrying next cycle.')); }, 30_000);
  timer.unref();
}
export function stopWebPush() { clearInterval(timer); timer = undefined; }
