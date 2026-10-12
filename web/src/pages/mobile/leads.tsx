import { useDeferredValue, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Search } from 'lucide-react'
import { leadsApi } from '@/api/endpoints/leads'
import { useAuthStore } from '@/stores/auth-store'
import { MobileLeadPanel } from '@/components/mobile/lead-panel'
import {
  MobileError,
  MobilePagination,
  mobileButton,
  mobileInput,
  mobileLeadId,
} from '@/components/mobile/mobile-shared'

export default function MobileLeadsPage() {
  const { dashboardScope } = useAuthStore()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const deferred = useDeferredValue(search.trim())
  const selected = mobileLeadId(params.get('leadId'))
  const result = useQuery({
    refetchOnWindowFocus: true,
    queryKey: ['mobile-leads', dashboardScope, deferred, page],
    queryFn: () => leadsApi.getLeads({ search: deferred || undefined, page, limit: 25 }),
    enabled: !selected,
  })
  useEffect(() => {
    if (result.data) setPage((current) => Math.min(current, Math.max(1, result.data?.pages ?? 1)))
  }, [result.data])

  if (selected)
    return (
      <div className="space-y-3">
        <button type="button" className={mobileButton} onClick={() => setParams({})}>
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </button>
        <MobileLeadPanel key={selected} leadId={selected} />
      </div>
    )
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Shared workspace contacts. Open a lead to reply, call, or add a follow-up.
      </p>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-text-muted" />
        <span className="sr-only">Search leads</span>
        <input
          type="search"
          className={`${mobileInput} pl-9`}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
          placeholder="Search name, email or phone"
        />
      </label>
      {result.isPending ? (
        <p role="status" className="py-10 text-center text-sm text-text-muted">
          Loading leads…
        </p>
      ) : result.error ? (
        <MobileError message="Could not load leads." retry={() => result.refetch()} />
      ) : (
        <>
          <p className="text-xs tabular-nums text-text-muted">{result.data?.total ?? 0} leads</p>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            {result.data?.data.length ? (
              result.data.data.map((lead) => (
                <button
                  type="button"
                  key={lead.id}
                  onClick={() => setParams({ leadId: String(lead.id) })}
                  className="flex min-h-20 w-full items-center gap-3 border-b border-border-subtle px-4 py-3 text-left last:border-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {lead.name || 'Unnamed lead'}
                    </span>
                    <span className="mt-1 block truncate text-xs text-text-secondary">
                      {lead.company || lead.email || lead.mobile}
                    </span>
                    <span className="mt-1 block text-xs capitalize text-text-muted">
                      {lead.status.replace(/_/g, ' ')}
                      {lead.country ? ` · ${lead.country}` : ''}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
                </button>
              ))
            ) : (
              <p className="p-6 text-center text-sm text-text-muted">
                No matching leads. Try another search.
              </p>
            )}
          </div>
          <MobilePagination page={page} pages={result.data?.pages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  )
}
