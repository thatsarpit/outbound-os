import prisma from '../utils/prismaClient.js';
import { appRoleFromOrgRole } from '../../shared/clerkRoles.js';
import { memberAssignmentError, workspaceMemberIdentity } from '../utils/workspaceMember.js';

const assignable = role => ['agent', 'manager', 'admin'].includes(role);
const profile = (identity, user, role, at) => ({ ...identity,
  name: String(user.name || user.email || 'Workspace member').slice(0, 200),
  email: user.email || null, role, lastVerifiedAt: at });

/** Directory snapshots are for labels. Every assignment checks the real provider. */
export class WorkspaceMembers {
  constructor({ db = prisma, client, env = process.env, now = () => new Date() } = {}) {
    Object.assign(this, { db, client, env, now });
  }

  identity(user) {
    const identity = workspaceMemberIdentity(user, this.env);
    if (!identity || !assignable(user.role)) throw memberAssignmentError('A personal sales workspace membership is required.', 403, 'personal_member_required');
    return identity;
  }

  async clerk() {
    return this.client || (await import('@clerk/express')).clerkClient;
  }

  async list(user) {
    const actor = this.identity(user);
    await this.live(actor);
    if (actor.provider === 'local') {
      const users = await this.db.user.findMany({ where: { enabled: true, role: { in: ['agent', 'manager', 'admin'] } }, orderBy: { name: 'asc' } });
      return users.map(member => profile(workspaceMemberIdentity({ id: member.id, orgId: 'local' }, this.env), member, member.role, this.now()));
    }
    try {
      const client = await this.clerk();
      const members = [];
      let offset = 0;
      for (;;) {
        const page = await client.organizations.getOrganizationMembershipList({ organizationId: actor.orgId, limit: 100, offset });
        if (!Array.isArray(page.data)) throw new Error('Invalid membership response');
        for (const member of page.data) {
          const role = appRoleFromOrgRole(member.role);
          const identity = workspaceMemberIdentity({ id: member.publicUserData?.userId, orgId: actor.orgId }, this.env);
          if (!identity || !assignable(role)) continue;
          members.push(profile(identity, {
            name: [member.publicUserData.firstName, member.publicUserData.lastName].filter(Boolean).join(' '),
            email: member.publicUserData.identifier || null,
          }, role, this.now()));
        }
        offset += page.data.length;
        if (!page.data.length || offset >= page.totalCount) break;
        if (offset >= 10_000) throw new Error('Directory is too large');
      }
      return members.sort((a, b) => a.name.localeCompare(b.name));
    } catch { throw memberAssignmentError('The team directory is temporarily unavailable. Try again.', 503, 'member_directory_unavailable'); }
  }

  self(user) { return this.resolve(user, this.identity(user).key); }

  async resolve(user, memberKey) {
    const actor = this.identity(user);
    if (typeof memberKey !== 'string' || memberKey.length > 420) throw memberAssignmentError('Choose a workspace member.');
    const parts = memberKey.split(':');
    const target = parts.length === 3 && parts[0] === actor.provider && parts[1] === actor.orgId
      ? workspaceMemberIdentity({ id: parts[2], orgId: parts[1] }, this.env) : null;
    if (!target || target.key !== memberKey) throw memberAssignmentError('Choose a member of this workspace.', 403, 'wrong_member_workspace');
    const currentActor = await this.live(actor);
    if (actor.key !== target.key && !['manager', 'admin'].includes(currentActor.role)) throw memberAssignmentError('Only a manager can assign another teammate.', 403, 'assignment_forbidden');
    const member = actor.key === target.key ? currentActor : await this.live(target);
    const { localUserId: _localUserId, ...data } = member;
    return this.db.workspaceMember.upsert({ where: { key: member.key }, create: data, update: data });
  }

  async live(target) {
    let member;
    if (target.provider === 'local') {
      const local = await this.db.user.findUnique({ where: { id: target.localUserId } });
      if (!local?.enabled || !assignable(local.role)) throw memberAssignmentError('This teammate is not available for assignment.', 409, 'member_unavailable');
      member = profile(target, local, local.role, this.now());
    } else {
      let membership, clerkUser;
      try {
        const client = await this.clerk();
        const [memberships, found] = await Promise.all([
          client.organizations.getOrganizationMembershipList({ organizationId: target.orgId, userId: [target.externalId], limit: 2 }),
          client.users.getUser(target.externalId),
        ]);
        membership = memberships.data?.find(item => item.publicUserData?.userId === target.externalId);
        clerkUser = found;
      } catch { throw memberAssignmentError('Membership could not be verified. Try again.', 503, 'member_directory_unavailable'); }
      const role = appRoleFromOrgRole(membership?.role);
      if (!membership || !clerkUser || clerkUser.id !== target.externalId || clerkUser.banned || clerkUser.locked || !assignable(role)) {
        throw memberAssignmentError('This teammate is not available for assignment.', 409, 'member_unavailable');
      }
      member = profile(target, { name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' '), email: clerkUser.primaryEmailAddress?.emailAddress || null }, role, this.now());
    }
    return member;
  }
}

export default new WorkspaceMembers();
