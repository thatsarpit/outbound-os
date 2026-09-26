import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { Megaphone, MessageSquare, Pause, Play, Plus, Send, TrendingUp, Users } from 'lucide-react'
import { campaignsApi } from '@/api/endpoints/campaigns'
import type { Campaign } from '@/api/types'
import { Button, EmptyState, ErrorState, LoadingState, MetricCard } from '@/components/ui'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { cn, formatCount, formatRelativeTime } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import {
  type CampaignStatusKey,
  num,
  percent,
  normalizeStatus,
  StatusMark,
  ChannelMark,
  ProgressBar,
} from '@/components/campaigns/campaign-shared'
import { CreateCampaignModal } from '@/components/campaigns/create-campaign-modal'
import { CampaignDetailDrawer } from '@/components/campaigns/campaign-detail-drawer'

const COLUMN_SORT_FIELD: Record<string, string> = {
  name: 'name',
  channel: 'channel',
  status: 'status',
  totalLeads: 'totalLeads',
  sentCount: 'sentCount',
  replyCount: 'replyCount',
  replyRate: 'replyRate',
  createdAt: 'createdAt',
}

function sortValue(campaign: Campaign, field: string): string | number {
  switch (field) {
    case 'name':
      return (campaign.name || '').toLowerCase()
    case 'channel':
      return campaign.channel || ''
    case 'status':
      return normalizeStatus(campaign.status)
    case 'totalLeads':
      return num(campaign.totalLeads)
    case 'sentCount':
      return num(campaign.sentCount)
    case 'replyCount':
      return num(campaign.replyCount)
    case 'replyRate':
      return percent(num(campaign.replyCount), num(campaign.sentCount))
    default:
      return campaign.createdAt ? Date.parse(campaign.createdAt) || 0 : 0
  }
}

