import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Building2, ChevronDown, GripVertical, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import { cn, formatRelativeTime, getLeadTierColor } from '@/lib/utils'
import { invalidateLeadSurfaceQueries } from '@/lib/lead-automation'
import {
  PIPELINE_STAGES,
  OUTSIDE_PIPELINE_STAGES,
  loadedPipelineLeads,
  nextPipelinePage,
  pipelinePage,
  type PipelineStageKey,
} from '@/lib/pipeline-data'
import { toast } from '@/stores/toast-store'
import { useAuthStore } from '@/stores/auth-store'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useChartTheme } from '@/hooks/use-chart-theme'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface PipelineLead {
  id: number
  name: string
  company: string | null
  status: string
  leadTier: string | null
  score: number | null
  product: string | null
  updatedAt: string
}

function usePipelineStage(stage: PipelineStageKey, scope: string) {
  return useInfiniteQuery({
    queryKey: ['pipeline-leads', scope, stage],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      pipelinePage<PipelineLead>(
        await api.get(
          `/leads?status=${stage}&page=${pageParam}&limit=50&sortBy=updatedAt&sortOrder=desc`,
        ),
      ),
    getNextPageParam: nextPipelinePage,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    meta: { silent: true },
  })
}

export default function PipelinePage() {
  const chartTheme = useChartTheme()
  const queryClient = useQueryClient()
  const scope = useAuthStore((state) => state.dashboardScope)
  const role = useAuthStore((state) => state.user?.role)
  const online = useOnlineStatus()
  const canEdit = Boolean(role && role !== 'viewer' && online)
  const [draggedLead, setDraggedLead] = useState<PipelineLead | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [activeStage, setActiveStage] = useState<PipelineStageKey>('new')
  const boardRef = useRef<HTMLDivElement | null>(null)
  const stageRefs = useRef<Record<string, HTMLElement | null>>({})
  // Fixed hook calls keep each stage independently pageable and recoverable.
  const newStage = usePipelineStage('new', scope)
  const contactedStage = usePipelineStage('contacted', scope)
  const repliedStage = usePipelineStage('replied', scope)
  const engagedStage = usePipelineStage('engaged', scope)
  const closedStage = usePipelineStage('closed', scope)
  const stageQueries = {
    new: newStage,
    contacted: contactedStage,
    replied: repliedStage,
    engaged: engagedStage,
    closed: closedStage,
  }
  const outside = useQuery({
    queryKey: ['pipeline-leads', scope, 'outside-path'],
    queryFn: () =>
      Promise.all(
        OUTSIDE_PIPELINE_STAGES.map(async (stage) => ({
          ...stage,
          count: pipelinePage(await api.get(`/leads?status=${stage.key}&page=1&limit=1`)).total,
        })),
      ),
    refetchInterval: 30_000,
    meta: { silent: true },
  })
  const stageTotals = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    count: stageQueries[stage.key].data?.pages[0]?.total,
  }))
  const haveAllTotals = stageTotals.every((stage) => stage.count !== undefined)
  const totalLeads = stageTotals.reduce((sum, stage) => sum + (stage.count ?? 0), 0)
  const stale = Object.values(stageQueries).some((query) => query.isError)

  useEffect(() => {
    const container = boardRef.current
    if (!container) return
    const syncActiveStage = () => {
      const center = container.scrollLeft + container.clientWidth / 2
      let nearest: PipelineStageKey = 'new'
      let distance = Number.POSITIVE_INFINITY
      for (const stage of PIPELINE_STAGES) {
        const node = stageRefs.current[stage.key]
        if (!node) continue
        const current = Math.abs(node.offsetLeft + node.offsetWidth / 2 - center)
        if (current < distance) {
          nearest = stage.key
          distance = current
        }
      }
      setActiveStage(nearest)
    }
    syncActiveStage()
    container.addEventListener('scroll', syncActiveStage, { passive: true })
    window.addEventListener('resize', syncActiveStage)
    return () => {
      container.removeEventListener('scroll', syncActiveStage)
      window.removeEventListener('resize', syncActiveStage)
    }
  }, [])

  const move = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: ({ lead, status }: { lead: PipelineLead; status: PipelineStageKey }) => {
      if (!canEdit) throw new Error('You cannot change the pipeline right now.')
      return api.patch(`/leads/${lead.id}`, { status })
    },
    // Keep server totals and all loaded pages authoritative. A status-only
    // optimistic patch cannot safely rebalance this paginated board.
    onSuccess: (_response, { status }) =>
      toast.success(
        `Lead moved to ${PIPELINE_STAGES.find((stage) => stage.key === status)?.label}`,
      ),
    onError: (error: Error) => toast.error(`Could not move lead: ${error.message}`),
    onSettled: () => invalidateLeadSurfaceQueries(queryClient),
  })
  const canMove = canEdit && !move.isPending
  const changeStage = (lead: PipelineLead, status: PipelineStageKey) => {
    if (canMove && lead.status !== status) move.mutate({ lead, status })
  }
  const scrollToStage = (stage: PipelineStageKey) => {
    const node = stageRefs.current[stage]
    if (!node || !boardRef.current) return
    boardRef.current.scrollTo({
      left: node.offsetLeft - 8,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
    setActiveStage(stage)
  }

  return (
    <div className="animate-fade-in space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            {haveAllTotals
              ? `${totalLeads.toLocaleString()} leads in the sales path`
              : 'Loading sales-path totals…'}
            {stale && ' · Showing last received data'}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {stageTotals.map((stage) => (
            <div key={stage.key}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                {stage.label}
              </p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                {stage.count?.toLocaleString() ?? '—'}
              </p>
            </div>
          ))}
        </div>
      </section>
      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="font-medium text-text-secondary">Outside the sales path</span>
          {outside.isPending ? (
            <span role="status" className="text-text-muted">
              Loading…
            </span>
          ) : outside.error ? (
            <>
              <span className="text-text-secondary">These totals are unavailable.</span>
              <Button size="sm" variant="ghost" onClick={() => void outside.refetch()}>
                Try again
              </Button>
            </>
          ) : (
            outside.data?.map((stage) => (
              <Link
                key={stage.key}
                to={`/leads?status=${stage.key}`}
                className="min-h-9 inline-flex items-center gap-2 rounded-md text-text-secondary underline-offset-4 hover:text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {stage.label}
                <span className="font-medium tabular-nums text-text-primary">
                  {stage.count.toLocaleString()}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
      {!online && (
        <p role="status" className="text-xs text-warning">
          You are offline. Showing loaded leads; stage changes will be available after reconnecting.
        </p>
      )}
      {move.isPending && (
        <p role="status" className="flex items-center gap-2 text-xs text-text-secondary">
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          Saving stage change…
        </p>
      )}
      <nav
        aria-label="Pipeline stages"
        className="sticky top-12 z-20 -mx-4 overflow-x-auto bg-background/95 px-4 py-2 backdrop-blur-md lg:hidden"
      >
        <div className="flex min-w-max gap-2">
          {stageTotals.map((stage) => (
            <button
              key={stage.key}
              type="button"
              aria-pressed={activeStage === stage.key}
              onClick={() => scrollToStage(stage.key)}
              className={cn(
                'min-h-11 rounded-md border border-border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                activeStage === stage.key
                  ? 'bg-accent text-accent-fg'
                  : 'bg-surface text-text-secondary',
              )}
            >
              {stage.label}{' '}
              <span className="ml-1 tabular-nums">{stage.count?.toLocaleString() ?? '—'}</span>
            </button>
          ))}
        </div>
      </nav>
      <div
        ref={boardRef}
        role="region"
        aria-label="Sales pipeline board"
        tabIndex={0}
        className="relative -mx-2 flex h-[calc(100dvh-20rem)] min-h-[380px] snap-x snap-mandatory gap-4 overflow-x-auto px-2 pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:mx-0 lg:px-0"
      >
        {PIPELINE_STAGES.map((stage) => {
          const query = stageQueries[stage.key]
          const leads = loadedPipelineLeads(query.data?.pages ?? [])
          const total = query.data?.pages[0]?.total
          const isTarget =
            canMove && dragOverStage === stage.key && draggedLead?.status !== stage.key
          return (
            <section
              key={stage.key}
              aria-label={`${stage.label} leads`}
              ref={(node) => {
                stageRefs.current[stage.key] = node
              }}
              className={cn(
                'flex min-h-0 w-[86vw] min-w-[270px] max-w-[330px] shrink-0 snap-start flex-col rounded-lg border bg-surface sm:w-[300px]',
                isTarget ? 'border-focus bg-focus-muted' : 'border-border',
              )}
              onDragOver={(event) => {
                if (canMove && draggedLead) {
                  event.preventDefault()
                  setDragOverStage(stage.key)
                }
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(event) => {
                event.preventDefault()
                if (draggedLead) changeStage(draggedLead, stage.key)
                setDraggedLead(null)
                setDragOverStage(null)
              }}
            >
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: chartTheme.pipelineColors[stage.key] }}
                  />
                  {stage.label}
                </h2>
                <span className="text-xs tabular-nums text-text-muted">
                  {total?.toLocaleString() ?? '—'}
                </span>
              </div>
              <p className="px-4 py-3 text-xs leading-5 text-text-muted">
                {isTarget ? `Drop to move to ${stage.label}` : stage.hint}
              </p>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {query.isPending ? (
                  <p role="status" className="px-3 py-8 text-center text-xs text-text-muted">
                    Loading leads…
                  </p>
                ) : null}
                {query.isError ? (
                  <div role="alert" className="rounded-md border border-danger/30 p-3">
                    <p className="text-xs leading-5 text-text-secondary">
                      {query.data
                        ? 'The latest update could not be loaded. Showing saved results.'
                        : 'This stage could not be loaded.'}
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      onClick={() => void query.refetch()}
                    >
                      Try again
                    </Button>
                  </div>
                ) : null}
                {!query.isPending && !query.isError && leads.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-text-muted">
                    No leads in this stage.
                  </div>
                ) : null}
                {leads.map((lead) => (
                  <article
                    key={lead.id}
                    draggable={canMove}
                    onDragStart={(event) => {
                      if (!canMove) return event.preventDefault()
                      event.dataTransfer.setData('text/plain', String(lead.id))
                      event.dataTransfer.effectAllowed = 'move'
                      setDraggedLead(lead)
                    }}
                    onDragEnd={() => {
                      setDraggedLead(null)
                      setDragOverStage(null)
                    }}
                    className={cn(
                      'rounded-md border border-border bg-background p-3',
                      draggedLead?.id === lead.id && 'opacity-50',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <Link
                          draggable={false}
                          to={`/leads?leadId=${lead.id}`}
                          className="block break-words text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                          {lead.name || 'Unnamed lead'}
                        </Link>
                        {lead.company && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
                            <Building2 aria-hidden="true" className="h-3 w-3 shrink-0" />
                            <span className="truncate">{lead.company}</span>
                          </p>
                        )}
                      </div>
                      {canMove && (
                        <GripVertical
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-text-muted"
                        />
                      )}
                    </div>
                    {lead.product && (
                      <p className="mt-2 truncate text-xs text-text-secondary">{lead.product}</p>
                    )}
                    <p className="mt-2 text-[11px] text-text-muted">
                      Updated {formatRelativeTime(lead.updatedAt)}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                      <div className="flex items-center gap-2">
                        {lead.leadTier && (
                          <span
                            className={cn('text-xs font-semibold', getLeadTierColor(lead.leadTier))}
                          >
                            {lead.leadTier}
                          </span>
                        )}
                        {lead.score != null && (
                          <span className="text-xs text-text-muted">Score {lead.score}</span>
                        )}
                      </div>
                      {role !== 'viewer' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!canMove}
                              aria-label={`Change stage for ${lead.name || 'this lead'}`}
                            >
                              Move
                              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
                            {PIPELINE_STAGES.map((target) => (
                              <DropdownMenuItem
                                key={target.key}
                                disabled={target.key === lead.status}
                                onSelect={() => changeStage(lead, target.key)}
                              >
                                {target.label}
                                {target.key === lead.status ? ' · current' : ''}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </article>
                ))}
                {total !== undefined && (
                  <p className="px-2 pt-2 text-center text-[11px] tabular-nums text-text-muted">
                    {leads.length.toLocaleString()} of {total.toLocaleString()} loaded
                  </p>
                )}
                {query.hasNextPage && (
                  <Button
                    className="w-full"
                    variant="secondary"
                    pending={query.isFetchingNextPage}
                    pendingLabel="Loading more…"
                    disabled={!online || query.isFetching}
                    onClick={() => void query.fetchNextPage()}
                  >
                    Load more leads
                  </Button>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
