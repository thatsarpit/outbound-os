import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { cn, formatRelativeTime, getLeadTierColor } from '@/lib/utils'
import {
  invalidateLeadSurfaceQueries,
  optimisticLeadPatch,
  rollbackLeadPatch,
} from '@/lib/lead-automation'
import { toast } from '@/stores/toast-store'
import { useChartTheme } from '@/hooks/use-chart-theme'
import { Loader2, GripVertical, Building2, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const PIPELINE_STAGES = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'replied', label: 'Replied' },
  { key: 'engaged', label: 'Engaged' },
  { key: 'closed', label: 'Closed' },
] as const

function getStageHint(stageKey: (typeof PIPELINE_STAGES)[number]['key']) {
  switch (stageKey) {
    case 'new':
      return 'Fresh intake and untouched leads.'
    case 'contacted':
      return 'Leads already reached by the team.'
    case 'replied':
      return 'Responses ready for the next move.'
    case 'engaged':
      return 'Active conversations needing follow-through.'
    case 'closed':
      return 'Completed opportunities and wins.'
    default:
      return ''
  }
}

interface PipelineLead {
  id: number
  name: string
  company: string | null
  mobile: string
  status: string
  leadTier: string | null
  score: number | null
  product: string | null
  createdAt: string
  updatedAt: string
  messages?: { content: string; createdAt: string }[]
}

