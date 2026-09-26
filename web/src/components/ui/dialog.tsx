import { forwardRef, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const DialogPortal = DialogPrimitive.Portal

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-4xl',
} as const

export type DialogSize = keyof typeof SIZE_CLASSES

export interface DialogContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  size?: DialogSize
  /** Show the close button in the top-right (default true). */
  showClose?: boolean
}

export const DialogContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent({ className, children, size = 'md', showClose = true, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        )}
      />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
          'w-[min(92vw,100%)] sm:w-full',
          SIZE_CLASSES[size],
          'rounded-md border border-border bg-surface shadow-md',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'focus:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/60"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})

export function DialogHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col gap-1 px-6 pt-6 pb-4 border-b border-border-subtle', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export const DialogTitle = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-base font-semibold text-text-primary', className)}
      {...props}
    />
  )
})

export const DialogDescription = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-text-muted', className)}
      {...props}
    />
  )
})

export function DialogBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-6 py-5', className)} {...props}>
      {children}
    </div>
  )
}

export function DialogFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-6 py-4 border-t border-border-subtle',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * Convenience helper for a confirm-style dialog with a destructive primary action.
 * Use directly: <ConfirmDialog open={...} onConfirm={...} title="Delete lead?" />
 */
export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  isLoading,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  // Avoid circular import by reading button styles inline.
  const confirmBtnClass = destructive
    ? 'bg-danger text-danger-fg hover:bg-danger/90'
    : 'bg-accent text-background hover:bg-accent-hover'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children && <DialogBody>{children}</DialogBody>}
        <DialogFooter>
          <DialogClose
            disabled={isLoading}
            className="inline-flex h-10 items-center justify-center rounded-md bg-surface-raised border border-border px-4 text-sm font-medium text-text-primary hover:bg-surface-overlay disabled:opacity-60"
          >
            {cancelLabel}
          </DialogClose>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void onConfirm()}
            className={cn(
              'inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors',
              confirmBtnClass,
              isLoading && 'opacity-60 cursor-not-allowed',
            )}
          >
            {isLoading ? 'Working…' : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
