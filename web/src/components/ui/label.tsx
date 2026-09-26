import { forwardRef } from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

export interface LabelProps extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  required?: boolean
}

export const Label = forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, LabelProps>(
  function Label({ className, required, children, ...props }, ref) {
    return (
      <LabelPrimitive.Root
        ref={ref}
        className={cn(
          'text-xs font-medium text-text-secondary leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
          className,
        )}
        {...props}
      >
        {children}
        {required && (
          <span aria-hidden="true" className="ml-1 text-danger">
            *
          </span>
        )}
      </LabelPrimitive.Root>
    )
  },
)
