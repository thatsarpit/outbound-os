import prisma from '../utils/prismaClient.js';
import activityLog from '../utils/activityLog.js';

const KEY = 'sending_paused';
export const OUTREACH_PAUSED = 'workspace_outreach_paused';

export async function isOutreachPaused(db = prisma) {
  const setting = await db.systemConfig.findUnique({ where: { key: KEY } });
  return setting?.value === 'true';
}

export async function setOutreachPaused(sendingPaused, user) {
  const event = await prisma.$transaction(async tx => {
    const value = String(sendingPaused);
    const result = await tx.systemConfig.upsert({
      where: { key: KEY }, create: { key: KEY, value }, update: { value },
    });
    return tx.activityLog.create({ data: {
      type: 'outreach_pause_changed',
      message: sendingPaused ? 'Workspace outreach paused' : 'Workspace outreach resumed',
      meta: JSON.stringify({ actorId: user.id, sendingPaused: result.value === 'true' }),
    } });
  });
  activityLog.publishPersisted(event);
  return { sendingPaused };
}
