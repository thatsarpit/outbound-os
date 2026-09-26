import { forwardRef } from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Checkbox = forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'peer h-4 w-4 shrink-0 rounded-md border border-border bg-surface-raised',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:text-background',
        'data-[state=indeterminate]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:text-background',
        'transition-colors',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
        {props.checked === 'indeterminate' ? (
          <Minus className="h-3 w-3" strokeWidth={3} />
        ) : (
          <Check className="h-3 w-3" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
})

/**
 * Convenience: <CheckboxField label="I agree" description="..." />
 */
export interface CheckboxFieldProps extends Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  'children'
> {
  label: string
  description?: string
}

export function CheckboxField({
  label,
  description,
  id,
  className,
  ...checkboxProps
}: CheckboxFieldProps) {
  const generatedId = `checkbox-${label.replace(/\s+/g, '-').toLowerCase()}`
  const checkboxId = id ?? generatedId

  return (
    <label
      htmlFor={checkboxId}
      className={cn(
        'flex items-start gap-3 cursor-pointer',
        checkboxProps.disabled && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      <Checkbox id={checkboxId} {...checkboxProps} className="mt-0.5" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-text-primary leading-tight">{label}</span>
        {description && <span className="text-xs text-text-muted">{description}</span>}
      </div>
    </label>
  )
}
