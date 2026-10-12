type SessionIdentity = { dashboardScope: string; user: { role: string } | null }

/** Cached API data belongs to one session and permission set. Token refreshes
 * keep it; switching users/workspaces or changing roles discards it immediately.
 */
export function bindSessionCache(
  store: {
    subscribe: (listener: (state: SessionIdentity, previous: SessionIdentity) => void) => () => void
  },
  cache: { clear: () => void },
): () => void {
  return store.subscribe((state, previous) => {
    if (
      state.dashboardScope !== previous.dashboardScope ||
      state.user?.role !== previous.user?.role
    )
      cache.clear()
  })
}
