import type { InboxChannel } from '@/api/types'
import { getChannel } from '@/lib/channels'
import { cn } from '@/lib/utils'

type Variant = 'chip' | 'icon' | 'inline'

/**
 * Channel identity mark.
 *
 * `icon`   — glyph only, for dense rows where a labelled chip would be noise.
 * `inline` — glyph + label, no fill, for headers.
 * `chip`   — tinted, bordered, labelled; for places a channel must be obvious.
 *
 * The old version was chip-only, so a mixed thread list turned into a column
 * of coloured pills competing with the content. Colour always rides along with
 * the icon, never alone.
 */
export function ChannelBadge({
  channel,
  variant = 'chip',
  className,
}: {
  channel: InboxChannel
  variant?: Variant
  className?: string
}) {
  const meta = getChannel(channel)
  const Icon = meta.icon

  if (variant === 'icon') {
    return (
      <span
        title={meta.label}
        aria-label={meta.label}
        className={cn('inline-flex shrink-0 items-center', meta.text, className)}
      >
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      </span>
    )
  }

  if (variant === 'inline') {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 text-xs font-medium', meta.text, className)}
      >
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        {meta.label}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium',
        meta.bg,
        meta.text,
        meta.border,
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      {meta.label}
    </span>
  )
}
