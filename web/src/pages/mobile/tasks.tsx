import { useEffect } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { tasksApi } from '@/api/endpoints/tasks'
import { useWorkspaceTimezone } from '@/hooks/use-workspace-timezone'
import { useAuthStore } from '@/stores/auth-store'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { loadedMobileRows, nextMobilePage } from '@/lib/mobile-list'
import { toast } from '@/stores/toast-store'
import {
  MobileError,
  MobileLoadMore,
  MobileRefresh,
  mobileButton,
  mobileDueDate,
  mobileLeadId,
  mobileSearchParams,
} from '@/components/mobile/mobile-shared'

export default function MobileTasksPage() {
  const { dashboardScope, user } = useAuthStore()
  const online = useOnlineStatus()
  const { timezone } = useWorkspaceTimezone()
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const ownership = params.get('scope') === 'mine' && user?.role !== 'viewer' ? 'mine' : 'workspace'
  const showAll = params.get('show') === 'all'
  const page = mobileLeadId(params.get('page')) ?? 1
  const setFilters = (values: Record<string, string | null>) => {
    setParams(mobileSearchParams(values), { replace: true, preventScrollReset: true })
  }
  const result = useInfiniteQuery({
    refetchOnWindowFocus: true,
    queryKey: ['mobile-tasks', dashboardScope, page, showAll, ownership],
    initialPageParam: page,
    queryFn: async ({ pageParam }) => {
      const response = await tasksApi.listTeamTasks({
        page: pageParam,
        limit: 25,
        done: showAll,
        scope: ownership,
      })
      if (!response || !Array.isArray(response.tasks))
        throw new Error('The follow-up response was incomplete.')
      return response
    },
    getNextPageParam: nextMobilePage,
    refetchInterval: (query) => 30_000 * (query.state.data?.pages.length ?? 1),
  })
  const firstPage = result.data?.pages[0]
  const pages = Math.max(1, firstPage?.pages ?? 1)
  useEffect(() => {
    if (!firstPage || page <= pages) return
    if (new URLSearchParams(window.location.search).toString() !== params.toString()) return
    setParams(mobileSearchParams({ page: null }, params), {
      replace: true,
      preventScrollReset: true,
    })
  }, [firstPage, page, pages, params, setParams])

  const complete = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: ({ leadId, id, done }: { leadId: number; id: number; done: boolean }) =>
      tasksApi.update(leadId, id, { done: !done }),
    onSuccess: (_, task) => {
      client.invalidateQueries({ queryKey: ['mobile-tasks'] })
      client.invalidateQueries({ queryKey: ['lead-tasks'] })
      toast.success(task.done ? 'Follow-up reopened' : 'Follow-up completed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
  const rows = loadedMobileRows(
    result.data?.pages.map((response) => response.tasks) ?? [],
    (task) => task.id,
  )
  const total = firstPage?.total ?? rows.length
  return (
    <div className="space-y-3">
      <div
        className="flex rounded-xl border border-border bg-surface p-1"
        role="group"
        aria-label="Follow-up status"
      >
        {[false, true].map((all) => (
          <button
            type="button"
            key={String(all)}
            aria-pressed={showAll === all}
            onClick={() => setFilters({ show: all ? 'all' : null, page: null })}
            className={`min-h-11 flex-1 rounded-lg text-sm focus-visible:outline-2 focus-visible:outline-focus ${showAll === all ? 'bg-accent-muted font-semibold text-accent' : 'text-text-muted'}`}
          >
            {all ? 'All follow-ups' : 'Pending'}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 text-sm font-medium text-text-secondary">
        <label htmlFor="task-ownership">Follow-ups for</label>
        <select
          id="task-ownership"
          value={ownership}
          onChange={(event) =>
            setFilters({ scope: event.target.value === 'mine' ? 'mine' : null, page: null })
          }
          className="min-h-11 min-w-0 max-w-[70%] rounded-lg border border-border bg-surface px-3 text-text-primary"
        >
          <option value="workspace">Workspace leads</option>
          {user?.role !== 'viewer' && <option value="mine">My assigned leads</option>}
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {firstPage && (
          <p className="text-xs font-medium tabular-nums text-text-muted" role="status">
            {total} {showAll ? 'follow-ups' : 'pending'}
            {rows.length < total && ` · ${rows.length} loaded`}
            {!!firstPage.overdueCount && (
              <span className="text-warning"> · {firstPage.overdueCount} overdue</span>
            )}
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
          Loading follow-ups…
        </p>
      ) : result.fetchStatus === 'paused' && !result.data ? null : result.isLoadingError ? (
        <MobileError message="Could not load follow-ups." retry={() => result.refetch()} />
      ) : (
        <>
          {rows.length ? (
            <ul
              role="list"
              className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border bg-surface"
            >
              {rows.map((task) => (
                <li key={task.id} className="flex items-start gap-2 p-3">
                  <button
                    type="button"
                    aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.title}`}
                    className={`${mobileButton} w-11 shrink-0 px-0 ${task.done ? 'text-accent' : 'text-text-muted'}`}
                    disabled={!online || user?.role === 'viewer' || complete.isPending}
                    onClick={() => complete.mutate(task)}
                  >
                    <Check className="h-5 w-5" />
                  </button>
                  <Link
                    to={`/m/leads?leadId=${task.leadId}`}
                    className="flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-focus active:bg-surface-raised"
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block break-words text-sm font-medium ${task.done ? 'line-through text-text-muted' : ''}`}
                      >
                        {task.title}
                      </span>
                      <span className="mt-1 block truncate text-xs text-text-secondary">
                        {task.leadName || 'Open lead'}
                      </span>
                      <span
                        className={`mt-1 block text-xs ${task.overdue ? 'text-warning' : 'text-text-muted'}`}
                      >
                        {task.done ? 'Completed · ' : ''}
                        {mobileDueDate(task.dueAt, timezone)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-border bg-surface p-8 text-center">
              <Check className="mx-auto h-8 w-8 text-accent" aria-hidden="true" />
              <p className="mt-3 font-medium">
                {showAll ? 'No follow-ups yet' : 'No pending follow-ups'}
              </p>
              <p className="mt-2 text-sm text-text-muted">
                Add the next action from any lead or conversation.
              </p>
              <Link to="/m/leads" className={`${mobileButton} mt-4`}>
                Open leads
              </Link>
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
