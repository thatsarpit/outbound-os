import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { LeadDetailDrawer } from '@/components/leads/lead-detail-drawer'
import {
  loadViews,
  saveViews,
  sameFilters,
  viewFiltersFrom,
  type SavedView,
} from '@/lib/saved-views'
import { leadsApi, type LeadFilters } from '@/api/endpoints/leads'
import type { Lead } from '@/api/types'
import { AiOutreachButton } from '@/components/leads/ai-outreach-button'
import { toast } from '@/stores/toast-store'
import {
  EmptyState,
  SkeletonTable,
  Button,
  Badge,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  leadStatusVariant,
  leadTierVariant,
} from '@/components/ui'
import {
  getLeadAutomationAction,
  invalidateLeadSurfaceQueries,
  optimisticLeadPatch,
  rollbackLeadPatch,
} from '@/lib/lead-automation'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Bookmark,
  Columns3,
  X,
  Loader2,
  Eye,
  Trash2,
  MoreHorizontal,
  Pause,
  Play,
} from 'lucide-react'
import { useShortcuts } from '@/hooks/use-shortcuts'

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'replied', label: 'Replied' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'closed', label: 'Closed' },
  { value: 'paused', label: 'Paused' },
  { value: 'wa_unavailable', label: 'WA Unavailable' },
]

/* Lead provenance. A lead's tags are the record of which batch or source it
   came from, so tags are the way to see one source's leads as a set. Tags and
   sources are free text, so both are humanised rather than looked up:
   `csv_import` reads "Csv import" under CSS `capitalize`, which only touches
   the first letter. A few built-in values get a hand-written label. */
const humanise = (value: string) =>
  value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const TAG_LABELS: Record<string, string> = {
  local_import: 'Local import',
}

const tagLabel = (tag: string) => TAG_LABELS[tag] ?? humanise(tag)

const SOURCE_LABELS: Record<string, string> = {
  csv_import: 'CSV import',
  local_import: 'Local import',
  manual: 'Manual',
  website: 'Website',
  whatsapp_inbound: 'WhatsApp (inbound)',
  email_inbound: 'Email (inbound)',
  imessage_inbound: 'iMessage (inbound)',
  telegram_inbound: 'Telegram (inbound)',
}

const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? humanise(source)

const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Date Created' },
  { value: 'updatedAt', label: 'Last Updated' },
  { value: 'name', label: 'Name' },
  { value: 'score', label: 'Score' },
  { value: 'lastMessageAt', label: 'Last Message' },
]

// Table column id → server sort field. Only columns the backend can sort by
// (mirrors SORT_OPTIONS) get clickable headers with direction arrows.
const COLUMN_SORT_FIELD: Record<string, string> = {
  name: 'name',
  score: 'score',
  createdAt: 'createdAt',
}

const LEADS_COLUMNS_KEY = 'outboundos_leads_columns'

function leadStatusDot(status: string): string {
  switch (status) {
    case 'replied':
    case 'engaged':
      return 'bg-success'
    case 'closed':
      return 'bg-accent'
    case 'contacted':
      return 'bg-info'
    case 'paused':
      return 'bg-warning'
    case 'wa_unavailable':
      return 'bg-danger'
    default:
      return 'bg-text-muted'
  }
}

