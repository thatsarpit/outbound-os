import * as Sentry from '@sentry/react'

/**
 * Client error tracking. Entirely gated on the VITE_SENTRY_DSN env var:
 * with no DSN set (local dev, or before the operator configures Sentry) every
 * function here is a no-op, so the app behaves exactly as before. Set
 * VITE_SENTRY_DSN in the Cloudflare Pages environment to turn it on.
 */
const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

export function initSentry(): void {
  if (!DSN || import.meta.env.DEV) return
  Sentry.init({
    dsn: DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    // Conservative sampling — traces for perf, replays only on error.
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE,
  })
}

/** Report a caught error (e.g. from an ErrorBoundary). No-op without a DSN. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!DSN) return
  Sentry.captureException(error, context ? { extra: context } : undefined)
}

/** True when Sentry is actually configured — lets callers skip work if off. */
export const sentryEnabled = Boolean(DSN)
