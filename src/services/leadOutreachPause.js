import prisma from '../utils/prismaClient.js';

export async function changeLeadPause(ids, { paused, reason, user }) {
  if (reason !== undefined && (typeof reason !== 'string' || reason.trim().length > 240)) {
    throw Object.assign(new Error('Keep the pause reason within 240 characters.'), { statusCode: 400 });
  }
  return prisma.$transaction(async tx => {
    const leads = await tx.lead.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, statusBeforePause: true, repliedAt: true },
    });
    const groups = new Map();
    for (const lead of leads) {
      const isPaused = lead.status === 'paused';
      if (paused === isPaused) continue;
      const shouldPause = paused ?? !isPaused;
      const status = shouldPause ? 'paused' : lead.statusBeforePause || (lead.repliedAt ? 'replied' : 'new');
      const statusBeforePause = shouldPause ? lead.status : null;
      const key = JSON.stringify([lead.status, status, statusBeforePause]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(lead.id);
    }
    let updated = 0;
    let status = leads[0]?.status;
    for (const [key, leadIds] of groups) {
      const [from, to, statusBeforePause] = JSON.parse(key);
      const result = await tx.lead.updateMany({
        where: { id: { in: leadIds }, status: from },
        data: { status: to, statusBeforePause },
      });
      if (result.count !== leadIds.length) {
        throw Object.assign(new Error('A lead changed. Refresh and try again.'), { statusCode: 409 });
      }
      updated += result.count;
      status = to;
      await tx.activityLog.createMany({ data: leadIds.map(leadId => ({
        leadId, type: to === 'paused' ? 'lead_takeover' : 'lead_resumed',
        message: to === 'paused' ? 'Lead outreach paused' : 'Lead outreach resumed',
        meta: JSON.stringify({ actorId: user.id, from, to, reason: reason?.trim() || null }),
      })) });
    }
    return { updated, status };
  }, { timeout: 15_000 });
}
