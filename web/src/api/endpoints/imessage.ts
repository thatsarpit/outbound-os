import { api } from '../client'

/**
 * iMessage account on a BlueBubbles-backed Mac. The backend keeps the
 * BlueBubbles server password AES-256-GCM encrypted in the DB and never
 * returns it — passwords flow one-way (write-only) over /api/imessage/accounts.
 */
export interface IMessageAccount {
  id: number
  name: string
  serverUrl: string
  appleId: string
  enabled: boolean
  status: string // 'online' | 'offline' | 'unknown'
  lastPingAt: string | null
  hourlyLimit: number
  dailyLimit: number
  sentToday: number
  lastResetAt: string
  createdAt: string
  updatedAt: string
}

export interface IMessageAccountCreatePayload {
  name: string
  serverUrl: string
  password: string
  appleId?: string
  hourlyLimit?: number
  dailyLimit?: number
  enabled?: boolean
}

export interface IMessageAccountUpdatePayload {
  name?: string
  serverUrl?: string
  /** Send only when rotating the password — empty/undefined keeps current. */
  password?: string
  appleId?: string
  hourlyLimit?: number
  dailyLimit?: number
  enabled?: boolean
}

export const imessageAccountsApi = {
  list: () => api.get<IMessageAccount[]>('/imessage/accounts'),

  create: (data: IMessageAccountCreatePayload) =>
    api.post<IMessageAccount>('/imessage/accounts', data),

  update: (id: number, data: IMessageAccountUpdatePayload) =>
    api.put<IMessageAccount>(`/imessage/accounts/${id}`, data),

  remove: (id: number) => api.delete(`/imessage/accounts/${id}`),

  /** Test connectivity to BlueBubbles. Updates status + lastPingAt server-side. */
  ping: (id: number) =>
    api.post<{ online: boolean; accountId: number }>(`/imessage/accounts/${id}/ping`),
}
