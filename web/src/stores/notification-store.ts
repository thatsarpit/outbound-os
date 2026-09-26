import { create } from 'zustand'
import type { ActivityLog, InboxChannel } from '@/api/types'
import { CHANNEL_ORDER } from '@/lib/channels'

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error'
export type NotificationChannel = InboxChannel

export interface DashboardNotification {
  id: string
  title: string
  message: string
  timestamp: string
  severity: NotificationSeverity
  kind: string
  leadId?: number | null
  accountId?: number | null
  channel?: NotificationChannel | null
  threadKey?: string | null
  read: boolean
}

interface NotificationState {
  items: DashboardNotification[]
  isOpen: boolean
  isConnected: boolean
  connectionLabel: string
  lastSyncedAt: string | null
  scopeKey: string
  unreadCount: number
  setScopeKey: (key: string) => void
  setNotifications: (items: DashboardNotification[]) => void
  addNotification: (item: DashboardNotification) => void
  hydrateFromActivity: (items: ActivityLog[]) => void
  markAllRead: () => void
  markOneRead: (id: string) => void
  clear: () => void
  resetSession: () => void
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setConnectionState: (connected: boolean, label?: string) => void
}

const STORAGE_KEY_PREFIX = 'medsales_notifications_last_seen_at'

function getStorageKey(scopeKey: string) {
  return `${STORAGE_KEY_PREFIX}_${scopeKey}`
}

function getLastSeenAt(scopeKey: string) {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(getStorageKey(scopeKey))
  } catch {
    return null
  }
}

function setLastSeenAt(scopeKey: string, timestamp: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (timestamp) {
      localStorage.setItem(getStorageKey(scopeKey), timestamp)
    } else {
      localStorage.removeItem(getStorageKey(scopeKey))
    }
  } catch {
    // Ignore storage failures in private/incognito contexts.
  }
}

function severityFromType(type: string): NotificationSeverity {
  const normalized = type.toLowerCase()
  if (
    normalized.includes('sync_failed') ||
    normalized.includes('failed') ||
    normalized.includes('error') ||
    normalized.includes('bounced')
  )
    return 'error'
  if (
    normalized.includes('manual_reply') ||
    normalized.includes('sent') ||
    normalized.includes('connected') ||
    normalized.includes('completed')
  )
    return 'success'
  if (
    normalized.includes('reply') ||
    normalized.includes('intervention') ||
    normalized.includes('task_due') ||
    normalized.includes('import') ||
    normalized.includes('campaign')
  )
    return 'warning'
  return 'info'
}

function titleFromType(type: string): string {
  const normalized = type.toLowerCase()
  if (normalized === 'email_reply') return 'Email reply received'
  if (normalized === 'email_sent') return 'Email sent'
  if (normalized === 'email_failed') return 'Email failed'
  if (normalized === 'email_sync_failed') return 'Mailbox sync failed'
  if (normalized === 'manual_reply') return 'Reply sent'
  if (normalized.includes('reply')) return 'Reply received'
  if (normalized.includes('failed')) return 'Delivery failed'
  if (normalized.includes('import')) return 'Import update'
  if (normalized.includes('campaign')) return 'Campaign update'
  if (normalized.includes('lead')) return 'Lead event'
  if (normalized.includes('wa')) return 'WhatsApp status'
  return 'Dashboard update'
}

