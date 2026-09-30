import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** Current-state shares are not funnel conversion rates: the stages are exclusive. */
export type DistributionStage = {
  label: string
  value: number
  color: string
  href?: string
  offProgression?: boolean
}

export function StageDistribution({
  stages,
  formatValue = String,
  className,
}: {
  stages: DistributionStage[]
  formatValue?: (value: number) => string
  className?: string
}) {
  const path = stages.filter((stage) => !stage.offProgression)
  const aside = stages.filter((stage) => stage.offProgression)
  const total = stages.reduce((sum, stage) => sum + Math.max(0, stage.value), 0)
  const pathTotal = path.reduce((sum, stage) => sum + Math.max(0, stage.value), 0)
  return (
    <div className={cn('space-y-4', className)}>
      <div
        className="flex h-5 overflow-hidden rounded-sm bg-surface-raised"
        role="img"
        aria-label="Pipeline stage shares"
      >
        {path
          .filter((stage) => stage.value > 0)
          .map((stage) => (
            <Link
              key={stage.label}
              to={stage.href ?? '#'}
              title={`${stage.label}: ${formatValue(stage.value)}`}
              aria-label={`${stage.label}: ${formatValue(stage.value)}`}
              className="min-w-[2px] border-r-2 border-surface outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
              style={{ width: `${(stage.value / pathTotal) * 100}%`, backgroundColor: stage.color }}
            />
          ))}
      </div>
      <div className="space-y-1">
        {path.map((stage) => (
          <Link
            key={stage.label}
            to={stage.href ?? '#'}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-focus"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: stage.color }}
            />
            <span className="min-w-0 flex-1 text-text-secondary">{stage.label}</span>
            <span className="tabular-nums text-text-primary">{formatValue(stage.value)}</span>
            <span className="w-10 text-right tabular-nums text-text-muted">
              {total ? `${Math.round((stage.value / total) * 100)}%` : '0%'}
            </span>
          </Link>
        ))}
      </div>
      {aside.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="mb-1 text-xs text-text-muted">Outside the active path</p>
          {aside.map((stage) => (
            <Link
              key={stage.label}
              to={stage.href ?? '#'}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-focus"
            >
              <span className="min-w-0 flex-1 text-text-secondary">{stage.label}</span>
              <span className="tabular-nums text-text-primary">{formatValue(stage.value)}</span>
              <span className="w-10 text-right tabular-nums text-text-muted">
                {total ? `${Math.round((stage.value / total) * 100)}%` : '0%'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
