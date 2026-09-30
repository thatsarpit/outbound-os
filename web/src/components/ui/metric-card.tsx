import type React from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import NumberFlow from '@number-flow/react'

/**
 * The single metric component. There were three implementations of this idea —
 * this one (imported by nothing), a local `StatCard` in the Overview page and a
 * local `KpiCard` in Analytics. Pages should use this and delete their copies.
 *
 * Values are tabular so a row of metrics lines up on the decimal.
 */

type Delta = {
  /** Percent change against the comparison period. Sign carries direction. */
  value: number
  /** What it is being compared to, e.g. "vs last week". */
  label?: string
  /** Set when a decrease is the good outcome (response time, bounce rate). */
  inverted?: boolean
}

/**
 * A sparkline shows shape, not judgement.
 *
 * This used to paint itself success-green or danger-red, which put green on
 * cards like "messages sent" where nothing good or bad had happened — and made
 * the sparklines fight the charts beside them, which are drawn from the chart
 * palette. Status colours are reserved for actual status; the trend line now
 * wears the chart accent, and the delta chip beside it carries the verdict.
 */
function Sparkline({ points, tone }: { points: number[]; tone: 'accent' | 'success' | 'danger' }) {
  if (points.length < 2) return null

  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const width = 76
  const height = 22

  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width
    const y = height - ((point - min) / span) * height
    return [x, y] as const
  })

  const line = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ')
  const area = `${line} L${width} ${height} L0 ${height} Z`
  const stroke =
    tone === 'accent'
      ? 'var(--color-chart-1, var(--color-accent))'
      : tone === 'success'
        ? 'var(--color-success)'
        : 'var(--color-danger)'
  const [lastX, lastY] = coords[coords.length - 1]

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      <path d={area} fill={stroke} opacity="0.10" />
      <path
        d={line}
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r="2" fill={stroke} />
    </svg>
  )
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  delta,
  hint,
  trend,
  meter,
  className,
}: {
  icon?: React.ElementType
  label: string
  value: string | number
  delta?: Delta
  /** One short line of context under the value. */
  hint?: string
  /** Recent values, oldest first, for the inline sparkline. */
  trend?: number[]
  /**
   * A share of a whole, 0-1. Use where the metric IS a proportion — "252 of
   * 1,105 contacted" is a fact you can see at a glance as a bar and have to
   * read as text. Cards with neither a trend nor a meter sit visually flat
   * next to ones that have them, which is what made a row of these feel
   * half-finished.
   */
  meter?: number
  className?: string
}) {
  const improving = delta ? (delta.inverted ? delta.value < 0 : delta.value > 0) : true
  const DeltaIcon = delta && delta.value < 0 ? ArrowDownRight : ArrowUpRight

  return (
    <div
      className={cn(
        'card-hover min-w-0 rounded-md border border-border bg-surface p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-text-muted" />}
        <p className="truncate text-xs font-medium text-text-secondary">{label}</p>
      </div>

      <div className="mt-2 flex flex-col items-start gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <p className="truncate text-2xl font-semibold tracking-tight">
          {typeof value === 'number' ? (
            <NumberFlow value={value} format={{ notation: 'compact', maximumFractionDigits: 1 }} />
          ) : (
            value
          )}
        </p>
        {trend && trend.length > 1 && (
          <Sparkline points={trend} tone={delta ? (improving ? 'success' : 'danger') : 'accent'} />
        )}
      </div>

      {typeof meter === 'number' && (
        <div
          className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-raised"
          role="img"
          aria-label={`${Math.round(Math.max(0, Math.min(1, meter)) * 100)} percent`}
        >
          <div
            className="h-full rounded-full bg-[var(--color-chart-1,var(--color-accent))] transition-[width] duration-500"
            style={{ width: `${Math.max(1.5, Math.min(100, meter * 100))}%` }}
          />
        </div>
      )}

      {(delta || hint) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
          {delta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium tabular-nums',
                improving ? 'text-success' : 'text-danger',
              )}
            >
              <DeltaIcon aria-hidden="true" className="h-3 w-3" />
              {delta.value > 0 ? '+' : delta.value < 0 ? '−' : ''}
              {Math.abs(delta.value).toFixed(1)}%
            </span>
          )}
          {delta?.label && <span className="text-text-muted">{delta.label}</span>}
          {hint && <span className="truncate text-text-muted">{hint}</span>}
        </div>
      )}
    </div>
  )
}
