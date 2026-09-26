import { api } from '../client'
import type { Campaign, CampaignLead, Lead } from '../types'

export interface CampaignListResponse {
  campaigns: Campaign[]
  total: number
  page: number
  pages: number
}

export interface CampaignMutationPayload {
  name: string
  description?: string | null
  messageTemplate: string
  targetFilter?: string | Record<string, unknown> | null
  channel?: Campaign['channel']
  emailSubject?: string | null
  senderAccountId?: number | null
  emailTemplateId?: number | null
  variantBTemplate?: string | null
  variantBSubject?: string | null
}

export interface CampaignPreviewLeadsPayload {
  filter?: Record<string, unknown>
}

export interface CampaignPreviewLeadsResponse {
  count: number
  sample: Lead[]
}

export interface CampaignLeadsResponse {
  leads: Array<
    CampaignLead & {
      lead: Pick<Lead, 'name' | 'mobile' | 'status' | 'score'>
    }
  >
  total: number
  page: number
  pages: number
}

export const campaignsApi = {
  list: (filters: { page?: number; limit?: number; status?: string; search?: string } = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      params.set(key, String(value))
    })
    const query = params.toString()
    return api.get<CampaignListResponse>(`/campaigns${query ? `?${query}` : ''}`)
  },

  get: (id: number) => api.get<Campaign>(`/campaigns/${id}`),

  create: (data: CampaignMutationPayload) => api.post<Campaign>('/campaigns', data),

  update: (id: number, data: Partial<CampaignMutationPayload>) =>
    api.patch<Campaign>(`/campaigns/${id}`, data),

  remove: (id: number) => api.delete<{ success: boolean; deleted: number }>(`/campaigns/${id}`),

  populate: (id: number) => api.post(`/campaigns/${id}/populate`),

  start: (id: number) => api.post(`/campaigns/${id}/start`),

  pause: (id: number) => api.post(`/campaigns/${id}/pause`),

  previewLeads: (filter: Record<string, unknown> = {}) =>
    api.post<CampaignPreviewLeadsResponse>('/campaigns/preview-leads', { filter }),

  testSend: (id: number, testEmail?: string) =>
    api.post<{ success: boolean; sentTo: string; subject: string; messageId?: string }>(
      `/campaigns/${id}/test-send`,
      testEmail ? { testEmail } : {},
    ),

  getLeads: (id: number, filters: { page?: number; limit?: number; status?: string } = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      params.set(key, String(value))
    })
    const query = params.toString()
    return api.get<CampaignLeadsResponse>(`/campaigns/${id}/leads${query ? `?${query}` : ''}`)
  },
}
