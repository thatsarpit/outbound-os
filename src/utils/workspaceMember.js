import { isVerifiedMcpActor } from '../auth/verifiedMcpActor.js';

const token = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const localId = value => /^[1-9]\d*$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
export const memberAssignmentError = (message, statusCode = 400, code = 'invalid_member') => Object.assign(new Error(message), { statusCode, code });

/** Identity is provider-scoped; a matching email is never evidence of ownership. */
export function workspaceMemberIdentity(user, env = process.env) {
  if (!user || (user.delegated && !isVerifiedMcpActor(user)) || user.id === 'mcp-service' || user.orgId === 'service') return null;
  const provider = (env.AUTH_PROVIDER || (env.CLERK_SECRET_KEY ? 'clerk' : 'local')).toLowerCase() === 'clerk' ? 'clerk' : 'local';
  const externalId = String(user.id ?? user.sub ?? '');
  if (provider === 'local') {
    const id = localId(externalId);
    if (!id || (user.orgId && user.orgId !== 'local')) return null;
    return { key: `local:local:${id}`, provider, externalId: String(id), orgId: 'local', localUserId: id };
  }
  const orgId = user.orgId;
  const pinned = String(env.CLERK_ORGANIZATION_ID || '').trim();
  if (!token(orgId) || !orgId.startsWith('org_') || !token(externalId) || !externalId.startsWith('user_')) return null;
  if ((!pinned && (env.NODE_ENV === 'production' || String(env.CLERK_SECRET_KEY || '').startsWith('sk_live_')))
    || (pinned && pinned !== orgId)) return null;
  return { key: `clerk:${orgId}:${externalId}`, provider, externalId, orgId, localUserId: null };
}

export function memberAssignmentWhere(user, env = process.env) {
  const identity = workspaceMemberIdentity(user, env);
  if (!identity) throw memberAssignmentError('Sign in personally to view your assignments.', 403, 'personal_member_required');
  return identity.provider === 'local'
    ? { OR: [{ assignedMemberKey: identity.key }, { assignedMemberKey: null, assignedToId: identity.localUserId }] }
    : { assignedMemberKey: identity.key };
}

export function leadAssignmentWhere(assigned) {
  return assigned
    ? { OR: [{ assignedMemberKey: { not: null } }, { assignedToId: { not: null } }] }
    : { assignedMemberKey: null, assignedToId: null };
}

export const leadHasAssignee = lead => Boolean(lead?.assignedMemberKey || lead?.assignedToId);

export function memberAssignmentData(member) {
  if (!member) return { assignedMemberKey: null, assignedToId: null };
  return { assignedMemberKey: member.key, assignedToId: member.provider === 'local' ? localId(member.externalId) : null };
}

/** Snapshots label historical ownership but never grant membership or API access. */
export function leadAssignedMember(lead) {
  const member = lead?.assignedMember;
  if (member) {
    const { key, provider, externalId, orgId, name, role, lastVerifiedAt } = member;
    return { key, provider, externalId, orgId, name, role, lastVerifiedAt };
  }
  if (!lead?.assignedToId) return null;
  return { key: `local:local:${lead.assignedToId}`, provider: 'local', externalId: String(lead.assignedToId), orgId: 'local',
    name: lead.assignedTo?.name || 'Assigned teammate', role: lead.assignedTo?.role || null, lastVerifiedAt: null };
}
