import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, ListChecks, RefreshCw } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { inboxApi, type DeliveryReviewFilter, type DeliveryReviewItem } from '@/api/endpoints/inbox'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { CHANNEL_ORDER, CHANNELS } from '@/lib/channels'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

const FILTERS: { value: DeliveryReviewFilter; label: string }[] = [
  { value: 'attention', label: 'Needs review' },
  { value: 'failed', label: 'Failed' },
  { value: 'unconfirmed', label: 'Unconfirmed' },
  { value: 'queued', label: 'Queued' },
  { value: 'sending', label: 'Sending' },
]

const STATUSES: Record<DeliveryReviewItem['status'], { label: string; className: string }> = {
  failed: { label: 'Failed', className: 'bg-danger-muted text-danger' },
  permanently_failed: { label: 'Failed', className: 'bg-danger-muted text-danger' },
  bounced: { label: 'Bounced', className: 'bg-danger-muted text-danger' },
  unconfirmed: { label: 'Unconfirmed', className: 'bg-warning-muted text-warning' },
  queued: { label: 'Queued', className: 'bg-surface-raised text-text-secondary' },
  sending: { label: 'Sending', className: 'bg-surface-raised text-text-secondary' },
}

function ReviewRow({ item, pathPrefix }: { item: DeliveryReviewItem; pathPrefix: string }) {
  const channel = CHANNELS[item.channel]
  const status = STATUSES[item.status]
  const thread = new URLSearchParams({ leadId: String(item.leadId), channel: item.channel })

  return (
    <li className="grid min-w-0 gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto] lg:items-center">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <channel.icon className={cn('size-4 shrink-0', channel.text)} aria-hidden="true" />
          <span className="break-words text-sm font-semibold text-text-primary">
            {item.leadName}
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          {channel.label} · Updated{' '}
          <time dateTime={item.updatedAt}>
            {new Date(item.updatedAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
        </p>
      </div>
      <div className="min-w-0 space-y-1">
        <span
          className={cn('inline-flex rounded-md px-2 py-1 text-xs font-medium', status.className)}
        >
          {status.label}
        </span>
        <p className="break-words text-sm text-text-secondary">{item.detail}</p>
        {item.providerCode && (
          <p className="text-xs text-text-muted">Provider code {item.providerCode}</p>
        )}
        {item.status === 'queued' && item.scheduledAt && (
          <p className="text-xs text-text-muted">
            Eligible from{' '}
            <time dateTime={item.scheduledAt}>
              {new Date(item.scheduledAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </time>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="secondary" className="min-h-10">
          <Link
            to={pathPrefix + '/inbox?' + thread.toString()}
            aria-label={'Open conversation with ' + item.leadName}
          >
            Open conversation
          </Link>
        </Button>
        {item.campaignId && (
          <Button asChild size="sm" variant="ghost" className="min-h-10">
            <Link to={pathPrefix + '/campaigns?id=' + item.campaignId}>View campaign</Link>
          </Button>
        )}
      </div>
    </li>
  )
}

export default function DeliveryReviewPage() {
  const [params, setParams] = useSearchParams()
  const { pathname } = useLocation()
  const scope = useAuthStore((state) => state.dashboardScope)
  const status =
    FILTERS.find((filter) => filter.value === params.get('status'))?.value ?? 'attention'
  const channel = CHANNEL_ORDER.find((item) => item === params.get('channel')) ?? ''
  const requestedPage = Number(params.get('page'))
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const pathPrefix = pathname.startsWith('/dev/shell/') ? '/dev/shell' : ''
  const review = useQuery({
    queryKey: ['delivery-review', scope, status, channel, page],
    queryFn: () => inboxApi.deliveryReview(status, channel, page),
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    meta: { silent: true },
  })
  const data = review.isError ? undefined : review.data

  function setFilters(nextStatus: DeliveryReviewFilter, nextChannel: string, nextPage = 1) {
    const next = new URLSearchParams()
    if (nextStatus !== 'attention') next.set('status', nextStatus)
    if (nextChannel) next.set('channel', nextChannel)
    if (nextPage > 1) next.set('page', String(nextPage))
    setParams(next)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Delivery review"
        description="Check failed and unconfirmed sends and see what’s waiting in the queue."
        actions={
          <Button
            variant="secondary"
            onClick={() => void review.refetch()}
            pending={review.isFetching}
            pendingLabel="Refreshing…"
            leftIcon={<RefreshCw className="size-4" aria-hidden="true" />}
          >
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-surface p-3">
        <div role="group" aria-label="Message status" className="flex flex-wrap gap-1">
          {FILTERS.map(({ value, label }) => (
            <Button
              key={value}
              size="sm"
              variant={status === value ? 'secondary' : 'ghost'}
              aria-pressed={status === value}
              onClick={() => setFilters(value, channel)}
              className="min-h-10"
            >
              {label}
              {data && <span className="tabular-nums text-text-muted">{data.counts[value]}</span>}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <label htmlFor="delivery-review-channel">Channel</label>
          <select
            id="delivery-review-channel"
            className="min-h-10 rounded-md border border-border bg-surface-raised px-2 text-sm text-text-primary"
            value={channel}
            onChange={(event) => setFilters(status, event.target.value)}
          >
            <option value="">All channels</option>
            {CHANNEL_ORDER.map((item) => (
              <option key={item} value={item}>
                {CHANNELS[item].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {review.isError ? (
        <ErrorState
          title="Could not load delivery review"
          description="Refresh to see the latest message status."
          onRetry={() => void review.refetch()}
        />
      ) : !data ? (
        <LoadingState variant="table" label="Loading delivery review" />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={
            status === 'attention' && !channel ? 'No messages need review' : 'No matching messages'
          }
          description={
            status === 'attention' && !channel
              ? 'Failed and unconfirmed sends will appear here.'
              : 'Choose another status or channel to see more messages.'
          }
          compact
        />
      ) : (
        <>
          <ul
            aria-label="Outbound messages"
            className="divide-y divide-border-subtle rounded-lg border border-border bg-surface"
          >
            {data.items.map((item) => (
              <ReviewRow key={item.id} item={item} pathPrefix={pathPrefix} />
            ))}
          </ul>
          {data.pages > 1 && (
            <nav
              aria-label="Delivery review pages"
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <Button
                size="sm"
                variant="secondary"
                disabled={data.page === 1}
                onClick={() => setFilters(status, channel, data.page - 1)}
                leftIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
              >
                Previous
              </Button>
              <span className="text-xs text-text-muted">
                Page {data.page} of {data.pages} · {data.total} messages
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={data.page === data.pages}
                onClick={() => setFilters(status, channel, data.page + 1)}
                rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
