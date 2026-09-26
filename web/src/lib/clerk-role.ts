import type { AppRole } from './role-shell'

/**
 * Mirrors ORG_ROLE_TO_APP_ROLE in src/auth/clerkAuth.js on the backend.
 * Duplicated deliberately — frontend and backend are separate runtimes/
 * deploys, so there is nothing meaningful to import between them. Keep the
 * two in sync by hand if the Clerk dashboard role slugs ever change.
 */
const ORG_ROLE_TO_APP_ROLE: Record<string, AppRole> = {
  'org:viewer': 'viewer',
  'org:agent': 'agent',
  'org:manager': 'manager',
  'org:admin': 'admin',
  // Falls back to 'agent' (not 'viewer') on Clerk's built-in org:member role,
  // so an under-provisioned account reads as too-much access rather than
  // silently locking someone out — loud and noticed beats silent and stuck.
  'org:member': 'agent',
}

export function appRoleFromOrgRole(orgRole: string | null | undefined): AppRole | null {
  if (!orgRole) return null
  return ORG_ROLE_TO_APP_ROLE[orgRole] ?? null
}
