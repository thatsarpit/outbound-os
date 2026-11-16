import prisma from '../utils/prismaClient.js';

// Reactions are independent events, not new enquiries. Keep even an event that
// precedes its message receipt, and ignore stale webhook replays.
export async function recordReaction({ channel, accountId, targetId, actorKey, emoji, eventAt = new Date() }) {
  if (!targetId || !accountId || !actorKey || typeof emoji !== 'string') return;
  const key = { channel, accountId, targetId, actorKey };
  await prisma.messageReaction.upsert({ where: { channel_accountId_targetId_actorKey: key }, create: { ...key, emoji, eventAt }, update: {} });
  await prisma.messageReaction.updateMany({ where: { ...key, eventAt: { lte: eventAt } }, data: { emoji, eventAt } });
}
