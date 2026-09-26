import { api } from '../client'
import type { EmailAccount, SenderOption } from '../types'

export interface EmailAccountUpdatePayload {
  name?: string
  senderName?: string
  signature?: string
  dailyLimit?: number
  hourlyLimit?: number
  enabled?: boolean
  whatsappAccountId?: number | null
}

export interface EmailAccountCreatePayload {
  name?: string
  email: string
  provider?: string
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  smtpUser?: string
  smtpPass: string
  imapHost?: string
  imapPort?: number
  imapSecure?: boolean
  imapUser?: string
  imapPass?: string
  senderName?: string
  signature?: string
  whatsappAccountId?: number | null
}

interface EmailAccountMutationResponse {
  success: boolean
  account: EmailAccount
}

export const emailAccountsApi = {
  list: () => api.get<EmailAccount[]>('/email/accounts'),

  get: (id: number) => api.get<EmailAccount>(`/email/accounts/${id}`),

  create: (data: EmailAccountCreatePayload) =>
    api.post<EmailAccountMutationResponse>('/email/accounts', data),

  update: (id: number, data: EmailAccountUpdatePayload) =>
    api.patch<EmailAccountMutationResponse>(`/email/accounts/${id}`, data),

  remove: (id: number) => api.delete(`/email/accounts/${id}`),

  test: (id: number) => api.post<{ ok: boolean; message?: string }>(`/email/accounts/${id}/test`),
}

export const emailSendersApi = {
  list: (leadId?: number) =>
    api.get<SenderOption[]>(
      `/email/senders${leadId ? `?leadId=${encodeURIComponent(String(leadId))}` : ''}`,
    ),
}

export interface DailyEmailStatus {
  enabled: boolean
  batchSize: number
  senderIds: number[]
  perSenderQuota: number
  deliveryMode?: string
  marketing?: {
    enabled: boolean
    globallyPaused: boolean
    configuredBrevoSenders: boolean
    folderId: number | null
    folderConfigured: boolean
    webhookConfigured: boolean
    webhookUrl: string | null
    consentedCount: number
    ready: boolean
    error?: string
  }
  lastRunDate: string | null
  lastRunAt: string | null
  lastQueued: number
  eligibleCount: number
  consentedCount: number
  blockedNoConsentCount: number
  schedule: string
  accounts: Array<{
    id: number
    email: string
    provider: string
    status: string
    lastError: string | null
    dailyLimit: number
    sentToday: number
  }>
}

export interface DailyEmailPreview {
  dryRun: boolean
  count: number
  items: Array<{
    leadId: number
    email: string
    accountId: number
    sender: string
    scheduledAt: string
  }>
}

export const dailyEmailApi = {
  status: () => api.get<DailyEmailStatus>('/email/daily/status'),
  update: (data: {
    enabled?: boolean
    marketingEnabled?: boolean
    batchSize?: number
    brevoFolderId?: number | null
  }) => api.patch<DailyEmailStatus>('/email/daily/settings', data),
  preview: (limit?: number) => api.post<DailyEmailPreview>('/email/daily/preview', { limit }),
  queue: () =>
    api.post<{ queued?: number; skipped?: boolean; reason?: string }>('/email/daily/queue'),
}
