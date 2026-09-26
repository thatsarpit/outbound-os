import { cn } from '@/lib/utils'

export function StatPill({
  label,
  value,
  size = 'md',
  className,
}: {
  label?: string
  value: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  if (size === 'lg') {
    // HeroChip equivalent
    return (
      <div className={cn('rounded-md border border-border bg-surface-raised px-4 py-3', className)}>
        {label && <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{label}</p>}
        <p className={cn('text-xl font-semibold tracking-tight', label && 'mt-2')}>{value}</p>
      </div>
    )
  }

  if (size === 'sm') {
    // AccessPill equivalent
    return (
      <span
        className={cn(
          'rounded-full border border-border bg-surface-raised px-3 py-1 text-[11px] font-medium text-text-secondary whitespace-nowrap',
          className,
        )}
      >
        {value} {label && <span className="ml-1 opacity-70">{label}</span>}
      </span>
    )
  }

  // InlinePill / RoleChip equivalent
  return (
    <div
      className={cn(
        'rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs text-text-secondary whitespace-nowrap',
        className,
      )}
    >
      <span className="font-medium text-text-primary">{value}</span>
      {label && <span className="ml-1">{label}</span>}
    </div>
  )
}
