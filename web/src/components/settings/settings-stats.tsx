import type { ElementType } from 'react'

/**
 * Compact stat tiles used inside Settings section pages. Extracted from the
 * former monolithic settings.tsx. (`StatCard` is the larger tile with an icon,
 * `MiniStat` the small label/value pair.)
 */

export function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType
  label: string
  value: string
}) {
  return (
    <div className="card-hover rounded-md border border-border bg-surface-raised px-4 py-3">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-hover rounded-md border border-border bg-surface px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  )
}
