import { cn } from '@/lib/utils'

/**
 * One bar, segmented — for values that are parts of a single whole.
 *
 * Modelled on Tremor's CategoryBar, rebuilt against our tokens rather than
 * pulled in as a dependency, so it inherits the theme instead of fighting it.
 *
 * Use this INSTEAD of a stack of separate bars when the values sum to 100%.
 * Three tiers drawn as three independent bars hides the one fact that matters
 * — their share of each other — and takes three rows to say less.
 *
 * Segments are separated by a 2px surface gap so adjacent fills stay
 * distinguishable without borders.
 */
export type CategorySegment = {
  label: string
  value: number
  /** Resolved colour. Pass a sequential ramp step for ordered data. */
  color: string
}

export function CategoryBar({
  segments,
  formatValue = (n: number) => String(n),
  className,
}: {
  segments: CategorySegment[]
  formatValue?: (value: number) => string
  className?: string
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0)
  if (total <= 0) return null

  return (
    <div className={cn('space-y-3', className)}>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-raised"
        role="img"
        aria-label={segments
          .map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`)
          .join(', ')}
      >
        {segments.map((s, i) => {
          const pct = (Math.max(0, s.value) / total) * 100
          if (pct <= 0) return null
          return (
            <div
              key={s.label}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${pct}%`,
                backgroundColor: s.color,
                // 2px of surface between fills, never on the leading edge.
                marginLeft: i === 0 ? 0 : 2,
              }}
            />
          )
        })}
      </div>

      {/* A legend is required once there are two or more segments: identity
          must never be carried by colour alone. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => {
          const pct = (Math.max(0, s.value) / total) * 100
          return (
            <li key={s.label} className="flex items-center gap-1.5 text-[12px]">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-text-secondary">{s.label}</span>
              <span className="tabular-nums font-medium text-text-primary">
                {formatValue(s.value)}
              </span>
              <span className="tabular-nums text-text-muted">{pct.toFixed(0)}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