export default function PipelinePage() {
  const chartTheme = useChartTheme()
  const queryClient = useQueryClient()
  const [draggedLead, setDraggedLead] = useState<PipelineLead | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [activeStage, setActiveStage] = useState<(typeof PIPELINE_STAGES)[number]['key']>('new')
  const boardRef = useRef<HTMLDivElement | null>(null)
  const stageRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Fetch leads grouped by status — use the existing leads endpoint
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pipeline-leads'],
    queryFn: async () => {
      const results = await Promise.all(
        PIPELINE_STAGES.map((stage) =>
          api.get<{ leads: PipelineLead[]; total: number }>(
            `/leads?status=${stage.key}&limit=50&sortBy=updatedAt&sortOrder=desc`,
          ),
        ),
      )
      const grouped: Record<string, PipelineLead[]> = {}
      PIPELINE_STAGES.forEach((stage, i) => {
        grouped[stage.key] = results[i]?.leads || []
      })
      return grouped
    },
    refetchInterval: 30_000,
  })

  const stageTotals = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    count: data?.[stage.key]?.length || 0,
  }))
  const totalLeads = stageTotals.reduce((sum, stage) => sum + stage.count, 0)
  const activeColumns = stageTotals.filter((stage) => stage.count > 0).length

  useEffect(() => {
    const container = boardRef.current
    if (!container) return

    const syncActiveStage = () => {
      const center = container.scrollLeft + container.clientWidth / 2
      let closestStage: (typeof PIPELINE_STAGES)[number]['key'] = PIPELINE_STAGES[0].key
      let closestDistance = Number.POSITIVE_INFINITY

      for (const stage of PIPELINE_STAGES) {
        const node = stageRefs.current[stage.key]
        if (!node) continue

        const stageCenter = node.offsetLeft + node.offsetWidth / 2
        const distance = Math.abs(stageCenter - center)
        if (distance < closestDistance) {
          closestDistance = distance
          closestStage = stage.key
        }
      }

      setActiveStage(closestStage)
    }

    syncActiveStage()
    container.addEventListener('scroll', syncActiveStage, { passive: true })
    window.addEventListener('resize', syncActiveStage)

    return () => {
      container.removeEventListener('scroll', syncActiveStage)
      window.removeEventListener('resize', syncActiveStage)
    }
  }, [])

  const moveMutation = useMutation({
    mutationFn: ({ leadId, newStatus }: { leadId: number; newStatus: string }) =>
      api.patch(`/leads/${leadId}`, { status: newStatus }),
    // Drag-and-drop has to feel instant — flip the lead's status optimistically
    // so the card sits in its new column before the server confirms.
    onMutate: ({ leadId, newStatus }) =>
      optimisticLeadPatch(queryClient, leadId, { status: newStatus as never }),
    onError: (error: Error, _vars, ctx) => {
      if (ctx) rollbackLeadPatch(queryClient, ctx)
      toast.error(`Failed to move lead: ${error.message}`)
    },
    onSettled: () => invalidateLeadSurfaceQueries(queryClient),
  })

  const handleDragStart = (lead: PipelineLead) => {
    setDraggedLead(lead)
  }

  const handleDragOver = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault()
    setDragOverStage(stageKey)
  }

  const handleDrop = (stageKey: string) => {
    if (draggedLead && draggedLead.status !== stageKey) {
      moveMutation.mutate({ leadId: draggedLead.id, newStatus: stageKey })
    }
    setDraggedLead(null)
    setDragOverStage(null)
  }

  const scrollToStage = (stageKey: (typeof PIPELINE_STAGES)[number]['key']) => {
    const container = boardRef.current
    const target = stageRefs.current[stageKey]
    if (!container || !target) return

    container.scrollTo({
      left: target.offsetLeft - 8,
      behavior: 'smooth',
    })
    setActiveStage(stageKey)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <p className="text-sm font-medium text-danger">Failed to load pipeline</p>
          <p className="mt-1 text-xs text-text-muted">Please refresh the page to try again.</p>
        </div>
      </div>
    )
  }

  const isEmptyBoard = totalLeads === 0

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
          {/* "Drag: Drop to move" and "Mobile: Swipe stages" used to sit here as
              chips. They were instructions dressed up as statistics; the board
              itself teaches the interaction. */}
          <p className="mt-1 text-[13px] text-text-secondary">
            <span className="tabular-nums">{totalLeads.toLocaleString()}</span>{' '}
            {totalLeads === 1 ? 'lead' : 'leads'} across{' '}
            <span className="tabular-nums">{activeColumns}</span>{' '}
            {activeColumns === 1 ? 'stage' : 'stages'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {stageTotals.map((stage) => (
            <div key={stage.key} className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                {stage.label}
              </p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
                {stage.count}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="sticky top-12 z-20 -mx-4 px-4 lg:hidden">
        <div className="scrollbar-hide overflow-x-auto rounded-md border border-border bg-surface/95 px-2 py-2 shadow-sm backdrop-blur-md">
          <div className="flex min-w-max gap-2">
            {stageTotals.map((stage) => (
              <button
                key={stage.key}
                type="button"
                onClick={() => scrollToStage(stage.key)}
                className={cn(
                  'shrink-0 rounded-md px-3 py-2 text-left transition-all',
                  activeStage === stage.key
                    ? 'bg-accent text-accent-fg shadow-sm'
                    : 'bg-surface-raised text-text-secondary',
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                  {stage.label}
                </p>
                <p
                  className={cn(
                    'mt-1 text-sm font-semibold',
                    activeStage === stage.key ? 'text-accent-fg' : 'text-text-primary',
                  )}
                >
                  {stage.count}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={boardRef}
        className="scrollbar-hide -mx-2 flex min-h-0 gap-4 overflow-x-auto px-2 pb-4 snap-x snap-mandatory lg:mx-0 lg:px-0"
        style={{ minHeight: 'calc(100vh - 18rem)' }}
      >
        {PIPELINE_STAGES.map((stage) => {
          const leads = data?.[stage.key] || []
          const isDragOver = dragOverStage === stage.key
          // Visual states while a card is being dragged: highlight the column
          // under the cursor, show every other column as a dashed drop target,
          // and mark the card's own column as the (no-op) source.
          const isDragging = !!draggedLead
          const isSource = draggedLead?.status === stage.key
          const isDropTarget = isDragOver && !isSource

          return (
            <div
              key={stage.key}
              ref={(node) => {
                stageRefs.current[stage.key] = node
              }}
              className={cn(
                'flex min-h-0 min-w-[86vw] max-w-[330px] flex-1 snap-start flex-col rounded-lg sm:min-w-[270px] lg:min-w-[280px] xl:min-w-[300px]',
                'glass border transition-all duration-200',
                isDropTarget && 'border-accent bg-accent-muted/10 shadow-sm',
                isDragging && !isDragOver && !isSource && 'border-dashed border-border/70',
                !isDragging && 'border-transparent',
                isDragging && isSource && 'border-transparent opacity-60',
              )}
              onDragOver={(e) => handleDragOver(e, stage.key)}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={() => handleDrop(stage.key)}
            >
              {isDropTarget && (
                <div className="pointer-events-none px-4 pt-3">
                  <div className="rounded-md border border-dashed border-focus/60 bg-focus-muted px-3 py-1.5 text-center text-[11px] font-medium text-focus">
                    Drop to move to {stage.label}
                  </div>
                </div>
              )}
              {/* Column Header */}
              <div className="px-4 py-3.5 flex items-center justify-between border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <div className="relative flex w-2.5 h-2.5 items-center justify-center">
                    <span
                      className="absolute inline-flex h-full w-full rounded-full opacity-60 blur-[3px]"
                      style={{ backgroundColor: chartTheme.pipelineColors[stage.key] || '#6b7280' }}
                    />
                    <span
                      className="relative inline-flex rounded-full h-2 w-2"
                      style={{ backgroundColor: chartTheme.pipelineColors[stage.key] || '#6b7280' }}
                    />
                  </div>
                  <span className="text-sm font-semibold">{stage.label}</span>
                </div>
                <span className="rounded-sm bg-surface-raised px-1.5 py-0.5 text-xs tabular-nums text-text-muted">
                  {stageTotals.find((item) => item.key === stage.key)?.count ?? leads.length}
                </span>
              </div>
              <div className="px-4 pt-3 text-xs leading-5 text-text-muted">
                {getStageHint(stage.key)}
              </div>

              {/* Cards */}
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                {leads.length === 0 ? (
                  <div className="flex h-full min-h-[140px] items-center justify-center rounded-md border border-dashed border-border bg-surface-raised/40 px-4 text-center">
                    <div>
                      <p className="text-sm font-medium text-text-primary">No leads</p>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">
                        {stage.key === 'new' &&
                          'Leads will appear here when they are first synced.'}
                        {stage.key !== 'new' &&
                          `Drop leads here to advance ${stage.label.toLowerCase()}.`}
                      </p>
                    </div>
                  </div>
                ) : (
                  leads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => handleDragStart(lead)}
                      onDragEnd={() => {
                        setDraggedLead(null)
                        setDragOverStage(null)
                      }}
                      className={cn(
                        'rounded-md border border-border bg-surface p-2.5 shadow-sm card-hover',
                        'cursor-grab active:cursor-grabbing',
                        'transition-all duration-200',
                        draggedLead?.id === lead.id && 'opacity-40 scale-95',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{lead.name}</p>
                          {lead.company && (
                            <p className="text-text-muted text-xs flex items-center gap-1 mt-0.5">
                              <Building2 className="w-3 h-3 shrink-0" />
                              <span className="truncate">{lead.company}</span>
                            </p>
                          )}
                        </div>
                        <GripVertical className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-[11px] text-text-muted">
                        {lead.product && (
                          <span className="truncate rounded-sm bg-surface-raised px-1.5 py-0.5">
                            {lead.product}
                          </span>
                        )}
                        <span className="rounded-sm bg-surface-raised px-1.5 py-0.5">
                          Updated {formatRelativeTime(lead.updatedAt)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-subtle">
                        <div className="flex items-center gap-2">
                          {lead.leadTier && (
                            <span
                              className={cn('text-xs font-bold', getLeadTierColor(lead.leadTier))}
                            >
                              {lead.leadTier}
                            </span>
                          )}
                          {lead.score != null && (
                            <span className="text-xs text-text-muted">Score: {lead.score}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
      {isEmptyBoard && (
        <div className="glass rounded-lg border border-dashed border-border px-6 py-8 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-text-muted/60 animate-pulse" />
          <p className="mt-3 text-sm font-medium text-text-primary">Pipeline is empty</p>
          <p className="mt-2 text-sm text-text-secondary">
            Once leads arrive, they will appear here and can be moved through each stage.
          </p>
        </div>
      )}
    </div>
  )
}
