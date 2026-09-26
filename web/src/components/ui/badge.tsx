import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'hot'
  | 'warm'
  | 'cold'
  | 'outline'

type Size = 'sm' | 'md'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
  size?: Size
}

const VARIANT_CLASSES: Record<Variant, string> = {
  neutral: 'bg-surface-raised text-text-secondary border-border',
  accent: 'bg-accent-muted text-accent border-accent/30',
  success: 'bg-success-muted text-success border-success/30',
  warning: 'bg-warning-muted text-warning border-warning/30',
  danger: 'bg-danger-muted text-danger border-danger/30',
  info: 'bg-info-muted text-info border-info/30',
  hot: 'bg-danger-muted text-hot border-hot/30',
  warm: 'bg-warning-muted text-warm border-warm/30',
  cold: 'bg-info-muted text-cold border-cold/30',
  outline: 'bg-transparent text-text-secondary border-border',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-5 px-1.5 text-[10px] gap-1 rounded-md tracking-wide',
  md: 'h-6 px-2 text-[11px] gap-1 rounded-lg',
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = 'neutral', size = 'sm', children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-semibold uppercase border',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
})

/** Map a lead status to a Badge variant. */
export function leadStatusVariant(status: string | null | undefined): Variant {
  switch (status) {
    case 'new':
      return 'info'
    case 'contacted':
      return 'warning'
    case 'replied':
      return 'accent'
    case 'engaged':
    case 'closed':
      return 'success'
    case 'paused':
    case 'wa_unavailable':
      return 'danger'
    default:
      return 'neutral'
  }
}

/** Map a lead tier (HOT/WARM/COLD) to a Badge variant. */
export function leadTierVariant(tier: string | null | undefined): Variant {
  switch (tier) {
    case 'HOT':
      return 'hot'
    case 'WARM':
      return 'warm'
    case 'COLD':
      return 'cold'
    default:
      return 'neutral'
  }
}
