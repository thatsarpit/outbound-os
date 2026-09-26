import { api } from '../client'
import type {
  InboxSendResponse,
  Lead,
  LeadEnrichmentResponse,
  LeadInsightsResponse,
  Message,
  PaginatedResponse,
} from '../types'

export interface LeadFilters {
  page?: number
  limit?: number
  status?: string
  tier?: string
  source?: string
  tags?: string
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  sortDir?: 'asc' | 'desc'
  assignedToId?: number
  poolId?: number | null
}

interface LeadListResponse {
  leads: Lead[]
  total: number
  page: number
  pages: number
}

export const leadsApi = {
  /** Distinct lead tags with counts, derived from the data rather than hardcoded. */
  getTags: () => api.get<{ tags: Array<{ tag: string; count: number }> }>('/leads/tags'),

  getLeads: (filters: LeadFilters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, val]) => {
      if (val === undefined || val === null || val === '') return
      if (key === 'sortDir') {
        params.set('sortOrder', String(val))
        return
      }
      params.set(key, String(val))
    })
    return api.get<LeadListResponse>(`/leads?${params}`).then(
      (res) =>
        ({
          // Array.isArray, not `?? []` — a non-array body (error object,
          // changed shape) otherwise reaches callers and throws on .map/.filter.
          data: Array.isArray(res?.leads) ? res.leads : [],
          total: res?.total ?? 0,
          page: res?.page ?? 1,
          pages: res?.pages ?? 1,
        }) satisfies PaginatedResponse<Lead>,
    )
  },

  getLead: (id: number) => api.get<Lead>(`/leads/${id}`),

  getLeadMessages: (id: number) => api.get<Message[]>(`/leads/${id}/messages`),

  getLeadInsights: (id: number) => api.get<LeadInsightsResponse>(`/leads/${id}/insights`),

  getLeadEnriched: (id: number) => api.get<LeadEnrichmentResponse>(`/leads/${id}/enriched`),

  enrichLead: (id: number) => api.post<LeadEnrichmentResponse>(`/leads/${id}/enrich`),

  sendEmail: (
    id: number,
    data: {
      subject?: string
      body?: string
      htmlBody?: string
      accountId?: number | null
      replyToMessageId?: number | null
    },
  ) => api.post<InboxSendResponse>(`/leads/${id}/email/send`, data),

  sendEmailTemplate: (
    id: number,
    data: {
      templateId: number
      accountId?: number | null
      replyToMessageId?: number | null
    },
  ) => api.post<InboxSendResponse>(`/leads/${id}/email/send-template`, data),

  assignEmailAccount: (id: number, assignedEmailAccountId: number | null) =>
    api.post<{ success: boolean; leadId: number; assignedEmailAccountId: number | null }>(
      `/leads/${id}/assign-email-account`,
      { assignedEmailAccountId },
    ),

  updateLead: (id: number, data: Partial<Lead>) => api.patch<Lead>(`/leads/${id}`, data),

  deleteLead: (id: number) => api.delete(`/leads/${id}`),

  bulkAction: (ids: number[], action: string, payload?: Record<string, unknown>) =>
    api.post('/leads/bulk', { ids, action, payload }),

  // Draft a first-contact WhatsApp message from the tier-aware templates and pick
  // the next round-robin sender account (server skips the client-relations
  // number + honors daily caps). Does NOT send — preview, then sendWhatsApp().
  draftAiOutreach: (id: number) => api.post<AiOutreachDraft>(`/leads/${id}/ai-outreach/draft`),

  // Send a WhatsApp message to a lead. accountId forces a specific sender so the
  // message goes from the same account whose persona drafted it.
  sendWhatsApp: (id: number, message: string, accountId?: number) =>
    api.post<SendWhatsAppResult>(`/leads/${id}/send`, { message, accountId }),

  // Draft a first-contact email from the templates using the
  // lead's verified sender account persona. Does NOT send — preview, then
  // sendEmail(). Returns 400 if the lead has no email, 409 if no verified sender.
  draftAiEmail: (id: number) => api.post<AiEmailDraft>(`/leads/${id}/ai-outreach/draft-email`),
}

export interface AiEmailDraft {
  subject: string
  body: string
  htmlBody: string
  accountId: number
  senderName: string
  senderEmail: string
}

export interface AiOutreachDraft {
  message: string
  accountId: number
  accountName: string
  accountPhone: string
}

export interface SendWhatsAppResult {
  success: boolean
  reason?: string
  message?: unknown
}
