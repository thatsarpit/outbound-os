import { cn } from '@/lib/utils'

/**
 * A ranked list of magnitudes.
 *
 * Modelled on Tremor's BarList, rebuilt on our tokens. This is the RIGHT form
 * for "top N by volume" and the wrong one for parts-of-a-whole (use
 * CategoryBar) or ordered stages (use FunnelSteps) — a dashboard where every
 * panel is a bar list reads as one repeated widget rather than four answers.
 *
 * The bar sits behind the label rather than under it: one row instead of two,
 * and the eye compares lengths on a single baseline. The previous version put
 * a 1.5px rule under each label, which is thin enough to read as a divider.
 */
export type BarListItem = {
  label: string
  value: number
  /** Shown right-aligned; defaults to the value. */
  display?: string
  /** Share 0-1 for the bar width. Defaults to value / max. */
  share?: number
  color: string
  href?: string
}

export function BarList({
  items,
  formatValue = (n: number) => String(n),
  className,
}: {
  items: BarListItem[]
  formatValue?: (value: number) => string
  className?: string
}) {
  const max = Math.max(...items.map((i) => i.value), 0) || 1

  return (
    <ol className={cn('space-y-1', className)}>
      {items.map((item) => {
        const pct = (item.share ?? item.value / max) * 100
        return (
          <li key={item.label} className="relative">
            <div className="relative flex h-8 items-center overflow-hidden rounded-md">
              <div
                aria-hidden="true"
                className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-500"
                style={{
                  width: `${Math.max(pct, item.value > 0 ? 2 : 0)}%`,
                  backgroundColor: item.color,
                  opacity: 0.22,
                }}
              />
              <div
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-0.5 rounded-l-md"
                style={{ backgroundColor: item.color }}
              />
              <span className="relative z-10 min-w-0 flex-1 truncate pl-3 pr-2 text-[13px] text-text-primary">
                {item.label}
              </span>
              <span className="relative z-10 shrink-0 pr-3 text-[13px] tabular-nums text-text-secondary">
                {item.display ?? formatValue(item.value)}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
