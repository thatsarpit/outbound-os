import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { systemApi } from '@/api/endpoints/system'
import { cn } from '@/lib/utils'

/**
 * App-wide health banner. Polls /api/system/health every 60s and renders only
 * when something is wrong (overall !== 'ok'), listing each issue. This is the
 * antidote to the silent-failure problem: a dead AI model, broken email, or a
 * disconnected WhatsApp account now shows up immediately instead of going
 * unnoticed for weeks. Invisible (renders null) when everything is healthy.
 */
export function SystemHealthBanner() {
  const { data } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => systemApi.getHealth(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    // Background widget — never surface its own fetch errors as toasts.
    meta: { silent: true },
  })

  const health = data?.health
  const recovery = data?.recovery
  const recoveredAtMs = recovery?.lastRecoveryAt ? new Date(recovery.lastRecoveryAt).getTime() : 0
  const isRecentRecovery = recoveredAtMs > 0 && Date.now() - recoveredAtMs < 10 * 60_000

  if (recovery?.running) {
    return (
      <div className="mb-4 rounded-md border border-accent/30 bg-accent/8 px-4 py-3">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 shrink-0 animate-spin text-accent" />
          <div>
            <p className="text-sm font-semibold text-text-primary">
              Recovering after restart or wake
            </p>
            <p className="text-xs leading-5 text-text-secondary">
              Reconciling every outreach channel that was interrupted.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (
    (!health || health.overall === 'ok' || health.issues.length === 0) &&
    recovery?.lastRecoveryStatus === 'ok' &&
    isRecentRecovery
  ) {
    const reconciled = recovery.summary?.reconciliation
    const repaired =
      (reconciled?.whatsappQueued || 0) +
      (reconciled?.emailQueued || 0) +
      (reconciled?.imessageQueued || 0)
    return (
      <div className="mb-4 rounded-md border border-success/30 bg-success-muted/25 px-4 py-3">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <div>
            <p className="text-sm font-semibold text-success">Automation resumed successfully</p>
            <p className="text-xs leading-5 text-text-secondary">
              Repaired {repaired} channel queue{repaired === 1 ? '' : 's'} left over from the last restart.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!health || health.overall === 'ok' || health.issues.length === 0) return null

  const isDown = health.overall === 'down'

  return (
    <div
      role="alert"
      className={cn(
        'mb-4 rounded-md border px-4 py-3',
        isDown ? 'border-danger/40 bg-danger-muted/40' : 'border-warning/40 bg-warning-muted/40',
      )}
    >
      <div className="flex items-start gap-3">
        {isDown ? (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        )}
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold', isDown ? 'text-danger' : 'text-warning')}>
            {isDown
              ? 'System issue — outreach may be affected'
              : 'Heads up — some checks are degraded'}
          </p>
          <ul className="mt-1 space-y-0.5">
            {health.issues.map((issue, i) => (
              <li key={`${issue.area}-${i}`} className="text-xs leading-5 text-text-secondary">
                <span className="font-medium capitalize text-text-primary">{issue.area}:</span>{' '}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
