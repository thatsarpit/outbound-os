import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../utils/prismaClient.js';
import { inboxViewerKey } from '../utils/inboxState.js';
import { endpointHash, encryptPushSubscription, validatePushSubscription } from '../utils/pushSubscription.js';
import { pushConfig, sendDevicePush } from '../services/webPush.js';

const router = Router();
// Express 4 does not forward rejected route promises to its error handler.
const handle = (route) => (req, res, next) => Promise.resolve(route(req, res, next)).catch(() => {
  res.status(500).json({ error: 'Device notification settings are unavailable. Try again.' });
});
router.use('/push', (req, res, next) => {
  if (!inboxViewerKey(req.user)) return res.status(403).json({ error: 'A personal sign-in is required for device notifications.' });
  next();
});
router.get('/push/config', (_req, res) => {
  const config = pushConfig();
  res.json({ enabled: config.enabled, publicKey: config.enabled ? config.publicKey : null });
});
const deviceLimiter = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: true, legacyHeaders: false });
router.use('/push', deviceLimiter);
router.post('/push/status', handle(async (req, res) => {
  if (typeof req.body?.endpoint !== 'string') return res.status(400).json({ error: 'Device endpoint is required.' });
  const subscription = await prisma.webPushSubscription.findFirst({ where: { viewerKey: inboxViewerKey(req.user), endpointHash: endpointHash(req.body.endpoint), enabled: true, vapidKey: pushConfig().publicKey }, select: { id: true } });
  res.json({ enabled: Boolean(subscription) });
}));
router.post('/push/subscriptions', handle(async (req, res) => {
  if (!pushConfig().enabled) return res.status(503).json({ error: 'Device notifications are not configured on this server yet.' });
  let subscription;
  try { subscription = validatePushSubscription(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
  const hash = endpointHash(subscription.endpoint);
  const viewerKey = inboxViewerKey(req.user);
  const existing = await prisma.webPushSubscription.findUnique({ where: { endpointHash: hash } });
  if (existing && existing.viewerKey !== viewerKey) return res.status(409).json({ error: 'This device is registered to another account. Disable its notifications before switching accounts.' });
  if (!existing && await prisma.webPushSubscription.count({ where: { viewerKey } }) >= 10) return res.status(400).json({ error: 'Remove an old notification device before adding another.' });
  const latest = await prisma.message.aggregate({ _max: { id: true } });
  const data = { viewerKey, userId: String(req.user.id ?? req.user.sub), orgId: req.user.orgId || 'local', encryptedData: encryptPushSubscription(subscription), lastMessageId: latest._max.id || 0, vapidKey: pushConfig().publicKey, enabled: true, createdAt: new Date() };
  await prisma.webPushSubscription.upsert({ where: { endpointHash: hash }, create: { ...data, endpointHash: hash }, update: data });
  res.json({ enabled: true });
}));
router.delete('/push/subscriptions', handle(async (req, res) => {
  if (typeof req.body?.endpoint !== 'string') return res.status(400).json({ error: 'Device endpoint is required.' });
  await prisma.webPushSubscription.deleteMany({ where: { viewerKey: inboxViewerKey(req.user), endpointHash: endpointHash(req.body.endpoint) } });
  res.json({ enabled: false });
}));
router.post('/push/test', handle(async (req, res) => {
  if (typeof req.body?.endpoint !== 'string') return res.status(400).json({ error: 'Device endpoint is required.' });
  const subscription = await prisma.webPushSubscription.findFirst({ where: { viewerKey: inboxViewerKey(req.user), endpointHash: endpointHash(req.body.endpoint), enabled: true } });
  if (!subscription) return res.status(404).json({ error: 'Enable notifications on this device first.' });
  try {
    await sendDevicePush(subscription, { title: 'Outbound OS is connected', body: 'Notifications are enabled on this device.', tag: 'connection-test', url: '/m/inbox' });
    res.json({ accepted: true });
  } catch (error) {
    if ([404, 410].includes(error.statusCode)) await prisma.webPushSubscription.deleteMany({ where: { id: subscription.id } });
    res.status(502).json({ error: 'The push provider did not accept the test. Disable and enable notifications, then try again.' });
  }
}));
export default router;
