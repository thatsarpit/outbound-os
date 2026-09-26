import { useEffect } from 'react'
import { overviewApi } from '@/api/endpoints/overview'
import { api } from '@/api/client'
import { useAuthStore, getSessionToken } from '@/stores/auth-store'
import type { ActivityLog } from '@/api/types'
import { getChannel } from '@/lib/channels'
import {
  notificationActions,
  normalizeChannel,
  type NotificationSeverity,
  type NotificationChannel,
} from '@/stores/notification-store'

type StreamPayload = {
  type?: string
  data?: Record<string, unknown>
  ts?: number
}

type StreamNotification = {
  title: string
  message: string
  severity: NotificationSeverity
}

function getNumericMeta(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function deriveThreadKey(
  leadId: number | null,
  channel: NotificationChannel | null,
  data: Record<string, unknown>,
) {
  if (typeof data.threadKey === 'string' && data.threadKey.trim()) return data.threadKey.trim()
  if (leadId && channel) return `${channel}:${leadId}`
  return null
}

function buildMessage(type: string, data: Record<string, unknown> = {}): StreamNotification {
  const errorMessage =
    typeof data.error === 'string' && data.error.trim()
      ? data.error.trim().replace(/_/g, ' ')
      : null
  const subject =
    typeof data.subject === 'string' && data.subject.trim() ? data.subject.trim() : null
  const channel = normalizeChannel(data.channel)

  if (type === 'system') {
    return { title: 'System update', message: 'Dashboard system state changed.', severity: 'info' }
  }

  if (type === 'task_due') {
    return {
      title: 'Task due soon',
      message: String(data.message || 'A follow-up task is approaching its due time.'),
      severity: 'warning',
    }
  }

  if (type === 'intervention') {
    return {
      title: 'Intervention needed',
      message: String(data.message || 'A lead needs attention from the team.'),
      severity: 'warning',
    }
  }

  if (type === 'manual_reply') {
    const channelName = channel && channel !== 'email' ? getChannel(channel).label : null
    return {
      title: channelName ? `${channelName} reply sent` : 'Reply sent',
      message: channelName
        ? `A ${channelName} reply was sent from the dashboard.`
        : 'A manual reply was recorded for a lead.',
      severity: 'success',
    }
  }

  if (type === 'email_sent') {
    return {
      title: 'Email sent',
      message: subject
        ? `Sent "${subject}" from the dashboard.`
        : 'An email was sent from the dashboard.',
      severity: 'success',
    }
  }

  if (type === 'email_failed') {
    return {
      title: 'Email failed',
      message:
        errorMessage || 'The email could not be sent. Open the thread to retry or switch sender.',
      severity: 'error',
    }
  }

  if (type === 'email_reply') {
    return {
      title: 'Email reply received',
      message: subject
        ? `A lead replied by email about "${subject}".`
        : 'A lead replied by email and needs attention.',
      severity: 'warning',
    }
  }

  if (type === 'email_sync_failed') {
    return {
      title: 'Mailbox sync failed',
      message: errorMessage || 'A sender inbox could not be synced. Check the mailbox connection.',
      severity: 'error',
    }
  }

  if (type === 'reply_received') {
    return {
      title:
        channel === 'email'
          ? 'Email reply received'
          : channel
            ? `${getChannel(channel).label} reply received`
            : 'Reply received',
      message: String(data.message || 'A lead replied and may need a follow-up.'),
      severity: 'warning',
    }
  }

  return {
    title: 'Live update',
    message: String(data.message || 'The dashboard received a live event.'),
    severity: 'info',
  }
}

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
  const { user } = useAuthStore()

  useEffect(() => {
    let mounted = true
    const scopeKey = user?.id ? `user-${user.id}` : 'global'
    notificationActions.resetSession()
    notificationActions.setScopeKey(scopeKey)

    async function hydrate() {
      try {
        // Prefer the persisted notifications endpoint (survives server restarts).
        // Fall back to the in-memory activity log when the DB endpoint is unavailable.
        let items: ActivityLog[] | null = null
        try {
          const persisted = await api.get<ActivityLog[]>('/notifications?limit=50')
          if (Array.isArray(persisted)) items = persisted
        } catch {
          // DB endpoint unavailable — try in-memory fallback
        }
        if (items === null) {
          const inMemory = await overviewApi.getActivity(20)
          if (Array.isArray(inMemory)) items = inMemory
        }
        if (!mounted || items === null) return
        notificationActions.hydrateFromActivity(items)
      } catch {
        if (mounted) {
          notificationActions.setConnectionState(false, 'Sync unavailable')
        }
      }
    }

    // EventSource can't carry an Authorization header, so the token still has
    // to go in the query string — but a Clerk session token is short-lived
    // (~60s) and fetched fresh per use, unlike the old static JWT, so getting
    // it is now async and has to happen before the connection opens rather
    // than as a synchronous read.
    let source: EventSource | null = null
    let refreshInterval: number | null = null

    async function connect() {
      const token = await getSessionToken()
      if (!mounted) return
      if (!token) {
        notificationActions.setConnectionState(false, 'Offline')
        return
      }

      hydrate()

      source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
      notificationActions.setConnectionState(false, 'Connecting...')

      source.onopen = () => {
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
        const leadId = getNumericMeta(data.leadId)
        const accountId = getNumericMeta(data.accountId)
        const channel = normalizeChannel(data.channel)
        const threadKey = deriveThreadKey(leadId, channel, data)
        const { title, message, severity } = buildMessage(payload.type, data)
        notificationActions.addNotification({
          id: `${payload.type}-${payload.ts || Date.now()}`,
          title,
          message,
          timestamp: new Date(payload.ts || Date.now()).toISOString(),
          severity,
          kind: payload.type,
          leadId,
          accountId,
          channel,
          threadKey,
          read: false,
        })
      }

      source.onerror = () => {
        notificationActions.setConnectionState(false, 'Syncing recent activity')
        source?.close()
        if (mounted) {
          void hydrate()
        }
      }

      // Refresh persisted notifications every 60s to pick up events from
      // other users / server-side automation that didn't emit SSE to this client.
      refreshInterval = window.setInterval(() => {
        void hydrate()
      }, 60_000)
    }

    void connect()

    return () => {
      mounted = false
      source?.close()
      if (refreshInterval !== null) window.clearInterval(refreshInterval)
    }
  }, [user?.id])
}
