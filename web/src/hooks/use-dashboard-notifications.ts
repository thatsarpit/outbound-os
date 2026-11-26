import { workspaceApiPath } from '@/lib/workspace-path'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore, getSessionToken, usePrivateSalesAgent } from '@/stores/auth-store'
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

async function readDashboardEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (payload: StreamPayload) => void,
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      // Proxies can split events across chunks or combine several in one.
      const frames = pending.split(/\r?\n\r?\n/)
      pending = frames.pop() ?? ''
      for (const frame of frames) {
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n')
        const payload = normalizeStreamPayload(data)
        if (payload?.type) onEvent(payload)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export function useDashboardNotifications() {
  const { user, dashboardScope } = useAuthStore()
  const queryClient = useQueryClient()
  const authenticated = Boolean(user)
  const privateSales = usePrivateSalesAgent()

  useEffect(() => {
    let mounted = true
    const scopeKey = dashboardScope
    notificationActions.resetSession()
    notificationActions.setScopeKey(scopeKey)
    if (!authenticated || privateSales) return
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

    let connection: AbortController | null = null
    let retryTimer: number | undefined
    let retryDelay = 2000

    async function connect() {
      if (!mounted || connection) return
      connection = new AbortController()
      const { signal } = connection
      try {
        const token = await getSessionToken()
        if (signal.aborted) return
        if (!token) throw new Error('Dashboard session unavailable')

        void hydrate()
        notificationActions.setConnectionState(false, 'Connecting…')
        const response = await fetch(workspaceApiPath('/events'), {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal,
        })
        if (!response.ok || !response.body || !response.headers.get('content-type')?.startsWith('text/event-stream')) {
          throw new Error('Dashboard stream unavailable')
        }

        retryDelay = 2000
        notificationActions.setConnectionState(true, 'Live updates')
        await readDashboardEvents(response.body, (payload) => {
          if (signal.aborted || payload.type === 'connected') return
          const leadId = payload.data?.leadId
          void queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
          if (Number.isSafeInteger(leadId)) {
            void queryClient.invalidateQueries({ queryKey: ['inbox-thread', leadId] })
          }
          // Provider signals may precede persistence. The activity event
          // refreshes the durable notifications again after commit.
          void hydrate()
        })
      } catch {
        if (mounted) void hydrate()
      } finally {
        connection?.abort()
        connection = null
        if (mounted) {
          notificationActions.setConnectionState(false, 'Syncing recent activity')
          retryTimer = window.setTimeout(() => void connect(), retryDelay)
          retryDelay = Math.min(30_000, retryDelay * 2)
        }
      }
    }

    // Refresh persisted notifications every 60s to pick up events from
    // other users / server-side automation that didn't emit SSE to this client.
    const refreshInterval = window.setInterval(() => {
      void hydrate()
    }, 60_000)

    void connect()
    const resume = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      void queryClient.invalidateQueries({ queryKey: ['inbox-thread'] })
      void queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
      void hydrate()
      if (!connection) {
        window.clearTimeout(retryTimer)
        void connect()
      }
    }
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      mounted = false
      connection?.abort()
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resume)
      window.clearInterval(refreshInterval)
      window.clearTimeout(hydrationTimer)
      window.clearTimeout(retryTimer)
    }
  }, [authenticated, dashboardScope, privateSales, queryClient])
}
