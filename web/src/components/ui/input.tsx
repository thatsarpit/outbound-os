import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Label } from './label'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  description?: string
  error?: string
  required?: boolean
  containerClassName?: string
  leftAddon?: ReactNode
  rightAddon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    containerClassName,
    label,
    description,
    error,
    required,
    leftAddon,
    rightAddon,
    id,
    ...props
  },
  ref,
) {
  const reactId = useId()
  const inputId = id ?? reactId
  const describedById = description ? `${inputId}-description` : undefined
  const errorId = error ? `${inputId}-error` : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <Label htmlFor={inputId} required={required}>
          {label}
        </Label>
      )}
      <div
        className={cn(
          'flex items-stretch overflow-hidden rounded-md border bg-surface-raised transition-colors',
          'focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20',
          error
            ? 'border-danger/60 focus-within:border-danger focus-within:ring-danger/20'
            : 'border-border',
          props.disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        {leftAddon && (
          <span className="flex items-center px-3 text-text-muted border-r border-border">
            {leftAddon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(describedById, errorId) || undefined}
          required={required}
          className={cn(
            'flex-1 min-w-0 bg-transparent px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted',
            'focus:outline-none disabled:cursor-not-allowed',
            className,
          )}
          {...props}
        />
        {rightAddon && (
          <span className="flex items-center px-3 text-text-muted border-l border-border">
            {rightAddon}
          </span>
        )}
      </div>
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
  )
})
