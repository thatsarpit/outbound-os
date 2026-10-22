import { Router } from 'express';
import { appRoleFromOrgRole, clerkInvitationRole } from '../../shared/clerkRoles.js';

// Dependencies are explicit so permission and provider payload tests never send
// real invitations or require a Clerk account.
export function createClerkTeamRouter({ client, requireRole }) {
  const router = Router();
  const failure = (res, error) => res.status(error?.status >= 400 && error.status < 600 ? error.status : 500)
    .json({ error: error?.errors?.[0]?.longMessage || error.message });
  const invitationPayload = (inv) => ({
    id: inv.id, email: inv.emailAddress, role: appRoleFromOrgRole(inv.role),
    createdAt: new Date(inv.createdAt).toISOString(), expiresAt: new Date(inv.expiresAt).toISOString(), expired: false,
  });
  router.get('/members', requireRole('admin'), async (req, res) => {
    if (!client) return res.status(409).json({ error: 'Use local user management with built-in sign-in.' });
    try {
      const members = [];
      let offset = 0;
      while (true) {
        const page = await client.organizations.getOrganizationMembershipList({ organizationId: req.user.orgId, limit: 100, offset });
        members.push(...page.data.map(member => ({
          id: member.publicUserData?.userId || member.id,
          name: [member.publicUserData?.firstName, member.publicUserData?.lastName].filter(Boolean).join(' ') || member.publicUserData?.identifier || 'Unavailable member',
          email: member.publicUserData?.identifier || '',
          role: appRoleFromOrgRole(member.role),
        })));
        offset += page.data.length;
        if (!page.data.length || offset >= page.totalCount) break;
      }
      res.json(members);
    } catch (error) { failure(res, error); }
  });
  router.get('/invitations', requireRole('manager'), async (req, res) => {
    if (!client) return res.json([]);
    try {
      const invitations = [];
      let offset = 0;
      while (true) {
        const page = await client.organizations.getOrganizationInvitationList({ organizationId: req.user.orgId, status: ['pending'], limit: 100, offset });
        invitations.push(...page.data.map(invitationPayload));
        offset += page.data.length;
        if (!page.data.length || offset >= page.totalCount) break;
      }
      res.json(invitations);
    } catch (error) { failure(res, error); }
  });
  router.post('/invitations', requireRole('admin'), async (req, res) => {
    if (!client) return res.status(409).json({ error: 'Email invitations need Clerk sign-in. Add the teammate under Team → Users instead.', code: 'INVITES_REQUIRE_CLERK' });
    const { email, role = 'agent' } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: 'A valid email is required.' });
    const orgRole = clerkInvitationRole(role);
    if (!orgRole) return res.status(400).json({ error: 'Clerk invitations support Admin or Sales agent. Choose admin or agent.' });
    try {
      const invitation = await client.organizations.createOrganizationInvitation({
        organizationId: req.user.orgId, emailAddress: email.trim().toLowerCase(), role: orgRole, inviterUserId: req.user.id,
      });
      res.status(201).json({ invitation: invitationPayload(invitation), emailSent: true });
    } catch (error) { failure(res, error); }
  });
  router.delete('/invitations/:id', requireRole('admin'), async (req, res) => {
    if (!client) return res.status(404).json({ error: 'Invitation not found' });
    try {
      await client.organizations.revokeOrganizationInvitation({ organizationId: req.user.orgId, invitationId: req.params.id, requestingUserId: req.user.id });
      res.json({ ok: true });
    } catch (error) { failure(res, error); }
  });
  return router;
}
