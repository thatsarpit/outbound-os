import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /**
   * Pending state. Disables the button, swaps icon for spinner, and (if
   * pendingLabel is provided) swaps the children for the pending label so the
   * user sees "Saving…" / "Sending…" instead of just a silent spinner.
   *
   * Prefer `pending` + `pendingLabel` for primary actions. `isLoading` is
   * retained as a deprecated alias for migration.
   */
  pending?: boolean
  pendingLabel?: ReactNode
  /** @deprecated Use `pending` (and ideally pair with `pendingLabel`). */
  isLoading?: boolean
  asChild?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

const VARIANT_CLASSES: Record<Variant, string> = {
  // Primary is solid ink. `text-accent-fg` inverts with the theme, so this is
  // ink-on-light in light mode and light-on-ink in dark.
  primary:
    'bg-accent text-accent-fg shadow-sm hover:bg-accent-hover disabled:bg-accent/30 disabled:text-accent-fg/70 disabled:shadow-none',
  secondary:
    'bg-surface text-text-primary border border-border shadow-sm hover:bg-surface-raised hover:border-border-strong disabled:bg-surface disabled:text-text-muted disabled:shadow-none',
  ghost:
    'bg-transparent text-text-secondary hover:bg-surface-raised hover:text-text-primary disabled:text-text-muted',
  danger:
    'bg-danger text-danger-fg shadow-sm hover:brightness-95 disabled:bg-danger/30 disabled:shadow-none',
}

// Tight geometry: 7px on every size. Pill-shaped controls read as consumer
// software; a dense operations tool wants a crisp, near-square corner.
const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-md',
  lg: 'h-10 px-4 text-sm gap-2 rounded-md',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    pending,
    pendingLabel,
    isLoading,
    asChild = false,
    leftIcon,
    rightIcon,
    disabled,
    children,
    type,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  // pending wins over the deprecated isLoading, but both still trigger the spinner
  const busy = pending ?? isLoading ?? false
  const isDisabled = disabled || busy
  // When pending, prefer the explicit pendingLabel; otherwise keep the original
  // children so the button still has accessible text.
  const renderedChildren = busy && pendingLabel !== undefined ? pendingLabel : children

  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      disabled={isDisabled}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {/* Radix Slot requires exactly one child, so `asChild` passes children
          through untouched — the caller puts any icons inside their own
          element. Wrapping them here made every `asChild` usage throw. */}
      {asChild ? (
        children
      ) : (
        <>
          {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : leftIcon}
          {renderedChildren}
          {!busy && rightIcon}
        </>
      )}
    </Comp>
  )
})
