import type { InboxThreadSummary } from '@/api/types'
import { cn, formatRelativeTime } from '@/lib/utils'
import { CHANNEL_ORDER, getChannel, getThreadSubtitle } from '@/lib/channels'

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
 * Keep provider-accepted outreach compact so the row still has room for the
 * lead's name, timestamp and latest message on mobile.
 */
export function ThreadListItem({
  thread,
  selected,
  onSelect,
  mobile = false,
}: {
  thread: InboxThreadSummary
  selected: boolean
  onSelect: () => void
  mobile?: boolean
}) {
  const outreach = thread.outreachChannels
  const channels = outreach
    ? CHANNEL_ORDER.filter(channel => outreach.includes(channel)).map(getChannel)
    : [getChannel(thread.channel)]
  const channelNames = channels.map(channel => channel.label).join(', ')
  const channelLabel = outreach ? `Outreach sent via ${channelNames}` : `Latest message via ${channelNames}`
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
        mobile && 'min-h-22 py-3',
        selected ? 'bg-surface-raised' : 'hover:bg-surface-raised/60',
      )}
    >
      {selected && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />
      )}

      {/* Unread marker sits in its own narrow column so names stay aligned. */}
      <span className="flex w-1.5 shrink-0 items-center justify-center pt-1.5">
        {thread.unread && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-focus"
            title="Unread message"
            aria-label="Unread message"
          />
        )}
      </span>

      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[10px] font-semibold text-text-secondary">
        {getInitials(name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              mobile ? 'text-sm' : 'text-[13px]',
              thread.unread ? 'font-semibold text-text-primary' : 'font-medium text-text-primary',
            )}
          >
            {name}
          </span>
          {channels.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1.5 self-center" title={channelLabel}>
              <span className="sr-only">{channelLabel}</span>
              {channels.map(({ id, icon: Icon, text }) => (
                <Icon key={id} aria-hidden="true" className={cn('size-3.5', text)} />
              ))}
            </span>
          )}
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
