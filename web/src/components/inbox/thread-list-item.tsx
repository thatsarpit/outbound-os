import type { InboxThreadSummary } from '@/api/types'
import { cn, formatRelativeTime } from '@/lib/utils'
import { getChannel, getThreadSubtitle } from '@/lib/channels'

function getInitials(name?: string) {
  const label = (name || '?').trim()
  const segments = label.split(/\s+/).filter(Boolean)
  if (segments.length === 1) return segments[0].slice(0, 2).toUpperCase()
  return `${segments[0][0] || ''}${segments[1][0] || ''}`.toUpperCase()
}

/**
 * One conversation in the thread list.
 *
 * The previous row stacked an avatar, name, channel pill, unread dot, subtitle,
 * timestamp, state pill, and separate company / email / phone / assigned chips
 * above a two-line preview — roughly 160px each, so about four conversations
 * fitted on screen and every row repeated what the one above it said.
 *
 * This is three lines in a fixed rhythm: who, what they said, and when. Channel
 * lives in a coloured rule down the left edge plus a small glyph, so a mixed
 * list stays scannable instead of becoming a column of coloured pills. Details
 * that used to be chips belong in the lead context panel, which has room.
 */
export function ThreadListItem({
  thread,
  selected,
  onSelect,
}: {
  thread: InboxThreadSummary
  selected: boolean
  onSelect: () => void
}) {
  const meta = getChannel(thread.channel)
  const Icon = meta.icon
  const preview = thread.lastMessagePreview || thread.lastMessage || 'No messages yet'
  const subtitle = getThreadSubtitle(thread)
  const name = thread.leadName || thread.name || 'Unknown'

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'relative flex w-full gap-2.5 border-b border-border-subtle py-2.5 pl-3 pr-3 text-left transition-colors',
        selected ? 'bg-surface-raised' : 'hover:bg-surface-raised/60',
      )}
    >
      {/* Channel rule. Reads as a colour gutter down the list, so the channel
          mix is visible at a glance without a chip on every row. */}
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-0.5', meta.rule)} />

      {/* Unread marker sits in its own narrow column so names stay aligned. */}
      <span className="flex w-1.5 shrink-0 items-center justify-center pt-1.5">
        {thread.unread && (
          <span className="h-1.5 w-1.5 rounded-full bg-focus" title="Unread" aria-label="Unread" />
        )}
      </span>

      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[10px] font-semibold text-text-secondary">
        {getInitials(name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[13px]',
              thread.unread ? 'font-semibold text-text-primary' : 'font-medium text-text-primary',
            )}
          >
            {name}
          </span>
          <Icon aria-label={meta.label} className={cn('h-3 w-3 shrink-0 self-center', meta.text)} />
          <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
            {formatRelativeTime(thread.lastMessageAt)}
          </span>
        </span>

        {subtitle && (
          <span className="mt-0.5 block truncate text-[11px] text-text-muted">{subtitle}</span>
        )}

        <span className="mt-1 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs leading-4 text-text-secondary">
            {preview}
          </span>
          {thread.replyNeeded && (
            <span className="shrink-0 rounded-sm bg-warning-muted px-1 py-px text-[10px] font-medium text-warning">
              Reply
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
