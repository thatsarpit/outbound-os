import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { Lead, LeadStatus } from '@/api/types'

export function getLeadAutomationAction(status: LeadStatus) {
  const isPaused = status === 'paused'

  return {
    isPaused,
    nextStatus: isPaused ? ('new' as const) : ('paused' as const),
    label: isPaused ? 'Resume automation' : 'Pause automation',
    shortLabel: isPaused ? 'Resume' : 'Pause',
  }
}

export function invalidateLeadSurfaceQueries(queryClient: QueryClient) {
  const queryKeys = [
    ['leads'],
    ['pipeline-leads'],
    ['overview-stats'],
    ['overview-charts'],
    ['analytics-charts'],
    ['analytics-funnel'],
    ['analytics-campaign-roi'],
    ['inbox-threads'],
  ] as const

  for (const queryKey of queryKeys) {
    void queryClient.invalidateQueries({ queryKey })
  }
}

/**
 * Snapshot for an optimistic patch. Returned by `optimisticLeadPatch` so the
 * caller can pass it to `rollbackLeadPatch` from a mutation's onError handler.
 */
export type LeadPatchSnapshot = { entries: Array<[QueryKey, unknown]> }

/**
 * Optimistically apply a partial Lead update to every cached `['leads', ...]`
 * + `['pipeline-leads', ...]` query so the UI flips instantly while the
 * mutation is in flight. Returns a snapshot you must pass to
 * `rollbackLeadPatch` from `onError` to restore the previous cache on failure.
 *
 *   const mut = useMutation({
 *     mutationFn: ...,
 *     onMutate: ({ leadId, patch }) => optimisticLeadPatch(qc, leadId, patch),
 *     onError: (_e, _v, ctx) => ctx && rollbackLeadPatch(qc, ctx),
 *     onSettled: () => invalidateLeadSurfaceQueries(qc),
 *   })
 *
 * Works for both the paginated listing shape (`{ data: Lead[], total, pages }`)
 * and the flat-array pipeline shape (`Lead[]`).
 */
export async function optimisticLeadPatch(
  queryClient: QueryClient,
  leadId: number,
  patch: Partial<Lead>,
): Promise<LeadPatchSnapshot> {
  // Cancel in-flight refetches so they don't overwrite our optimistic data.
  await Promise.all([
    queryClient.cancelQueries({ queryKey: ['leads'] }),
    queryClient.cancelQueries({ queryKey: ['pipeline-leads'] }),
  ])

  const entries: Array<[QueryKey, unknown]> = [
    ...queryClient.getQueriesData({ queryKey: ['leads'] }),
    ...queryClient.getQueriesData({ queryKey: ['pipeline-leads'] }),
  ]

  const apply = (old: unknown): unknown => {
    if (!old) return old
    // Paginated listing shape
    if (
      typeof old === 'object' &&
      'data' in (old as object) &&
      Array.isArray((old as { data: unknown }).data)
    ) {
      const cast = old as { data: Lead[] } & Record<string, unknown>
      return { ...cast, data: cast.data.map((l) => (l.id === leadId ? { ...l, ...patch } : l)) }
    }
    // Flat array shape
    if (Array.isArray(old)) {
      return (old as Lead[]).map((l) => (l.id === leadId ? { ...l, ...patch } : l))
    }
    return old
  }

  queryClient.setQueriesData({ queryKey: ['leads'] }, apply)
  queryClient.setQueriesData({ queryKey: ['pipeline-leads'] }, apply)

  return { entries }
}

/** Restore the cache to its pre-mutation state. Call from `onError`. */
export function rollbackLeadPatch(queryClient: QueryClient, snapshot: LeadPatchSnapshot) {
  for (const [key, val] of snapshot.entries) {
    queryClient.setQueryData(key, val)
  }
}
