import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore, getSessionToken } from '@/stores/auth-store'
import type { ActivityLog } from '@/api/types'
import { notificationActions } from '@/stores/notification-store'

type StreamPayload = { type?: string; data?: Record<string, unknown>; ts?: number }

function normalizeStreamPayload(raw: string): StreamPayload | null {
  try {
    const parsed = JSON.parse(raw) as StreamPayload
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function useDashboardNotifications() {
  const { user, dashboardScope } = useAuthStore()
  const queryClient = useQueryClient()
  const authenticated = Boolean(user)

  useEffect(() => {
    let mounted = true
    const scopeKey = dashboardScope
    notificationActions.resetSession()
    notificationActions.setScopeKey(scopeKey)
    let hydrating = false
    let hydrationQueued = false
    let hydrationTimer: number | undefined

    async function hydrate() {
      if (hydrating) {
        hydrationQueued = true
        return
      }
      hydrating = true
      try {
        // Committed rows have identities that can be marked read across devices.
        // On failure, retain loaded data rather than inventing an in-memory feed.
        const items = await api.get<ActivityLog[]>('/notifications?limit=50')
        if (!mounted) return
        if (!Array.isArray(items)) throw new Error('Notification response unavailable')
        notificationActions.hydrateFromActivity(items)
      } catch {
        if (mounted) {
          notificationActions.setConnectionState(false, 'Sync unavailable')
        }
      } finally {
        hydrating = false
        if (mounted && hydrationQueued) {
          hydrationQueued = false
          hydrationTimer = window.setTimeout(() => void hydrate(), 250)
        }
      }
    }

    // EventSource can't carry an Authorization header, so the token still has
    // to go in the query string — but a Clerk session token is short-lived
    // (~60s) and fetched fresh per use, unlike the old static JWT, so getting
    // it is now async and has to happen before the connection opens rather
    // than as a synchronous read.
    let source: EventSource | null = null
    let retryTimer: number | undefined
    let retryDelay = 2000

    async function connect() {
      let token: string | null
      try {
        token = await getSessionToken()
      } catch {
        if (mounted)
          retryTimer = window.setTimeout(() => {
            void connect()
          }, 5000)
        return
      }
      if (!mounted) return
      if (!token) {
        notificationActions.setConnectionState(false, 'Reconnecting')
        retryTimer = window.setTimeout(() => {
          void connect()
        }, 5000)
        return
      }

      hydrate()

      source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
      notificationActions.setConnectionState(false, 'Connecting...')

      source.onopen = () => {
        retryDelay = 2000
        notificationActions.setConnectionState(true, 'Live updates')
      }

      source.onmessage = (event) => {
        const payload = normalizeStreamPayload(event.data)
        if (!payload?.type) return
        if (payload.type === 'connected') {
          notificationActions.setConnectionState(true, 'Live updates')
          return
        }

        const data = payload.data || {}
        const leadId = Number.isSafeInteger(data.leadId) ? Number(data.leadId) : null
        void queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
        if (leadId) void queryClient.invalidateQueries({ queryKey: ['inbox-thread', leadId] })
        // Every notification comes from the durable feed, with the same ID on SSE and reload.
        // Provider signals may precede persistence; the activity event refreshes again after commit.
        void hydrate()
      }

      source.onerror = () => {
        notificationActions.setConnectionState(false, 'Syncing recent activity')
        source?.close()
        if (mounted) {
          void hydrate()
          retryTimer = window.setTimeout(() => {
            void connect()
          }, retryDelay)
          retryDelay = Math.min(30_000, retryDelay * 2)
        }
      }
    }

    // Refresh persisted notifications every 60s to pick up events from
    // other users / server-side automation that didn't emit SSE to this client.
    const refreshInterval = window.setInterval(() => {
      void hydrate()
    }, 60_000)

    if (authenticated) void connect()
    const resume = () => {
      if (!authenticated || document.visibilityState !== 'visible' || !navigator.onLine) return
      void queryClient.invalidateQueries({ queryKey: ['inbox-thread'] })
      void queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
      void hydrate()
      if (!source || source.readyState === EventSource.CLOSED) {
        window.clearTimeout(retryTimer)
        void connect()
      }
    }
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      mounted = false
      source?.close()
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resume)
      window.clearInterval(refreshInterval)
      window.clearTimeout(hydrationTimer)
      window.clearTimeout(retryTimer)
    }
  }, [authenticated, dashboardScope, queryClient])
}
