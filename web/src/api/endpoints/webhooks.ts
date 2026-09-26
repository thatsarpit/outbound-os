import { api } from '../client'
import type { WebhookSource, WebhookSubscription } from '../types'

export interface WebhookSubscriptionPayload {
  name: string
  url: string
  events: string[] | string
  secret?: string
  enabled?: boolean
}

export interface WebhookSourcePayload {
  name: string
  slug?: string
  source?: string
  apiKey?: string
  fieldMap?: string | Record<string, string>
  enabled?: boolean
}

export interface WebhookPreset {
  key: string
  name: string
  description?: string
  fieldMap?: Record<string, string>
}

export const webhooksApi = {
  // Outbound subscriptions
  listSubscriptions: () => api.get<WebhookSubscription[]>('/webhooks/subscriptions'),

  createSubscription: (data: WebhookSubscriptionPayload) =>
    api.post<WebhookSubscription>('/webhooks/subscriptions', data),

  updateSubscription: (id: number, data: Partial<WebhookSubscriptionPayload>) =>
    api.patch<WebhookSubscription>(`/webhooks/subscriptions/${id}`, data),

  deleteSubscription: (id: number) =>
    api.delete<{ success: boolean }>(`/webhooks/subscriptions/${id}`),

  testSubscription: (id: number) =>
    api.post<{ success: boolean; status?: number; response?: unknown }>(
      `/webhooks/subscriptions/${id}/test`,
    ),

  // Inbound sources
  listSources: () => api.get<WebhookSource[]>('/webhooks/sources'),

  createSource: (data: WebhookSourcePayload) => api.post<WebhookSource>('/webhooks/sources', data),

  createSourceFromPreset: (presetKey: string, overrides?: Partial<WebhookSourcePayload>) =>
    api.post<WebhookSource>('/webhooks/sources/from-preset', { presetKey, ...overrides }),

  updateSource: (id: number, data: Partial<WebhookSourcePayload>) =>
    api.patch<WebhookSource>(`/webhooks/sources/${id}`, data),

  deleteSource: (id: number) => api.delete<{ success: boolean }>(`/webhooks/sources/${id}`),

  listPresets: () => api.get<WebhookPreset[]>('/webhooks/sources/presets'),
}
