import { forwardRef, useId, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Label } from './label'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  description?: string
  error?: string
  required?: boolean
  containerClassName?: string
  /** Show live char count when defined (uses maxLength when not provided). */
  showCount?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    className,
    containerClassName,
    label,
    description,
    error,
    required,
    showCount,
    id,
    value,
    maxLength,
    ...props
  },
  ref,
) {
  const reactId = useId()
  const textareaId = id ?? reactId
  const describedById = description ? `${textareaId}-description` : undefined
  const errorId = error ? `${textareaId}-error` : undefined
  const length = typeof value === 'string' ? value.length : 0

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <Label htmlFor={textareaId} required={required}>
          {label}
        </Label>
      )}
      <div
        className={cn(
          'rounded-md border bg-surface-raised transition-colors',
          'focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20',
          error
            ? 'border-danger/60 focus-within:border-danger focus-within:ring-danger/20'
            : 'border-border',
          props.disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        <textarea
          ref={ref}
          id={textareaId}
          value={value}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(describedById, errorId) || undefined}
          required={required}
          className={cn(
            'w-full bg-transparent px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted',
            'focus:outline-none disabled:cursor-not-allowed resize-y min-h-[88px]',
            className,
          )}
          {...props}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {description && !error && (
            <p id={describedById} className="text-xs text-text-muted">
              {description}
            </p>
          )}
          {error && (
            <p id={errorId} role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
        {showCount && (
          <p
            className={cn(
              'text-xs tabular-nums shrink-0',
              maxLength && length > maxLength * 0.9 ? 'text-warning' : 'text-text-muted',
            )}
          >
            {length}
            {maxLength ? ` / ${maxLength}` : ''}
          </p>
        )}
      </div>
    </div>
  )
})
