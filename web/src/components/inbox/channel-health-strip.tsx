import { Link } from 'react-router-dom'
import type { InboxChannelHealth, InboxChannel } from '@/api/types'
import { CHANNELS, CHANNEL_ORDER } from '@/lib/channels'
import { cn } from '@/lib/utils'

const STATUS_DOT: Record<string, string> = {
  ready: 'bg-success',
  limited: 'bg-warning',
  offline: 'bg-danger',
}

const SETTINGS_ROUTE: Record<InboxChannel, string> = {
  whatsapp: '/settings/whatsapp',
  imessage: '/settings/imessage',
  email: '/settings/email',
  telegram: '/integrations/telegram',
}

/**
 * Connection state for every channel, as one compact row.
 *
 * This was four cards on a wrapping grid — 121px of vertical space above the
 * inbox, permanently, for information that only matters when something breaks.
 * It is now a single strip: channel glyph in its own colour, a status dot, and
 * the detail text revealed on hover via the title. Anything not "ready" keeps
 * its label visible so a real problem is still impossible to miss.
 */
export function ChannelHealthStrip({ health }: { health?: InboxChannelHealth }) {
  if (!health) return null

  const items = CHANNEL_ORDER.map((id) => ({ id, meta: CHANNELS[id], data: health[id] })).filter(
    (item) => Boolean(item.data),
  )
  if (items.length === 0) return null

  const degraded = items.filter((item) => item.data.status !== 'ready')

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 rounded-md border border-border bg-surface px-2 py-1.5">
      <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        Channels
      </span>
      {items.map(({ id, meta, data }) => {
        const Icon = meta.icon
        const isReady = data.status === 'ready'
        return (
          <Link
            key={id}
            to={SETTINGS_ROUTE[id]}
            title={`${meta.label} — ${data.detail}`}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-[11px] transition-colors',
              'hover:bg-surface-raised',
            )}
          >
            <Icon aria-hidden="true" className={cn('h-3.5 w-3.5', meta.text)} />
            <span className={cn(isReady ? 'text-text-secondary' : 'text-text-primary')}>
              {meta.label}
            </span>
            <span
              className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[data.status] || 'bg-text-muted')}
              aria-label={data.status}
            />
            {!isReady && <span className="text-text-muted">{data.detail}</span>}
          </Link>
        )
      })}
      {degraded.length === 0 && (
        <span className="ml-auto shrink-0 pr-1 text-[11px] text-text-muted">All connected</span>
      )}
    </div>
  )
}