export default function LeadsPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<LeadFilters>({
    page: 1,
    limit: 25,
    status: searchParams.get('status') ?? '',
    tags: '',
    search: '',
    sortBy: 'createdAt',
    sortDir: 'desc',
  })
  /* Saved views: named filter presets. Operators repeat the same few filter
     combinations daily; rebuilding them by hand each time is the tax this
     removes. */
  const [views, setViews] = useState<SavedView[]>(() => loadViews())
  const [savingView, setSavingView] = useState(false)
  const [newViewName, setNewViewName] = useState('')

  const activeView = views.find((v) => sameFilters(v.filters, viewFiltersFrom(filters))) ?? null

  const persistViews = (next: SavedView[]) => {
    setViews(next)
    saveViews(next)
  }

  const applyView = (view: SavedView) => {
    // Reset to page 1 — the saved page number would be meaningless against a
    // different result set.
    setFilters({ ...view.filters, page: 1 })
    setSearchInput(view.filters.search ?? '')
  }

  const commitNewView = () => {
    const name = newViewName.trim()
    if (!name) return
    persistViews([
      ...views.filter((v) => v.name !== name),
      { id: `${Date.now()}`, name, filters: viewFiltersFrom(filters) },
    ])
    setNewViewName('')
    setSavingView(false)
  }

  const [searchInput, setSearchInput] = useState('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  /* Deep link: /leads?leadId=42 opens that lead directly. The Activity feed and
     the inbox's lead-context panel both link here, and the target is often not
     in the current filtered page — so it is fetched by id rather than looked up
     in the loaded rows. */
  // Follow ?status= (the Overview pipeline links here) — but only when that
  // value changes. Opening a lead adds ?leadId=, and reacting to every
  // search-param change reset a status picked in the filter bar.
  const routedStatus = searchParams.get('status')
  useEffect(() => {
    if (routedStatus === null) return
    setFilters((current) =>
      current.status === routedStatus ? current : { ...current, status: routedStatus, page: 1 },
    )
  }, [routedStatus])
  const routedLeadId = Number(searchParams.get('leadId')) || null

  const { data: routedLead } = useQuery({
    queryKey: ['lead', routedLeadId],
    queryFn: () => leadsApi.getLead(routedLeadId as number),
    enabled: routedLeadId !== null && selectedLead?.id !== routedLeadId,
  })

  useEffect(() => {
    if (routedLead && routedLead.id !== selectedLead?.id) setSelectedLead(routedLead)
    // Only reacts to a newly resolved routed lead; selectedLead is read, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routedLead])

  const closeLeadDetail = () => {
    setSelectedLead(null)
    if (routedLeadId !== null) {
      const next = new URLSearchParams(searchParams)
      next.delete('leadId')
      setSearchParams(next, { replace: true })
    }
  }
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [deleteConfirmLead, setDeleteConfirmLead] = useState<Lead | null>(null)

  const pooledFilters = useMemo(() => ({ ...filters }), [filters])

  const { data: tagData } = useQuery({
    queryKey: ['lead-tags'],
    queryFn: () => leadsApi.getTags(),
    staleTime: 300_000,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['leads', pooledFilters],
    queryFn: () => leadsApi.getLeads(pooledFilters),
    placeholderData: (prev) => prev,
  })

  const bulkMutation = useMutation({
    mutationFn: ({
      ids,
      action,
      payload,
    }: {
      ids: number[]
      action: string
      payload?: Record<string, unknown>
    }) => leadsApi.bulkAction(ids, action, payload),
    onSuccess: (_data, variables) => {
      invalidateLeadSurfaceQueries(queryClient)
      const n = variables.ids.length
      const verb =
        variables.action === 'pause'
          ? 'paused'
          : variables.action === 'resume'
            ? 'resumed'
            : 'updated'
      toast.success(`${n} lead${n === 1 ? '' : 's'} ${verb}`)
      setSelectedIds(new Set())
    },
    onError: (e: Error) => toast.error(`Bulk action failed: ${e.message}`),
  })

  const deleteLeadMutation = useMutation({
    mutationFn: (lead: Lead) => leadsApi.deleteLead(lead.id),
    onSuccess: (_, lead) => {
      invalidateLeadSurfaceQueries(queryClient)
      toast.success('Lead deleted')
      setDeleteConfirmLead(null)
      if (selectedLead?.id === lead.id) setSelectedLead(null)
    },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  })

  const leadAutomationMutation = useMutation({
    mutationFn: ({ leadId, nextStatus }: { leadId: number; nextStatus: Lead['status'] }) =>
      leadsApi.updateLead(leadId, { status: nextStatus }),
    // Optimistically flip the lead's status in the cache so the UI updates
    // instantly. Roll back on error.
    onMutate: ({ leadId, nextStatus }) =>
      optimisticLeadPatch(queryClient, leadId, { status: nextStatus }),
    onSuccess: (updatedLead, variables) => {
      setSelectedLead((current) =>
        updatedLead && current?.id === updatedLead.id ? updatedLead : current,
      )
      if (variables.nextStatus === 'paused') {
        toast.warning('Lead automation paused')
      } else {
        toast.success('Lead automation resumed')
      }
    },
    onError: (error: Error, variables, ctx) => {
      if (ctx) rollbackLeadPatch(queryClient, ctx)
      const verb = variables.nextStatus === 'paused' ? 'pause' : 'resume'
      toast.error(`Failed to ${verb} lead: ${error.message}`)
    },
    // Re-fetch so cache eventually reconciles with the server (especially the
    // overview/pipeline aggregates that the optimistic patch doesn't touch).
    onSettled: () => invalidateLeadSurfaceQueries(queryClient),
  })

  const leads = data?.data ?? []
  const total = data?.total || 0
  const pages = data?.pages || 1
  const hasActiveFilters = Boolean(
    filters.status ||
    filters.search ||
    filters.tier ||
    filters.source ||
    filters.tags ||
    filters.assignedToId,
  )

  const toggleSelect = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleLeadAutomation = (lead: Lead) => {
    const action = getLeadAutomationAction(lead.status)
    leadAutomationMutation.mutate({ leadId: lead.id, nextStatus: action.nextStatus })
  }

  // j / k step through leads while the detail drawer is open (only active when a
  // lead is selected, so it never interferes with the rest of the page).
  const stepLead = (delta: number) => {
    if (!selectedLead) return
    const idx = leads.findIndex((l: Lead) => l.id === selectedLead.id)
    const nextIdx = idx + delta
    if (idx >= 0 && nextIdx >= 0 && nextIdx < leads.length) setSelectedLead(leads[nextIdx])
  }
  useShortcuts(
    {
      j: () => stepLead(1),
      k: () => stepLead(-1),
    },
    !!selectedLead,
  )

  // Click a sortable column header: toggle direction if already active,
  // otherwise switch to that field ascending.
  const handleSort = (field: string) => {
    setFilters((f) =>
      f.sortBy === field
        ? { ...f, sortDir: f.sortDir === 'asc' ? 'desc' : 'asc' }
        : { ...f, sortBy: field, sortDir: 'asc', page: 1 },
    )
  }

  const columns: ColumnDef<Lead>[] = [
    {
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          checked={selectedIds.size === leads.length && leads.length > 0}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedIds(new Set(leads.map((l: Lead) => l.id)))
            } else {
              setSelectedIds(new Set())
            }
          }}
          className="rounded border-border accent-accent"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.original.id)}
          onChange={() => toggleSelect(row.original.id)}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-border accent-accent"
        />
      ),
      size: 40,
    },
    {
      accessorKey: 'name',
      header: 'Lead',
      cell: ({ row }) => {
        const lead = row.original
        return (
          <div className="min-w-[180px]">
            <button
              onClick={() => setSelectedLead(lead)}
              className="text-text-primary font-medium hover:text-accent transition-colors text-left"
            >
              {lead.name}
            </button>
            <p className="text-text-muted text-xs mt-0.5 truncate max-w-[200px]">
              {lead.company || lead.mobile}
            </p>
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      /* Status and tier used to be two filled badges on every row. Stacked down
         a long table that reads as a wall of colour and drowns the data. Both
         are now a coloured dot plus a label: the same information, carried by
         a mark small enough to scan past. */
      cell: ({ getValue }) => {
        const status = getValue() as string
        return (
          <span className="inline-flex items-center gap-1.5 text-[13px] capitalize text-text-secondary">
            <span
              className={cn('h-1.5 w-1.5 shrink-0 rounded-full', leadStatusDot(status))}
              aria-hidden="true"
            />
            {status.replace(/_/g, ' ')}
          </span>
        )
      },
      size: 130,
    },
    {
      accessorKey: 'leadTier',
      header: 'Tier',
      cell: ({ getValue }) => {
        const tier = getValue() as string | null
        if (!tier) return <span className="text-sm text-text-muted">&mdash;</span>
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-[13px] font-medium',
              tier === 'HOT' ? 'text-hot' : tier === 'WARM' ? 'text-warm' : 'text-cold',
            )}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
            {tier.charAt(0) + tier.slice(1).toLowerCase()}
          </span>
        )
      },
      size: 90,
    },
    {
      accessorKey: 'score',
      header: 'Score',
      cell: ({ getValue }) => {
        const score = getValue() as number | null
        return (
          <div className="flex items-center gap-2">
            <div className="w-12 h-1.5 rounded-full bg-surface-raised overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.min(100, score || 0)}%` }}
              />
            </div>
            <span className="text-text-secondary text-sm">{score ?? '—'}</span>
          </div>
        )
      },
      size: 120,
    },
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ getValue }) => (
        <span className="text-text-secondary text-sm">
          {getValue() ? sourceLabel(getValue() as string) : '—'}
        </span>
      ),
      size: 100,
    },
    {
      accessorKey: 'product',
      header: 'Product',
      cell: ({ getValue }) => (
        <span className="text-text-secondary text-sm truncate max-w-[150px] block">
          {(getValue() as string) || '—'}
        </span>
      ),
      size: 150,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ getValue }) => (
        <span className="text-text-muted text-sm whitespace-nowrap">
          {formatRelativeTime(getValue() as string)}
        </span>
      ),
      size: 100,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const lead = row.original
        const action = getLeadAutomationAction(lead.status)
        const pending =
          leadAutomationMutation.isPending && leadAutomationMutation.variables?.leadId === lead.id

        return (
          <div className="flex items-center justify-end gap-1">
            <AiOutreachButton
              iconOnly
              leadId={lead.id}
              leadName={lead.name}
              leadMobile={lead.mobile}
              leadEmail={lead.email}
              variant="ghost"
              size="sm"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
                  aria-label="Lead actions"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MoreHorizontal className="h-4 w-4" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSelectedLead(lead)}>
                  <Eye className="h-4 w-4" />
                  View details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toggleLeadAutomation(lead)} disabled={pending}>
                  {action.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  {action.label}
                </DropdownMenuItem>
                <DropdownMenuItem destructive onClick={() => setDeleteConfirmLead(lead)}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
      size: 96,
    },
  ]

  /* Column visibility. Persisted per browser: which columns matter differs by
     role and by what someone is doing that day, and re-hiding them on every
     visit makes the control not worth using. */
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    try {
      const stored = localStorage.getItem(LEADS_COLUMNS_KEY)
      return stored ? (JSON.parse(stored) as VisibilityState) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(LEADS_COLUMNS_KEY, JSON.stringify(columnVisibility))
    } catch {
      // Storage blocked — the choice still applies for this session.
    }
  }, [columnVisibility])

  const table = useReactTable({
    data: leads,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pages,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  })

  const handleSearch = () => {
    setFilters((f) => ({ ...f, search: searchInput, page: 1 }))
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <section>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
            {/* Counts belong in one quiet line, not three boxed stats. Page and
                selection state are already visible in the pager and the bulk
                action bar; repeating them as headline figures was noise. */}
            <p className="mt-1 text-[13px] text-text-secondary">
              <span className="tabular-nums">{total.toLocaleString()}</span>{' '}
              {total === 1 ? 'lead' : 'leads'}
              {selectedIds.size > 0 && (
                <>
                  {' · '}
                  <span className="tabular-nums text-text-primary">{selectedIds.size}</span>{' '}
                  selected
                </>
              )}
            </p>
          </div>
          <div className="flex w-full flex-col items-stretch gap-3 xl:max-w-3xl">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search name, company, or mobile…"
                  className={cn(
                    'w-full pl-10 pr-4 py-2.5 rounded-md text-sm',
                    'bg-surface-raised border border-border',
                    'text-text-primary placeholder:text-text-muted',
                    'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30',
                    'transition-all',
                  )}
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                title="Filters"
                aria-label="Filters"
                aria-pressed={showFilters}
                className={cn(
                  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors',
                  showFilters
                    ? 'border-border-strong bg-surface-raised text-text-primary'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-raised hover:text-text-primary',
                )}
              >
                <Filter className="h-4 w-4" />
              </button>

              {/* Saved views. The trigger names the active view so the current
                  filter state is legible without opening the menu. */}
              <DropdownMenu
                onOpenChange={(open) => {
                  if (!open) {
                    setSavingView(false)
                    setNewViewName('')
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Saved views"
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
                  >
                    <Bookmark className="h-3.5 w-3.5" />
                    <span className="max-w-[10rem] truncate">{activeView?.name ?? 'Views'}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Saved views</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {views.length === 0 ? (
                    <p className="px-2 py-1.5 text-[12px] text-text-muted">
                      No saved views yet. Filter the list, then save it.
                    </p>
                  ) : (
                    views.map((view) => (
                      <div
                        key={view.id}
                        className="flex items-center gap-1 rounded-sm px-1 hover:bg-surface-raised"
                      >
                        <button
                          type="button"
                          onClick={() => applyView(view)}
                          className={cn(
                            'min-w-0 flex-1 truncate py-1.5 text-left text-[13px]',
                            activeView?.id === view.id
                              ? 'font-medium text-text-primary'
                              : 'text-text-secondary',
                          )}
                        >
                          {view.name}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete view ${view.name}`}
                          onClick={() => persistViews(views.filter((v) => v.id !== view.id))}
                          className="shrink-0 rounded-sm p-1 text-text-muted hover:text-danger"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  {savingView ? (
                    <div className="flex items-center gap-1 p-1">
                      <input
                        autoFocus
                        value={newViewName}
                        onChange={(e) => setNewViewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitNewView()
                          }
                          if (e.key === 'Escape') setSavingView(false)
                        }}
                        placeholder="Name this view"
                        className="h-7 min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 text-[12px] focus:border-focus focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={commitNewView}
                        disabled={!newViewName.trim()}
                        className="shrink-0 rounded-sm bg-accent px-2 py-1 text-[12px] text-accent-fg disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSavingView(true)}
                      className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-[13px] text-text-secondary hover:bg-surface-raised hover:text-text-primary"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Save current filters
                    </button>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Column visibility. Which columns matter varies by role and by
                  task, so the choice is remembered per browser. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title="Columns"
                    aria-label="Choose columns"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
                  >
                    <Columns3 className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {table
                    .getAllLeafColumns()
                    .filter((column) => column.id !== 'select' && column.id !== 'actions')
                    .map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
                        onSelect={(event) => event.preventDefault()}
                      >
                        {typeof column.columnDef.header === 'string'
                          ? column.columnDef.header
                          : column.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2">
                <span className="text-sm text-text-muted">{selectedIds.size} selected</span>
                <button
                  onClick={() => bulkMutation.mutate({ ids: [...selectedIds], action: 'pause' })}
                  className="flex-1 rounded-lg bg-warning-muted px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/20 sm:flex-none"
                >
                  Pause
                </button>
                <button
                  onClick={() => bulkMutation.mutate({ ids: [...selectedIds], action: 'resume' })}
                  className="flex-1 rounded-lg bg-success-muted px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20 sm:flex-none"
                >
                  Resume
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="rounded-lg px-2 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
                  aria-label="Clear selection"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Filter bar */}
      {showFilters && (
        <div className="glass rounded-lg p-4 animate-slide-up">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
              Filters
            </p>
            <span className="text-xs text-text-muted">
              {hasActiveFilters ? 'Active filters applied' : `${total} total leads`}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,auto))_1fr] xl:items-center">
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-secondary focus:border-accent focus:outline-none"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={filters.tags ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, tags: e.target.value, page: 1 }))}
              aria-label="Filter by source"
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-secondary focus:border-accent focus:outline-none"
            >
              <option value="">All sources</option>
              {(tagData?.tags ?? []).map((t) => (
                <option key={t.tag} value={t.tag}>
                  {tagLabel(t.tag)} ({t.count})
                </option>
              ))}
            </select>

            <select
              value={filters.sortBy}
              onChange={(e) => setFilters((f) => ({ ...f, sortBy: e.target.value }))}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-secondary focus:border-accent focus:outline-none"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              onClick={() =>
                setFilters((f) => ({ ...f, sortDir: f.sortDir === 'asc' ? 'desc' : 'asc' }))
              }
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              {filters.sortDir === 'asc' ? '↑ Ascending' : '↓ Descending'}
            </button>

            {hasActiveFilters && (
              <button
                onClick={() => {
                  setFilters((f) => ({
                    ...f,
                    status: '',
                    search: '',
                    tier: '',
                    source: '',
                    tags: '',
                    assignedToId: undefined,
                    page: 1,
                  }))
                  setSearchInput('')
                }}
                className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm text-danger transition-colors hover:bg-danger-muted"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="glass rounded-lg overflow-hidden">
        {isLoading ? (
          <SkeletonTable rows={10} className="border-0 rounded-none shadow-none" />
        ) : leads.length === 0 ? (
          <EmptyLeadsState
            hasActiveFilters={hasActiveFilters}
            onReset={() => {
              setFilters((f) => ({
                ...f,
                status: '',
                search: '',
                tier: '',
                source: '',
                tags: '',
                assignedToId: undefined,
                page: 1,
              }))
              setSearchInput('')
            }}
          />
        ) : (
          <>
            <div className="divide-y divide-border-subtle md:hidden">
              {leads.map((lead) => {
                const isSelected = selectedIds.has(lead.id)

                return (
                  <div
                    key={lead.id}
                    className={cn('p-4 transition-colors', isSelected && 'bg-accent-muted/20')}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const next = new Set(selectedIds)
                          if (e.target.checked) next.add(lead.id)
                          else next.delete(lead.id)
                          setSelectedIds(next)
                        }}
                        className="mt-1 rounded border-border accent-accent"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <button
                              onClick={() => setSelectedLead(lead)}
                              className="block truncate text-left text-sm font-medium text-text-primary transition-colors hover:text-accent"
                            >
                              {lead.name}
                            </button>
                            <p className="mt-0.5 truncate text-xs text-text-muted">
                              {lead.company || lead.mobile}
                            </p>
                          </div>
                          <button
                            onClick={() => setSelectedLead(lead)}
                            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-accent-muted hover:text-accent"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant={leadStatusVariant(lead.status)} size="md">
                            {lead.status.replace('_', ' ')}
                          </Badge>
                          {lead.leadTier ? (
                            <Badge variant={leadTierVariant(lead.leadTier)} size="md">
                              {lead.leadTier}
                            </Badge>
                          ) : (
                            <Badge size="md">—</Badge>
                          )}
                          <Badge size="md">{lead.score ?? '—'} score</Badge>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-muted">
                          <span className="rounded-md bg-surface-raised px-3 py-2">
                            Source:{' '}
                            <span className="text-text-secondary">
                              {lead.source ? sourceLabel(lead.source) : '—'}
                            </span>
                          </span>
                          <span className="rounded-md bg-surface-raised px-3 py-2">
                            Created:{' '}
                            <span className="text-text-secondary">
                              {formatRelativeTime(lead.createdAt)}
                            </span>
                          </span>
                          <span className="rounded-md bg-surface-raised px-3 py-2">
                            Last touch:{' '}
                            <span className="text-text-secondary">
                              {lead.lastMessageAt ? formatRelativeTime(lead.lastMessageAt) : '—'}
                            </span>
                          </span>
                          <span className="rounded-md bg-surface-raised px-3 py-2">
                            Follow-ups:{' '}
                            <span className="text-text-secondary">{lead.followupCount ?? 0}</span>
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => toggleLeadAutomation(lead)}
                            disabled={
                              leadAutomationMutation.isPending &&
                              leadAutomationMutation.variables?.leadId === lead.id
                            }
                            className={cn(
                              'inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50',
                              lead.status === 'paused'
                                ? 'bg-success-muted text-success hover:bg-success/20'
                                : 'bg-warning-muted text-warning hover:bg-warning/20',
                            )}
                          >
                            {leadAutomationMutation.isPending &&
                            leadAutomationMutation.variables?.leadId === lead.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : lead.status === 'paused' ? (
                              <Play className="h-3.5 w-3.5" />
                            ) : (
                              <Pause className="h-3.5 w-3.5" />
                            )}
                            {lead.status === 'paused' ? 'Resume automation' : 'Pause automation'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedLead(lead)}
                            className="inline-flex items-center gap-2 rounded-md bg-surface-raised px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-surface"
                          >
                            <Eye className="h-3.5 w-3.5 text-text-muted" />
                            View details
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="hidden md:block">
              <DataTable
                table={table}
                minWidth={980}
                onRowClick={(lead) => setSelectedLead(lead)}
                isRowSelected={(lead) => selectedIds.has(lead.id)}
                onToggleSelect={(lead) => toggleSelect(lead.id)}
                sortFieldFor={(columnId) => COLUMN_SORT_FIELD[columnId]}
                activeSort={{ by: filters.sortBy, dir: filters.sortDir }}
                onSort={handleSort}
              />
            </div>
          </>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-text-muted text-sm">
              Page {filters.page} of {pages} · {total} leads
            </p>
            <div className="flex flex-wrap items-center gap-1">
              <button
                disabled={filters.page === 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) - 1 }))}
                className="p-2 rounded-lg text-text-secondary hover:bg-surface-raised disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                const start = Math.max(1, Math.min((filters.page || 1) - 2, pages - 4))
                const page = start + i
                if (page > pages) return null
                return (
                  <button
                    key={page}
                    onClick={() => setFilters((f) => ({ ...f, page }))}
                    className={cn(
                      'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                      page === filters.page
                        ? 'bg-accent text-accent-fg'
                        : 'text-text-secondary hover:bg-surface-raised',
                    )}
                  >
                    {page}
                  </button>
                )
              })}
              <button
                disabled={filters.page === pages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) + 1 }))}
                className="p-2 rounded-lg text-text-secondary hover:bg-surface-raised disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Row-action delete confirm */}
      <ConfirmDialog
        open={!!deleteConfirmLead}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmLead(null)
        }}
        title={`Delete "${deleteConfirmLead?.name}"?`}
        description="This permanently removes the lead and its message history. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteConfirmLead) deleteLeadMutation.mutate(deleteConfirmLead)
        }}
      />

      {/* Lead Detail Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        onClose={closeLeadDetail}
        onLeadUpdated={(lead) => setSelectedLead(lead)}
        onToggleAutomation={toggleLeadAutomation}
        automationPending={Boolean(
          selectedLead &&
          leadAutomationMutation.isPending &&
          leadAutomationMutation.variables?.leadId === selectedLead.id,
        )}
      />
    </div>
  )
}

function EmptyLeadsState({
  hasActiveFilters,
  onReset,
}: {
  hasActiveFilters: boolean
  onReset: () => void
}) {
  return (
    <EmptyState
      icon={Filter}
      title={hasActiveFilters ? 'No leads match the current filters' : 'No leads yet'}
      description={
        hasActiveFilters
          ? 'Broaden the filter set or clear the search to bring the full lead pool back into view.'
          : 'New imports and synced leads will appear here once the workspace starts receiving records.'
      }
      className="border-none py-20 bg-transparent"
      action={hasActiveFilters && <Button onClick={onReset}>Clear filters</Button>}
    />
  )
}
