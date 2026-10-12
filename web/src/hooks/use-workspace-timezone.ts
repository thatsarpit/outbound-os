import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '@/api/endpoints/settings'
import { useAuthStore } from '@/stores/auth-store'

export function useWorkspaceTimezone() {
  const scope = useAuthStore((state) => state.dashboardScope)
  const result = useQuery({
    queryKey: ['workspace-brand', scope],
    queryFn: settingsApi.getBrand,
    staleTime: 300_000,
    retry: 1,
  })
  const timezone = result.data?.timezone || 'UTC'
  let valid = false
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone })
    valid = true
  } catch {
    /* Show a recoverable unavailable state. */
  }
  return {
    timezone: valid ? timezone : 'UTC',
    ready: !!result.data && valid && !result.error,
    pending: result.isPending,
    retry: result.refetch,
  }
}
