import { cn } from '@/lib/utils'

/**
 * An ordered distribution across stages.
 *
 * A pipeline is not a ranked list: the stages have a fixed order, and sorting
 * them by size throws that away. So bars stay in stage order, sized against
 * the largest stage.
 *
 * It deliberately does NOT show a conversion rate between steps. These are
 * current-state counts — a lead sitting in "contacted" has left "new", so the
 * stages are mutually exclusive rather than a cohort draining through them.
 * Dividing one by the previous produced figures like "214% continue", which is
 * not a rounding problem but a category error. A real conversion rate needs
 * cohort data (how many that ever reached stage N went on to N+1), which this
 * endpoint does not carry.
 *
 * `offProgression` stages (paused, unreachable) sit apart under a divider —
 * they are a state, not a step on the path.
 */
export type DistributionStage = {
  label: string
  value: number
  color: string
  /** Rendered below the funnel rather than as a step. */
  offProgression?: boolean
}

export function StageDistribution({
  stages: steps,
  formatValue = (n: number) => String(n),
  className,
}: {
  stages: DistributionStage[]
  formatValue?: (value: number) => string
  className?: string
}) {
  const path = steps.filter((s) => !s.offProgression)
  const aside = steps.filter((s) => s.offProgression)
  const total = steps.reduce((sum, s) => sum + Math.max(0, s.value), 0)
  const max = Math.max(...path.map((s) => s.value), 0) || 1

  return (
    <div className={cn('space-y-1', className)}>
      {path.map((step) => {
        const width = (step.value / max) * 100
        return (
          <div key={step.label}>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div
                  className="flex h-9 items-center rounded-md px-3 transition-[width] duration-500"
                  style={{
                    width: `${Math.max(width, step.value > 0 ? 12 : 0)}%`,
                    backgroundColor: step.color,
                  }}
                >
                  {/* Label sits on the fill only when the fill is wide enough
                      to hold it; otherwise it would clip or overlap. */}
                  {width > 14 && (
                    <span className="truncate text-[13px] font-medium text-white/95">
                      {step.label}
                    </span>
                  )}
                </div>
                {width <= 14 && (
                  <span className="mt-0.5 block text-[12px] text-text-secondary">{step.label}</span>
                )}
              </div>
              <span className="w-28 shrink-0 text-right text-[13px] tabular-nums">
                <span className="text-text-primary">{formatValue(step.value)}</span>{' '}
                <span className="text-text-muted">
                  {total > 0 ? `${((step.value / total) * 100).toFixed(0)}%` : ''}
                </span>
              </span>
            </div>
          </div>
        )
      })}

      {aside.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          {aside.map((step) => (
            <div key={step.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[13px] text-text-secondary">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: step.color }}
                />
                {step.label}
                <span className="text-[11px] text-text-muted">not on the path</span>
              </span>
              <span className="text-[13px] tabular-nums text-text-primary">
                {formatValue(step.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
