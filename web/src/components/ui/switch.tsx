import { forwardRef } from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export const Switch = forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-accent data-[state=unchecked]:bg-surface-overlay',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-md ring-0 transition-transform',
          'data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  )
})

/**
 * Convenience: <SwitchField label="Send follow-ups" description="..." checked onCheckedChange={...} />
 */
export interface SwitchFieldProps extends Omit<
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
  'children'
> {
  label: string
  description?: string
}

export function SwitchField({
  label,
  description,
  id,
  className,
  ...switchProps
}: SwitchFieldProps) {
  const generatedId = `switch-${label.replace(/\s+/g, '-').toLowerCase()}`
  const switchId = id ?? generatedId

  return (
    <label
      htmlFor={switchId}
      className={cn(
        'flex items-start justify-between gap-3 rounded-md border border-border bg-surface-raised px-4 py-3 cursor-pointer',
        'hover:border-border/80 transition-colors',
        switchProps.disabled && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        {description && <span className="text-xs text-text-muted">{description}</span>}
      </div>
      <Switch id={switchId} {...switchProps} />
    </label>
  )
}
