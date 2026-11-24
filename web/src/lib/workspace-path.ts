// A document belongs to one workspace for its entire lifetime. The URL, not a
// shared cookie or local-storage key, keeps unrelated tabs and links scoped.
const match = typeof window === 'undefined'
  ? null
  : /^\/w\/([a-z][a-z0-9-]{0,39})(?:\/|$)/.exec(window.location.pathname)

export const workspaceId = match?.[1] ?? 'primary'
export const workspaceBase = match ? `/w/${workspaceId}` : ''
export const isWorkspacePath = typeof window !== 'undefined' && /^\/w(?:\/|$)/.test(window.location.pathname)
export const workspaceApiPath = (path: string) =>
  workspaceBase ? `/api/workspaces/${workspaceId}${path}` : `/api${path}`

export function workspaceHome(id: string, mobile: boolean) {
  const base = id === 'primary' ? '' : `/w/${id}`
  return base + (mobile ? '/m/inbox' : '/')
}
