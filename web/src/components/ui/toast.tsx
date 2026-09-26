import { useToastStore } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'

const ICON_MAP = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
}

const COLOR_MAP = {
  success: 'border-success/25 bg-success/10 text-success',
  error: 'border-danger/25 bg-danger/10 text-danger',
  info: 'border-info/25 bg-info/10 text-info',
  warning: 'border-warning/25 bg-warning/10 text-warning',
}

const LABEL_MAP = {
  success: 'Success',
  error: 'Error',
  info: 'Info',
  warning: 'Warning',
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-4 right-4 z-100 flex w-[min(92vw,24rem)] flex-col gap-2 sm:bottom-6 sm:right-6"
    >
      {toasts.map((t, index) => {
        const Icon = ICON_MAP[t.type]
        return (
          <div
            key={t.id}
            className={cn(
              'overflow-hidden rounded-md border backdrop-blur-md shadow-md',
              t.closing ? 'animate-toast-out' : 'animate-slide-in-right',
              COLOR_MAP[t.type],
            )}
            style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <div
                className={cn(
                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface/70',
                  COLOR_MAP[t.type],
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  {LABEL_MAP[t.type]}
                </p>
                <p className="mt-1 text-sm font-medium leading-5 text-text-primary">{t.message}</p>
              </div>
              <button
                aria-label="Dismiss notification"
                onClick={() => dismissToast(t.id)}
                className="shrink-0 rounded-lg p-1 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
              >
                <X aria-hidden="true" className="w-4 h-4" />
              </button>
            </div>
            <div className={cn('h-1 w-full', COLOR_MAP[t.type])} />
          </div>
        )
      })}
    </div>
  )
}
