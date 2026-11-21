import { api } from '../client'
import type {
  InboxChannel,
  InboxChannelHealth,
  InboxSenderAccount,
  InboxSendPayload,
  InboxSendResponse,
  InboxThreadDetail,
  InboxThreadListResponse,
  InboxThreadState,
  MediaFile,
} from '../types'

export interface InboxThreadFilters {
  channel?: InboxChannel
  state?: Exclude<InboxThreadState, 'all'>
  search?: string
  assignedToMe?: boolean
  assigned?: boolean
  poolId?: number | null
  page?: number
  limit?: number
}

export type DeliveryReviewFilter =
  'attention' | 'failed' | 'unconfirmed' | 'queued' | 'overdue' | 'sending'

export interface DeliveryReviewItem {
  id: number
  leadId: number
  leadName: string
  campaignId: number | null
  emailAccountId?: number | null
  channel: InboxChannel
  status: 'failed' | 'permanently_failed' | 'bounced' | 'unconfirmed' | 'queued' | 'sending'
  detail: string
  providerCode: string | null
  updatedAt: string
  scheduledAt: string | null
  overdue?: boolean
}

export interface QueueWorkerStatus {
  worker: 'whatsapp' | 'email' | 'imessage' | 'campaigns'
  intervalMinutes: number
  lastScanAt: string | null
  state: 'recent' | 'stale' | 'not_recorded'
}

export interface ReceiptActivity {
  source: 'whatsapp' | 'brevo'
  lastReceivedAt: string | null
  unmatched: number
}

export interface DeliveryReviewResponse {
  items: DeliveryReviewItem[]
  counts: Record<Exclude<DeliveryReviewFilter, 'overdue'>, number> & { overdue?: number }
  workers?: QueueWorkerStatus[] | null
  receiptActivity?: ReceiptActivity[] | null
  overdueGraceMinutes?: number
  total: number
  page: number
  pages: number
}

export const inboxApi = {
  deliveryReview: async (
    status: DeliveryReviewFilter,
    channel: InboxChannel | '',
    page: number,
  ) => {
    const params = new URLSearchParams({ status, page: String(page) })
    if (channel) params.set('channel', channel)
    const result = await api.get<DeliveryReviewResponse>(`/messages/review?${params}`)
    if (!Array.isArray(result?.items) || !result.counts) {
      throw new Error(
        'Delivery review is unavailable. Check that the dashboard and API versions match.',
      )
    }
    return result
  },

  react: (leadId: number, messageId: number, emoji: string) =>
    api.post<{ success: boolean }>(`/inbox/threads/${leadId}/messages/${messageId}/reaction`, {
      emoji,
    }),
  channelHealth: () => api.get<InboxChannelHealth>('/inbox/channel-health'),

  listThreads: (filters: InboxThreadFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.channel) params.set('channel', filters.channel)
    if (filters.state) params.set('state', filters.state)
    if (filters.search) params.set('search', filters.search)
    if (filters.assignedToMe) params.set('assignedToMe', 'true')
    if (filters.assigned !== undefined) params.set('assigned', String(filters.assigned))
    if (filters.poolId) params.set('poolId', String(filters.poolId))
    if (filters.page) params.set('page', String(filters.page))
    if (filters.limit) params.set('limit', String(filters.limit))
    const query = params.toString()
    return api.get<InboxThreadListResponse>(`/inbox/threads${query ? `?${query}` : ''}`)
  },

  getThread: (leadId: number) =>
    api.get<InboxThreadDetail>(`/inbox/threads/${encodeURIComponent(String(leadId))}`),

  cancelScheduledEmail: (leadId: number, id: number) =>
    api.delete(`/inbox/threads/${leadId}/scheduled-emails/${id}`),

  rescheduleEmail: (leadId: number, id: number, scheduledAt: string) =>
    api.patch(`/inbox/threads/${leadId}/scheduled-emails/${id}`, { scheduledAt }),

  markRead: (leadId: number, messageId: number) =>
    api.post<{ success: boolean; lastReadMessageId: number }>(`/inbox/threads/${leadId}/read`, {
      messageId,
    }),

  listSenderAccounts: (leadId?: number) =>
    api.get<InboxSenderAccount[]>(
      `/inbox/senders${leadId ? `?leadId=${encodeURIComponent(String(leadId))}` : ''}`,
    ),

  send: async (payload: InboxSendPayload) => {
    const result = await api.post<InboxSendResponse>('/inbox/send', payload)
    if (!result?.success)
      throw new Error(
        result?.error ||
          result?.reason ||
          'The provider did not accept this message. Your draft is still here.',
      )
    return result
  },

  // Legacy bridge for the current WhatsApp-only UI while Inbox is being refactored.
  replyWhatsApp: (leadId: number, text: string) =>
    api.post<InboxSendResponse>('/inbox/reply', { leadId, text }),

  resolveThread: (leadId: number) =>
    api.post<{ id: number; status: string; threadState: string }>(
      `/inbox/threads/${leadId}/resolve`,
    ),

  reopenThread: (leadId: number) =>
    api.post<{ id: number; status: string; threadState: string }>(
      `/inbox/threads/${leadId}/reopen`,
    ),

  assignSelf: (leadId: number) =>
    api.post<{ id: number; assignedToId: number | null; threadState: string }>(
      `/inbox/threads/${leadId}/assign-self`,
    ),

  uploadMedia: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.upload<MediaFile>('/media/upload', formData)
  },

  deleteMedia: (id: number) => api.delete<void>(`/media/${id}`),
}
