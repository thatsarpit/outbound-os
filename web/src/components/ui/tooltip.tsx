import { forwardRef, type ReactNode } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

export const TooltipProvider = TooltipPrimitive.Provider
export const TooltipRoot = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-xs rounded-lg border border-border bg-surface-overlay px-2.5 py-1.5 text-xs text-text-primary shadow-md',
          'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0',
          'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
          'data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
})

/**
 * Convenience helper for the common case: wrap a child with a hover tooltip.
 * <Tooltip content="Click to edit"><button>...</button></Tooltip>
 */
export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  delayDuration?: number
  open?: boolean
  onOpenChange?: (open: boolean) => void
  asChild?: boolean
}

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delayDuration = 150,
  open,
  onOpenChange,
  asChild = true,
}: TooltipProps) {
  return (
    <TooltipRoot delayDuration={delayDuration} open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align}>
        {content}
      </TooltipContent>
    </TooltipRoot>
  )
}
