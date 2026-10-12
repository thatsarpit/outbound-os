import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react'

export const mobileInput =
  'min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-base text-text-primary placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus-muted disabled:opacity-50'
export const mobileButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-focus'

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

export function MobilePagination({
  page,
  pages,
  onChange,
}: {
  page: number
  pages: number
  onChange: (page: number) => void
}) {
  if (pages <= 1) return null
  return (
    <nav aria-label="Results pages" className="mt-4 flex items-center justify-between gap-2">
      <button
        type="button"
        className={mobileButton}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ArrowLeft className="h-4 w-4" />
        Previous
      </button>
      <span className="text-xs tabular-nums text-text-muted">
        {page} / {pages}
      </span>
      <button
        type="button"
        className={mobileButton}
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Next
        <ArrowRight className="h-4 w-4" />
      </button>
    </nav>
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
