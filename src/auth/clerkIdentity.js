import { appRoleFromOrgRole } from '../../shared/clerkRoles.js';

export function clerkWorkspaceIdentity(auth, env = process.env) {
  const role = appRoleFromOrgRole(auth?.orgRole);
  if (!auth?.userId || !auth?.orgId || !role) return null;
  const workspace = String(env.CLERK_ORGANIZATION_ID || '').trim();
  // CRM rows are shared within this installation, not isolated by Clerk org.
  // A production key must therefore be pinned to the intended workspace.
  if (!workspace && String(env.CLERK_SECRET_KEY || '').startsWith('sk_live_')) return null;
  if (workspace && auth.orgId !== workspace) return null;
  return { userId: auth.userId, orgId: auth.orgId, role };
}

// verifyToken checks the signature and expiry first. Normalize both supported
// claim formats so SSE applies the same workspace and role gate as HTTP.
export function clerkSessionIdentity(claims, env = process.env) {
  if (claims?.sts === 'pending') return null;
  const v2 = claims?.v === 2;
  return clerkWorkspaceIdentity({
    userId: claims?.sub,
    orgId: v2 ? claims?.o?.id : claims?.org_id,
    orgRole: v2 && typeof claims?.o?.rol === 'string' ? `org:${claims.o.rol}` : v2 ? null : claims?.org_role,
  }, env);
}
