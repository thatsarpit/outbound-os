import { cn } from '@/lib/utils'

/**
 * Shared stat tiles for the integration channel pages. Extracted verbatim from
 * the former integrations.tsx so every channel renders identical cards.
 */
export function InfoTile({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="card-hover rounded-md border border-border bg-surface px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-text-secondary">{detail}</p>
    </div>
  )
}

export function InfoMini({
  label,
  value,
  compact = false,
}: {
  label: string
  value: string | number
  compact?: boolean
}) {
  return (
    <div className="rounded-md border border-border bg-surface-raised px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className={cn('mt-2 font-semibold tracking-tight', compact ? 'text-sm' : 'text-xl')}>
        {value}
      </p>
    </div>
  )
}
