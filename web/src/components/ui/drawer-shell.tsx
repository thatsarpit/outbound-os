import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type DrawerShellProps = {
  children: ReactNode
  onClose: () => void
  className?: string
  panelClassName?: string
  backdropClassName?: string
}

export function DrawerShell({
  children,
  onClose,
  className,
  panelClassName,
  backdropClassName,
}: DrawerShellProps) {
  return (
    <div className={cn('fixed inset-0 z-50 flex justify-end max-lg:items-end', className)}>
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className={cn('absolute inset-0 bg-black/50 backdrop-blur-sm', backdropClassName)}
      />

      <div
        className={cn(
          'relative flex w-full flex-col overflow-hidden bg-surface shadow-2xl animate-slide-up lg:animate-slide-in-right',
          'max-lg:max-h-[95vh] max-lg:rounded-t-[28px] max-lg:border max-lg:border-border/80 max-lg:border-b-0',
          'lg:h-full lg:max-w-xl lg:border-l lg:border-border',
          panelClassName,
        )}
        style={{ overscrollBehavior: 'contain' }}
      >
        <div className="flex justify-center bg-surface/95 px-4 pb-2 pt-3 backdrop-blur-md lg:hidden">
          <div className="h-1.5 w-12 rounded-full bg-border" />
        </div>
        {children}
      </div>
    </div>
  )
}
