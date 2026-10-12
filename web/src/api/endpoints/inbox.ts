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
  poolId?: number | null
  page?: number
  limit?: number
}

export const inboxApi = {
  channelHealth: () => api.get<InboxChannelHealth>('/inbox/channel-health'),

  listThreads: (filters: InboxThreadFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.channel) params.set('channel', filters.channel)
    if (filters.state) params.set('state', filters.state)
    if (filters.search) params.set('search', filters.search)
    if (filters.poolId) params.set('poolId', String(filters.poolId))
    if (filters.page) params.set('page', String(filters.page))
    if (filters.limit) params.set('limit', String(filters.limit))
    const query = params.toString()
    return api.get<InboxThreadListResponse>(`/inbox/threads${query ? `?${query}` : ''}`)
  },

  getThread: (leadId: number) =>
    api.get<InboxThreadDetail>(`/inbox/threads/${encodeURIComponent(String(leadId))}`),

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
    api.post<{ id: number; assignedToId: number; threadState: string }>(
      `/inbox/threads/${leadId}/assign-self`,
    ),

  uploadMedia: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.upload<MediaFile>('/media/upload', formData)
  },

  deleteMedia: (id: number) => api.delete<void>(`/media/${id}`),
}