function getNumericMeta(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/**
 * Accepts every channel the product supports, read from the one channel list
 * so a new channel cannot be silently dropped here. Two hand-written copies of
 * this check used to disagree, and both had quietly lost Telegram.
 */
export function normalizeChannel(value: unknown): NotificationChannel | null {
  return CHANNEL_ORDER.includes(value as InboxChannel) ? (value as InboxChannel) : null
}

function deriveChannel(
  type: string,
  message: string,
  data: Record<string, unknown> | null,
): NotificationChannel | null {
  const explicit = normalizeChannel(data?.channel)
  if (explicit) return explicit

  // Fall back to sniffing the event type, then the message text. iMessage and
  // Telegram are checked before the looser 'wa' match, which would otherwise
  // never be reached for them.
  const normalizedType = type.toLowerCase()
  if (normalizedType.includes('imessage')) return 'imessage'
  if (normalizedType.includes('telegram')) return 'telegram'
  if (normalizedType.includes('email')) return 'email'
  if (normalizedType.includes('wa') || normalizedType.includes('whatsapp')) return 'whatsapp'

  const normalizedMessage = message.toLowerCase()
  if (normalizedMessage.includes('imessage')) return 'imessage'
  if (normalizedMessage.includes('telegram')) return 'telegram'
  if (normalizedMessage.includes('email')) return 'email'
  if (normalizedMessage.includes('whatsapp')) return 'whatsapp'

  return null
}

function deriveThreadKey(
  provided: unknown,
  leadId: number | null,
  channel: NotificationChannel | null,
) {
  if (typeof provided === 'string' && provided.trim()) return provided.trim()
  if (leadId && channel) return `${channel}:${leadId}`
  return null
}

function normalizeActivity(item: ActivityLog): DashboardNotification {
  const data =
    item.data && typeof item.data === 'object' ? (item.data as Record<string, unknown>) : null
  const leadId = item.leadId ?? getNumericMeta(data?.leadId)
  const accountId = item.accountId ?? getNumericMeta(data?.accountId)
  const channel = deriveChannel(item.type, item.message, data)
  const threadKey = deriveThreadKey(data?.threadKey, leadId ?? null, channel)

  return {
    id: String(item.id),
    title: titleFromType(item.type),
    message: item.message.replace(/<[^>]*>/g, ''),
    timestamp: item.timestamp || item.createdAt || new Date().toISOString(),
    severity: severityFromType(item.type),
    kind: item.type,
    leadId,
    accountId,
    channel,
    threadKey,
    read: false,
  }
}

function computeUnread(items: DashboardNotification[]) {
  return items.filter((item) => !item.read).length
}

function applyReadState(items: DashboardNotification[], scopeKey: string) {
  const seenAt = getLastSeenAt(scopeKey)
  if (!seenAt) return items
  const seenTime = new Date(seenAt).getTime()
  if (Number.isNaN(seenTime)) return items
  return items.map((item) => ({
    ...item,
    read: item.read || new Date(item.timestamp).getTime() <= seenTime,
  }))
}

export const useNotificationStore = create<NotificationState>((set) => ({
  items: [],
  isOpen: false,
  isConnected: false,
  connectionLabel: 'Offline',
  lastSyncedAt: null,
  scopeKey: 'global',
  unreadCount: 0,

  setScopeKey: (key) =>
    set((state) => {
      const nextKey = key || 'global'
      const items = applyReadState(state.items, nextKey)
      return {
        scopeKey: nextKey,
        items,
        unreadCount: computeUnread(items),
        lastSyncedAt: items[0]?.timestamp ?? state.lastSyncedAt,
      }
    }),

  setNotifications: (items) =>
    set((state) => {
      const readItems = applyReadState(items, state.scopeKey)
      return {
        items: readItems,
        unreadCount: computeUnread(readItems),
        lastSyncedAt: readItems[0]?.timestamp ?? null,
      }
    }),

  addNotification: (item) =>
    set((state) => {
      const existing = state.items.find((entry) => entry.id === item.id)
      const items = existing
        ? state.items.map((entry) =>
            entry.id === item.id ? { ...entry, ...item, read: entry.read } : entry,
          )
        : [item, ...state.items].slice(0, 12)

      return {
        items,
        unreadCount: computeUnread(items),
        lastSyncedAt: items[0]?.timestamp ?? state.lastSyncedAt,
      }
    }),

  hydrateFromActivity: (items) =>
    set((state) => {
      const seenIds = new Set(state.items.map((item) => item.id))
      const normalized = items.map(normalizeActivity)
      const merged = [...state.items, ...normalized.filter((item) => !seenIds.has(item.id))]
        .slice(0, 12)
        .map((item) => ({
          ...item,
          read: seenIds.has(item.id)
            ? (state.items.find((entry) => entry.id === item.id)?.read ?? false)
            : item.read,
        }))

      const withReadState = applyReadState(merged, state.scopeKey)
      return {
        items: withReadState,
        unreadCount: computeUnread(withReadState),
        lastSyncedAt: withReadState[0]?.timestamp ?? state.lastSyncedAt,
      }
    }),

  markAllRead: () =>
    set((state) => {
      const lastSeenAt = state.items[0]?.timestamp ?? null
      setLastSeenAt(state.scopeKey, lastSeenAt)

      return {
        items: state.items.map((item) => ({ ...item, read: true })),
        unreadCount: 0,
        lastSyncedAt: lastSeenAt,
      }
    }),

  markOneRead: (id) =>
    set((state) => {
      const items = state.items.map((item) => (item.id === id ? { ...item, read: true } : item))
      return { items, unreadCount: computeUnread(items) }
    }),

  clear: () => {
    set((state) => {
      setLastSeenAt(state.scopeKey, null)
      return { items: [], unreadCount: 0, lastSyncedAt: null }
    })
  },

  resetSession: () =>
    set({
      items: [],
      unreadCount: 0,
      lastSyncedAt: null,
      isOpen: false,
      isConnected: false,
      connectionLabel: 'Offline',
    }),

  setOpen: (open) =>
    set({
      isOpen: open,
    }),

  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

  setConnectionState: (connected, label) =>
    set({
      isConnected: connected,
      connectionLabel: label || (connected ? 'Live updates' : 'Offline'),
    }),
}))

export const notificationActions = {
  hydrateFromActivity: (items: ActivityLog[]) =>
    useNotificationStore.getState().hydrateFromActivity(items),
  addNotification: (item: DashboardNotification) =>
    useNotificationStore.getState().addNotification(item),
  markAllRead: () => useNotificationStore.getState().markAllRead(),
  markOneRead: (id: string) => useNotificationStore.getState().markOneRead(id),
  clear: () => useNotificationStore.getState().clear(),
  resetSession: () => useNotificationStore.getState().resetSession(),
  setScopeKey: (key: string) => useNotificationStore.getState().setScopeKey(key),
  setOpen: (open: boolean) => useNotificationStore.getState().setOpen(open),
  toggleOpen: () => useNotificationStore.getState().toggleOpen(),
  setConnectionState: (connected: boolean, label?: string) =>
    useNotificationStore.getState().setConnectionState(connected, label),
}
