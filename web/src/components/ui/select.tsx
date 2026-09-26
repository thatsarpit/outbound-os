import { forwardRef, useId, type ReactNode } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from './label'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    error?: boolean
  }
>(function SelectTrigger({ className, children, error, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(
        'flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-surface-raised px-3.5 text-sm transition-colors',
        'placeholder:text-text-muted',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:border-accent/60',
        'disabled:cursor-not-allowed disabled:opacity-60',
        '[&>span]:line-clamp-1 [&>span]:text-left',
        error ? 'border-danger/60' : 'border-border',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-text-muted shrink-0" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
})

export const SelectContent = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ className, children, position = 'popper', ...props }, ref) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn(
          'z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-border bg-surface shadow-md',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-6 cursor-default items-center justify-center text-text-muted">
          <ChevronUp className="h-4 w-4" />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport
          className={cn(
            'p-1.5',
            position === 'popper' &&
              'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]',
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex h-6 cursor-default items-center justify-center text-text-muted">
          <ChevronDown className="h-4 w-4" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
})

export const SelectLabel = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabelImpl({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn('px-2 py-1.5 text-[10px] uppercase tracking-wider text-text-muted', className)}
      {...props}
    />
  )
})

export const SelectItem = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-lg pl-8 pr-3 py-2 text-sm text-text-primary outline-none',
        'focus:bg-surface-raised focus:text-text-primary',
        'data-[state=checked]:text-accent',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-3.5 w-3.5" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
})

export const SelectSeparator = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn('my-1 h-px bg-border-subtle', className)}
      {...props}
    />
  )
})

/**
 * Higher-level SelectField — label + Select + error/description in one component.
 * For simpler call-sites: <SelectField label="Role" value={role} onValueChange={setRole} options={...} />
 */
export interface SelectFieldOption {
  label: string
  value: string
  description?: string
  disabled?: boolean
}

export interface SelectFieldProps {
  label?: string
  description?: string
  error?: string
  required?: boolean
  placeholder?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  options: SelectFieldOption[]
  className?: string
  containerClassName?: string
  triggerClassName?: string
  children?: ReactNode
}

export function SelectField({
  label,
  description,
  error,
  required,
  placeholder,
  value,
  defaultValue,
  onValueChange,
  disabled,
  options,
  containerClassName,
  triggerClassName,
}: SelectFieldProps) {
  const reactId = useId()
  const triggerId = `${reactId}-trigger`

  // Radix forbids an empty-string <SelectItem value> (it reserves '' for
  // "clear selection"), which throws and crashes the whole view. Lots of call
  // sites legitimately use '' for an "All / None / Default" option, so we map
  // '' to an internal sentinel here and translate it back on change — callers
  // keep using '' transparently and can never trigger the crash.
  const EMPTY = '__empty__'
  const toItem = (v?: string) => (v === '' ? EMPTY : v)
  const fromItem = (v: string) => (v === EMPTY ? '' : v)

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <Label htmlFor={triggerId} required={required}>
          {label}
        </Label>
      )}
      <Select
        value={toItem(value)}
        defaultValue={toItem(defaultValue)}
        onValueChange={onValueChange ? (v) => onValueChange(fromItem(v)) : undefined}
        disabled={disabled}
      >
        <SelectTrigger id={triggerId} error={!!error} className={triggerClassName}>
          <SelectValue placeholder={placeholder ?? 'Select…'} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={toItem(opt.value) as string} disabled={opt.disabled}>
              <span className="flex flex-col">
                <span>{opt.label}</span>
                {opt.description && (
                  <span className="text-xs text-text-muted">{opt.description}</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && !error && <p className="text-xs text-text-muted">{description}</p>}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
