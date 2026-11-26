import { useDeferredValue, useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Search, Users } from 'lucide-react'
import { leadsApi } from '@/api/endpoints/leads'
import { useMobileListScroll } from '@/hooks/use-mobile-list-scroll'
import { loadedMobileRows, nextMobilePage } from '@/lib/mobile-list'
import { useAuthStore } from '@/stores/auth-store'
import { MobileLeadPanel } from '@/components/mobile/lead-panel'
import {
  MobileError,
  MobileLoadMore,
  MobileRefresh,
  mobileButton,
  mobileInput,
  mobileLeadId,
  mobileSearchParams,
} from '@/components/mobile/mobile-shared'

export default function MobileLeadsPage() {
  const { dashboardScope } = useAuthStore()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || ''
  const search = params.get('search') || ''
  const page = mobileLeadId(params.get('page')) ?? 1
  const deferred = useDeferredValue(search.trim())
  const selected = mobileLeadId(params.get('leadId'))
  const { rememberScroll, returnToList } = useMobileListScroll(selected)
  const setFilters = (values: Record<string, string | null>) => {
    setParams(mobileSearchParams(values), { replace: true, preventScrollReset: true })
  }
  const result = useInfiniteQuery({
    refetchOnWindowFocus: true,
    queryKey: ['mobile-leads', dashboardScope, deferred, page, status],
    initialPageParam: page,
    queryFn: ({ pageParam }) =>
      leadsApi.getLeads({ search: deferred || undefined, status, page: pageParam, limit: 25 }),
    getNextPageParam: nextMobilePage,
    enabled: !selected,
    refetchInterval: (query) => 30_000 * (query.state.data?.pages.length ?? 1),
  })
  const firstPage = result.data?.pages[0]
  const pages = Math.max(1, firstPage?.pages ?? 1)
  useEffect(() => {
    if (selected || !firstPage || page <= pages) return
    if (new URLSearchParams(window.location.search).toString() !== params.toString()) return
    setParams(mobileSearchParams({ page: null }, params), {
      replace: true,
      preventScrollReset: true,
    })
  }, [firstPage, page, pages, params, selected, setParams])

  if (selected)
    return (
      <div className="space-y-3">
        <button
          type="button"
          className={mobileButton}
          onClick={() => returnToList(() => setFilters({ leadId: null }))}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </button>
        <MobileLeadPanel key={selected} leadId={selected} />
      </div>
    )
  const rows = loadedMobileRows(
    result.data?.pages.map((response) => response.data) ?? [],
    (lead) => lead.id,
  )
  const total = firstPage?.total ?? rows.length
  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-3 top-4 size-4 text-text-muted"
          aria-hidden="true"
        />
        <span className="sr-only">Search leads</span>
        <input
          type="search"
          className={`${mobileInput} min-h-12 rounded-xl pl-9`}
          value={search}
          onChange={(event) => setFilters({ search: event.target.value || null, page: null })}
          placeholder="Search name, email or phone"
        />
      </label>
      <label className="flex items-center justify-between gap-2 text-sm font-medium text-text-secondary">
        Lead status
        <select
          aria-label="Filter lead status"
          className={`${mobileInput} max-w-[70%]`}
          value={status}
          onChange={(event) => setFilters({ status: event.target.value || null, page: null })}
        >
          <option value="">All statuses</option>
          {[
            'new',
            'contacted',
            'replied',
            'engaged',
            'closed',
            'paused',
            'wa_unavailable',
            'wa_undelivered',
          ].map((value) => (
            <option key={value} value={value}>
              {value.replace(/^wa_/, 'WhatsApp ').replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {firstPage && (
          <p className="text-xs font-medium tabular-nums text-text-muted" role="status">
            {total} leads{rows.length < total && ` · ${rows.length} loaded`}
          </p>
        )}
        <MobileRefresh
          updatedAt={result.dataUpdatedAt}
          refreshing={result.isFetching}
          stale={result.isRefetchError}
          retry={() => void result.refetch()}
        />
      </div>
      {result.isPending && result.fetchStatus !== 'paused' ? (
        <p role="status" className="py-10 text-center text-sm text-text-muted">
          Loading leads…
        </p>
      ) : result.fetchStatus === 'paused' && !result.data ? null : result.isLoadingError ? (
        <MobileError message="Could not load leads." retry={() => result.refetch()} />
      ) : (
        <>
          {rows.length ? (
            <ul
              role="list"
              className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border bg-surface"
            >
              {rows.map((lead) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => {
                      rememberScroll()
                      setParams(mobileSearchParams({ leadId: String(lead.id) }))
                    }}
                    className="flex min-h-20 w-full items-center gap-3 px-4 py-3 text-left focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus active:bg-surface-raised"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {lead.name || 'Unnamed lead'}
                      </span>
                      <span className="mt-1 block truncate text-xs text-text-secondary">
                        {lead.company ||
                          lead.email ||
                          (!lead.mobile.startsWith('no-phone:')
                            ? lead.mobile
                            : 'Contact details pending')}
                      </span>
                      <span className="mt-1 block text-xs capitalize text-text-muted">
                        {lead.status.replace(/_/g, ' ')}
                        {lead.country ? ` · ${lead.country}` : ''}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-border bg-surface p-8 text-center">
              <Users className="mx-auto size-8 text-accent" aria-hidden="true" />
              <h2 className="mt-3 font-medium">
                {deferred || status ? 'No matching leads' : 'No leads yet'}
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                {deferred || status
                  ? 'Try another search or change the status filter.'
                  : 'New leads will appear here when they come in.'}
              </p>
            </div>
          )}
          <MobileLoadMore
            hasMore={result.hasNextPage}
            busy={result.isFetching}
            loading={result.isFetchingNextPage}
            failed={result.isFetchNextPageError}
            onLoad={() => void result.fetchNextPage({ cancelRefetch: false })}
            onStartOver={page > 1 ? () => setFilters({ page: null }) : undefined}
          />
        </>
      )}
    </div>
  )
}
