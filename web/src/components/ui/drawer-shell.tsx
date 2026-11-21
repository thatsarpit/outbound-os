import { useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

type DrawerShellProps = {
  children: ReactNode
  title: string
  onClose: () => void
  className?: string
  panelClassName?: string
  backdropClassName?: string
}

export function DrawerShell({
  children,
  title,
  onClose,
  className,
  panelClassName,
  backdropClassName,
}: DrawerShellProps) {
  const [opener] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null)
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className={cn('fixed inset-0 z-50 bg-black/50 backdrop-blur-sm', className, backdropClassName)} />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            const target = opener?.isConnected ? opener : opener?.id ? document.getElementById(opener.id) : null
            if (target) {
              event.preventDefault()
              target.focus()
            }
          }}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex w-full flex-col overflow-hidden bg-surface shadow-2xl animate-slide-up lg:animate-slide-in-right',
            'max-lg:max-h-[95dvh] max-lg:rounded-t-[28px] max-lg:border max-lg:border-border/80 max-lg:border-b-0',
            'lg:left-auto lg:right-0 lg:top-0 lg:h-full lg:max-w-xl lg:border-l lg:border-border',
            'overscroll-contain outline-none',
            className,
            panelClassName,
          )}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <div aria-hidden="true" className="flex justify-center bg-surface/95 px-4 pb-2 pt-3 backdrop-blur-md lg:hidden">
            <div className="h-1.5 w-12 rounded-full bg-border" />
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