export default function CampaignsPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [sort, setSort] = useState<{ by: string; dir: 'asc' | 'desc' }>({
    by: 'createdAt',
    dir: 'desc',
  })

  /* Defensive: several pages in this app white-screened on `X.filter is not a
     function` because they trusted the payload shape. Anything that is not a
     list of campaigns degrades to an empty list and the page renders its
     zero-state instead. */
  const {
    data: campaigns = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const res = (await campaignsApi.list()) as unknown
      const list = Array.isArray(res)
        ? res
        : ((res as { campaigns?: unknown } | null)?.campaigns ?? [])
      return (Array.isArray(list) ? list : []) as Campaign[]
    },
    refetchInterval: 15_000,
  })

  const counts = campaigns.reduce(
    (acc, campaign) => {
      acc[normalizeStatus(campaign.status)] += 1
      return acc
    },
    { draft: 0, scheduled: 0, running: 0, paused: 0, completed: 0 } as Record<
      CampaignStatusKey,
      number
    >,
  )
  const totalLeads = campaigns.reduce((sum, campaign) => sum + num(campaign.totalLeads), 0)
  const totalSent = campaigns.reduce((sum, campaign) => sum + num(campaign.sentCount), 0)
  const totalReplies = campaigns.reduce((sum, campaign) => sum + num(campaign.replyCount), 0)
  const totalFailed = campaigns.reduce((sum, campaign) => sum + num(campaign.failedCount), 0)
  const replyRate = percent(totalReplies, totalSent)

  const sortedCampaigns = useMemo(() => {
    const direction = sort.dir === 'asc' ? 1 : -1
    return [...campaigns].sort((a, b) => {
      const av = sortValue(a, sort.by)
      const bv = sortValue(b, sort.by)
      if (av === bv) return 0
      return (av < bv ? -1 : 1) * direction
    })
  }, [campaigns, sort])

  // Optimistic patch helper: flip a campaign's status in the cache so the
  // start/pause button reflects the new state instantly. Roll back on error.
  type CampaignSnapshot = { entries: Array<[QueryKey, unknown]> }
  const optimisticCampaignStatus = async (
    id: number,
    nextStatus: Campaign['status'],
  ): Promise<CampaignSnapshot> => {
    await queryClient.cancelQueries({ queryKey: ['campaigns'] })
    const entries = queryClient.getQueriesData({ queryKey: ['campaigns'] }) as Array<
      [QueryKey, unknown]
    >
    queryClient.setQueriesData({ queryKey: ['campaigns'] }, (old: unknown) =>
      Array.isArray(old)
        ? old.map((c: Campaign) => (c.id === id ? { ...c, status: nextStatus } : c))
        : old,
    )
    return { entries }
  }
  const rollbackCampaignStatus = (snapshot: CampaignSnapshot) => {
    for (const [key, val] of snapshot.entries) queryClient.setQueryData(key, val)
  }

  const startMutation = useMutation({
    mutationFn: (id: number) => campaignsApi.start(id),
    onMutate: (id) => optimisticCampaignStatus(id, 'running'),
    onSuccess: () => toast.success('Campaign started'),
    onError: (error: Error, _id, ctx) => {
      if (ctx) rollbackCampaignStatus(ctx)
      toast.error(`Failed to start: ${error.message}`)
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  })

  const pauseMutation = useMutation({
    mutationFn: (id: number) => campaignsApi.pause(id),
    onMutate: (id) => optimisticCampaignStatus(id, 'paused'),
    onSuccess: () => toast.success('Campaign paused'),
    onError: (error: Error, _id, ctx) => {
      if (ctx) rollbackCampaignStatus(ctx)
      toast.error(`Failed to pause: ${error.message}`)
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  })

  const populateMutation = useMutation({
    mutationFn: (id: number) => campaignsApi.populate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Leads populated')
    },
    onError: (error: Error) => toast.error(`Failed to populate: ${error.message}`),
  })

  const detailCampaign = detailId
    ? (campaigns.find((campaign) => campaign.id === detailId) ?? null)
    : null

  const handleSort = (field: string) =>
    setSort((current) =>
      current.by === field
        ? { by: field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { by: field, dir: field === 'name' || field === 'channel' ? 'asc' : 'desc' },
    )

  const rowActions = (campaign: Campaign) => {
    const status = normalizeStatus(campaign.status)
    return (
      <div
        className="flex items-center justify-end gap-0.5"
        onClick={(event) => event.stopPropagation()}
      >
        {status === 'draft' && (
          <Button
            variant="ghost"
            size="sm"
            pending={populateMutation.isPending && populateMutation.variables === campaign.id}
            aria-label={`Populate leads for ${campaign.name}`}
            title="Populate leads"
            onClick={() => populateMutation.mutate(campaign.id)}
          >
            <Users aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        )}
        {(status === 'draft' || status === 'paused') && (
          <Button
            variant="ghost"
            size="sm"
            pending={startMutation.isPending && startMutation.variables === campaign.id}
            aria-label={`Start ${campaign.name}`}
            title="Start campaign"
            onClick={() => startMutation.mutate(campaign.id)}
          >
            <Play aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        )}
        {status === 'running' && (
          <Button
            variant="ghost"
            size="sm"
            pending={pauseMutation.isPending && pauseMutation.variables === campaign.id}
            aria-label={`Pause ${campaign.name}`}
            title="Pause campaign"
            onClick={() => pauseMutation.mutate(campaign.id)}
          >
            <Pause aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    )
  }

  const columns: ColumnDef<Campaign>[] = [
    {
      accessorKey: 'name',
      header: 'Campaign',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-text-primary">{row.original.name}</p>
          {row.original.description && (
            <p className="mt-0.5 truncate text-[11px] text-text-muted">
              {row.original.description}
            </p>
          )}
        </div>
      ),
      size: 240,
    },
    {
      accessorKey: 'channel',
      header: 'Channel',
      cell: ({ row }) => <ChannelMark channel={row.original.channel} />,
      size: 140,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusMark status={row.original.status} />,
      size: 118,
    },
    {
      accessorKey: 'totalLeads',
      header: 'Audience',
      cell: ({ row }) => (
        <span className="text-[13px] tabular-nums text-text-secondary">
          {formatCount(num(row.original.totalLeads))}
        </span>
      ),
      size: 100,
    },
    {
      accessorKey: 'sentCount',
      header: 'Sent',
      cell: ({ row }) => {
        const sent = num(row.original.sentCount)
        const total = num(row.original.totalLeads)
        return (
          <div className="min-w-0 max-w-[84px]">
            <span className="text-[13px] tabular-nums text-text-primary">{formatCount(sent)}</span>
            <ProgressBar className="mt-1" value={percent(sent, total)} />
          </div>
        )
      },
      size: 110,
    },
    {
      accessorKey: 'replyCount',
      header: 'Replies',
      cell: ({ row }) => (
        <span className="text-[13px] tabular-nums text-text-secondary">
          {formatCount(num(row.original.replyCount))}
        </span>
      ),
      size: 95,
    },
    {
      id: 'replyRate',
      header: 'Reply rate',
      cell: ({ row }) => {
        const sent = num(row.original.sentCount)
        return (
          <span
            className={cn(
              'text-[13px] tabular-nums',
              sent > 0 ? 'text-text-primary' : 'text-text-muted',
            )}
          >
            {sent > 0 ? `${percent(num(row.original.replyCount), sent).toFixed(1)}%` : '—'}
          </span>
        )
      },
      size: 105,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-[13px] tabular-nums text-text-muted">
          {row.original.createdAt ? formatRelativeTime(row.original.createdAt) : '—'}
        </span>
      ),
      size: 110,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => rowActions(row.original),
      size: 92,
    },
  ]

  const table = useReactTable({
    data: sortedCampaigns,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const newCampaignButton = (
    <Button onClick={() => setShowCreate(true)} leftIcon={<Plus className="h-4 w-4" />}>
      New campaign
    </Button>
  )

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Campaigns"
        description={
          <>
            <span className="tabular-nums">{counts.running}</span> live &middot;{' '}
            <span className="tabular-nums">{counts.scheduled}</span> queued &middot;{' '}
            <span className="tabular-nums">{counts.draft}</span>{' '}
            {counts.draft === 1 ? 'draft' : 'drafts'} &middot;{' '}
            <span className="tabular-nums">{counts.completed}</span> completed
          </>
        }
        actions={newCampaignButton}
      />

      {isLoading ? (
        <>
          <LoadingState
            variant="page"
            cards={4}
            className="lg:grid-cols-4"
            label="Loading campaigns"
          />
          <LoadingState variant="table" rows={6} />
        </>
      ) : isError ? (
        <ErrorState
          title="Couldn't load campaigns"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={Users}
              label="Leads in play"
              value={formatCount(totalLeads)}
              hint={`across ${formatCount(campaigns.length)} ${
                campaigns.length === 1 ? 'campaign' : 'campaigns'
              }`}
            />
            <MetricCard
              icon={Send}
              label="Messages sent"
              value={formatCount(totalSent)}
              hint={
                totalFailed > 0 ? `${formatCount(totalFailed)} failed` : 'No failed sends recorded'
              }
            />
            <MetricCard
              icon={MessageSquare}
              label="Replies"
              value={formatCount(totalReplies)}
              hint={`of ${formatCount(totalSent)} sent`}
            />
            <MetricCard
              icon={TrendingUp}
              label="Reply rate"
              value={`${replyRate.toFixed(1)}%`}
              hint="Across every campaign"
            />
          </div>

          {campaigns.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No campaigns yet"
              description="A campaign takes a saved lead filter, a message template and a channel, then sends and tracks it for you."
              action={newCampaignButton}
            />
          ) : (
            <>
              {/* Compact rows below md — a table cannot hold nine columns on a
                  phone without becoming a horizontal scroll nobody uses. */}
              <div className="overflow-hidden rounded-lg border border-border bg-surface md:hidden">
                {sortedCampaigns.map((campaign) => {
                  const sent = num(campaign.sentCount)
                  const total = num(campaign.totalLeads)
                  return (
                    <div
                      key={campaign.id}
                      className="border-b border-border-subtle last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => setDetailId(campaign.id)}
                        className="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-surface-raised"
                      >
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">
                            {campaign.name}
                          </span>
                          <StatusMark status={campaign.status} className="shrink-0 text-[11px]" />
                        </span>
                        <span className="flex items-center gap-2 text-[11px] tabular-nums text-text-muted">
                          <ChannelMark channel={campaign.channel} className="text-[11px]" />
                          <span aria-hidden="true">&middot;</span>
                          <span>{formatCount(total)} leads</span>
                          <span aria-hidden="true">&middot;</span>
                          <span>{formatCount(sent)} sent</span>
                          <span aria-hidden="true">&middot;</span>
                          <span>{formatCount(num(campaign.replyCount))} replies</span>
                        </span>
                        <ProgressBar value={percent(sent, total)} />
                      </button>
                      <div className="px-4 pb-2">{rowActions(campaign)}</div>
                    </div>
                  )
                })}
              </div>

              <div className="hidden md:block">
                <DataTable
                  table={table}
                  minWidth={1020}
                  onRowClick={(campaign) => setDetailId(campaign.id)}
                  sortFieldFor={(columnId) => COLUMN_SORT_FIELD[columnId]}
                  activeSort={sort}
                  onSort={handleSort}
                />
              </div>
            </>
          )}
        </>
      )}

      {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} />}
      {detailCampaign && (
        <CampaignDetailDrawer campaign={detailCampaign} onClose={() => setDetailId(null)} />
      )}
    </div>
  )
}
