import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

/**
 * The workspace's home currency (Settings → Workspace): what supplier costs,
 * bank credits and profit are in. Shares the cached /config/brand response.
 */
export function useHomeCurrency(): string {
  const { data } = useQuery({
    queryKey: ['brand'],
    queryFn: async () => {
      const res = await api.get<{ currency?: string }>('/config/brand')
      if (!res) throw new Error('Empty response')
      return res
    },
    staleTime: 300_000,
    meta: { silent: true },
  })
  return data?.currency || 'USD'
}
