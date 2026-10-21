// Existing custom memberships remain readable during migration. New invitations
// use Clerk's built-in roles, so they do not depend on a paid custom-role plan.
const roles = new Map([
  ['org:admin', 'admin'], ['org:member', 'agent'],
  ['org:manager', 'manager'], ['org:agent', 'agent'], ['org:viewer', 'viewer'],
]);
export function appRoleFromOrgRole(role) {
  return typeof role === 'string' ? roles.get(role) ?? null : null;
}
export function clerkInvitationRole(role) {
  if (role === 'admin') return 'org:admin';
  if (role === 'agent') return 'org:member';
  return null;
}
