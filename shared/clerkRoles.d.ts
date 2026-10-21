export type ClerkAppRole = 'admin' | 'manager' | 'agent' | 'viewer'
export function appRoleFromOrgRole(role: unknown): ClerkAppRole | null
export function clerkInvitationRole(role: unknown): 'org:admin' | 'org:member' | null
