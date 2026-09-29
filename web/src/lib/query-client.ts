import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from '@/stores/toast-store'

/* ── Query Client ──
 * Global mutation + query error handlers fire a toast whenever an API call
 * fails. Pages may opt out by passing `meta: { silent: true }` on the
 * mutation/query, or by providing their own `onError` (which doesn't suppress
 * the global one — they compose). Auth failures (401) are swallowed because
 * the api client already redirects to /login. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silent) return
      const msg = (error as Error)?.message || 'Something went wrong'
      // Swallow 401s — auth client already redirects
      if (/unauthorized|401/i.test(msg)) return
      toast.error(msg)
    },
    onSuccess: (_data, _variables, _context, mutation) => {
      // Only toast on success if the mutation declared a `successMessage` in meta.
      // Default behaviour stays silent so pages don't get a "Saved!" on every form blur.
      const m = mutation.meta?.successMessage
      if (typeof m === 'string' && m.length > 0) toast.success(m)
    },
  }),
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silent) return
      // Don't toast for background refetches — the user didn't ask for them.
      // Only toast when the query just transitioned to error state on the first load.
      if (query.state.data !== undefined) return
      const msg = (error as Error)?.message || 'Failed to load'
      if (/unauthorized|401/i.test(msg)) return
      toast.error(msg)
    },
  }),
})
