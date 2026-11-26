import prisma from '../utils/prismaClient.js';
import { leadHasAssignee, memberAssignmentData } from '../utils/workspaceMember.js';
import workspaceMembers from './workspaceMembers.js';

export const LIVE_OWNER_SETTING = 'outreach.liveOwner';

export async function liveOwner(db = prisma) {
  const config = await db.systemConfig.findUnique({ where: { key: LIVE_OWNER_SETTING } });
  return config?.value || null;
}

// Verify the pinned workspace identity at setup. On dispatch, ownership must
// already match or be unassigned. A deliberate staff handoff takes precedence.
export async function assignLiveOutreach(lead, db = prisma) {
  const key = await liveOwner(db);
  if (!key) return true;
  if (lead.assignedMemberKey === key) return true;
  if (leadHasAssignee(lead)) return false;
  const member = await db.workspaceMember.findUnique({ where: { key } });
  if (member?.role !== 'admin') return false;
  const assigned = await db.lead.updateMany({
    where: { id: lead.id, assignedMemberKey: null, assignedToId: null },
    data: { ...memberAssignmentData(member), updatedAt: lead.updatedAt },
  });
  return assigned.count === 1;
}

export async function configureLiveOwner(user, db = prisma, directory = workspaceMembers) {
  const owner = await directory.self(user);
  if (owner.role !== 'admin') throw Object.assign(new Error('A workspace admin is required.'), { statusCode: 403 });
  await db.systemConfig.upsert({
    where: { key: LIVE_OWNER_SETTING }, create: { key: LIVE_OWNER_SETTING, value: owner.key }, update: { value: owner.key },
  });
  return owner.key;
}
