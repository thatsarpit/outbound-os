import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { SkeletonCard, SkeletonTable } from './skeleton'

/**
 * LoadingState — canonical pending-fetch UI.
 *
 * Decision rule:
 *   variant="page"    initial page-level data load → skeleton card grid
 *   variant="table"   initial table data load → skeleton table rows
 *   variant="card"    inside a card while data loads → single skeleton card
 *   variant="inline"  in-place mutation or small region → spinner + optional label
 *
 * Don't put a bare <Loader2> in pages — wrap it here so every page shares the
 * same loading vocabulary. If you find yourself wanting something custom, add
 * a new variant.
 */
export type LoadingStateVariant = 'page' | 'table' | 'card' | 'inline'

export function LoadingState({
  variant = 'inline',
  label,
  rows,
  cards,
  className,
}: {
  variant?: LoadingStateVariant
  label?: string
  /** Rows for the `table` variant (default 5). */
  rows?: number
  /** Card count for the `page` variant (default 3). */
  cards?: number
  className?: string
}) {
  if (variant === 'page') {
    const n = cards ?? 3
    return (
      <div
        className={cn('grid gap-6 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in', className)}
        role="status"
        aria-live="polite"
        aria-label={label || 'Loading'}
      >
        {Array.from({ length: n }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }
  if (variant === 'table') {
    return (
      <div
        className={cn('animate-fade-in', className)}
        role="status"
        aria-live="polite"
        aria-label={label || 'Loading'}
      >
        <SkeletonTable rows={rows ?? 5} />
      </div>
    )
  }
  if (variant === 'card') {
    return (
      <div
        className={cn('animate-fade-in', className)}
        role="status"
        aria-live="polite"
        aria-label={label || 'Loading'}
      >
        <SkeletonCard />
      </div>
    )
  }
  // inline
  return (
    <div
      className={cn('inline-flex items-center gap-2 text-sm text-text-secondary', className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
      {label && <span>{label}</span>}
    </div>
  )
}
