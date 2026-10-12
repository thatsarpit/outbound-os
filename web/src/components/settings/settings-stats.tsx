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
    <div className="min-w-0 rounded-md border border-border bg-surface-raised/50 px-3 py-3">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span className="text-xs leading-4">{label}</span>
      </div>
      <p className="mt-2 break-words text-lg font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  )
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface px-3 py-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  )
}
