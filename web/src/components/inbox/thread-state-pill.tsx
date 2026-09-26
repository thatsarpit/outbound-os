import type { InboxThreadDetail, InboxThreadState } from '@/api/types'
import { cn } from '@/lib/utils'

type ThreadStateValue =
  | InboxThreadState
  | NonNullable<InboxThreadDetail['threadStatus']>
  | 'waiting'
  | 'archived'

const THREAD_STATE_STYLES: Record<ThreadStateValue, string> = {
  all: 'bg-surface-raised text-text-muted border-border',
  needs_reply: 'bg-warning-muted text-warning border-warning/25',
  assigned: 'bg-info-muted text-info border-info/25',
  unassigned: 'bg-surface-raised text-text-secondary border-border',
  resolved: 'bg-success-muted text-success border-success/25',
  open: 'bg-accent-muted text-accent border-accent/20',
  waiting: 'bg-warning-muted text-warning border-warning/25',
  archived: 'bg-surface-raised text-text-muted border-border',
}

const THREAD_STATE_LABELS: Record<ThreadStateValue, string> = {
  all: 'All',
  needs_reply: 'Needs Reply',
  assigned: 'Assigned',
  unassigned: 'Unassigned',
  resolved: 'Resolved',
  open: 'Open',
  waiting: 'Waiting',
  archived: 'Archived',
}

export function ThreadStatePill({
  state,
  compact = false,
  className,
}: {
  state?: ThreadStateValue | null
  compact?: boolean
  className?: string
}) {
  const resolvedState = state || 'open'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium',
        THREAD_STATE_STYLES[resolvedState],
        compact && 'px-2 py-0.5 text-[10px]',
        className,
      )}
    >
      {THREAD_STATE_LABELS[resolvedState]}
    </span>
  )
}
