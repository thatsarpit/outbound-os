import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ConfirmTone = 'danger' | 'warning' | 'primary'

type ConfirmDialogProps = {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
  busy?: boolean
  disableConfirm?: boolean
}

const TONE_CLASSES: Record<ConfirmTone, string> = {
  danger: 'bg-danger text-danger-fg hover:bg-danger/90 focus-visible:ring-danger/60 shadow-sm',
  warning: 'bg-warning text-warning-fg hover:bg-warning/90 focus-visible:ring-warning/50 shadow-sm',
  primary: 'bg-accent text-background hover:bg-accent-hover focus-visible:ring-focus/40 shadow-sm',
}

const ICON_TONE: Record<ConfirmTone, string> = {
  danger: 'bg-danger-muted text-danger',
  warning: 'bg-warning-muted text-warning',
  primary: 'bg-accent-muted text-accent',
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  disableConfirm = false,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    confirmRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open, onClose, busy])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={() => !busy && onClose()}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-md border border-border bg-surface shadow-2xl animate-slide-up">
        <div className="flex items-start gap-4 p-5">
          <div
            className={cn(
              'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
              ICON_TONE[tone],
            )}
          >
            <AlertTriangle aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="text-base font-semibold tracking-tight text-text-primary"
            >
              {title}
            </h2>
            {body ? (
              <div className="mt-2 text-sm leading-relaxed text-text-secondary">{body}</div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => !busy && onClose()}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-raised/40 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => {
              if (busy || disableConfirm) return
              void onConfirm()
            }}
            disabled={busy || disableConfirm}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
              TONE_CLASSES[tone],
            )}
          >
            {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
