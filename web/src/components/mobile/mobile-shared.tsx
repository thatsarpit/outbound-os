import { ChevronDown, Loader2, RefreshCw } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/use-online-status'

export const mobileInput =
  'min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-base text-text-primary placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus-muted disabled:opacity-50'
export const mobileButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-focus'

export function MobileRefresh({
  updatedAt,
  refreshing,
  stale,
  retry,
}: {
  updatedAt: number
  refreshing: boolean
  stale?: boolean
  retry?: () => void
}) {
  const online = useOnlineStatus()
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-text-muted" role="status">
        {!online
          ? updatedAt
            ? 'Offline · showing loaded data'
            : 'Offline · reconnect to load this list'
          : stale
            ? 'Refresh failed · showing loaded data'
            : updatedAt
              ? `Synced ${new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : 'Waiting for updates'}
      </p>
      {online && stale && retry && (
        <button type="button" className={mobileButton} onClick={retry} disabled={refreshing}>
          <RefreshCw
            className={refreshing ? 'h-4 w-4 motion-safe:animate-spin' : 'h-4 w-4'}
            aria-hidden="true"
          />
          Retry refresh
        </button>
      )}
    </div>
  )
}

export function MobileError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-surface p-5">
      <p className="text-sm text-danger">{message}</p>
      <button type="button" className={`${mobileButton} mt-3`} onClick={retry}>
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  )
}

export function MobileLoadMore({
  hasMore,
  busy,
  loading,
  failed,
  onLoad,
  onStartOver,
}: {
  hasMore: boolean
  busy: boolean
  loading: boolean
  failed: boolean
  onLoad: () => void
  onStartOver?: () => void
}) {
  const online = useOnlineStatus()
  if (!hasMore && !onStartOver) return null
  const unavailable = busy || !online
  return (
    <div className="space-y-2 pb-2 text-center">
      {hasMore && (
        <button
          type="button"
          className={`${mobileButton} min-h-12 w-full rounded-xl text-accent active:bg-accent-muted aria-disabled:opacity-60`}
          aria-disabled={unavailable}
          onClick={() => {
            if (!unavailable) onLoad()
          }}
        >
          {loading ? (
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4" aria-hidden="true" />
          )}
          {loading ? 'Loading more…' : failed ? 'Retry loading more' : 'Load more'}
        </button>
      )}
      {failed && (
        <p className="text-xs text-danger" role="status">
          Could not load more results.
        </p>
      )}
      {onStartOver && (
        <button type="button" className={`${mobileButton} w-full`} onClick={onStartOver}>
          Start from the first result
        </button>
      )}
    </div>
  )
}

// Display the configured workspace zone, including its daylight-saving offset.
export function mobileDueDate(value: string | null, timeZone = 'UTC') {
  return value
    ? new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
        timeZone,
      })
    : 'No due date'
}

export function mobileLeadId(value: string | null): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function mobileSearchParams(
  values: Record<string, string | null>,
  current = new URLSearchParams(window.location.search),
) {
  // History updates immediately. React can still be rendering the previous
  // location when the next control is tapped.
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(values)) {
    if (value === null) next.delete(key)
    else next.set(key, value)
  }
  return next
}
