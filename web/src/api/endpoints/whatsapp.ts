import { api } from '../client'
import type { WhatsAppAccount } from '../types'

function getClientTimezoneOffset() {
  return typeof window === 'undefined' ? 0 : new Date().getTimezoneOffset()
}

export interface WhatsAppAccountCreatePayload {
  name: string
  waAccountType?: 'cloud_api'
  personaName?: string
  personaGender?: string
  personaTitle?: string
  companyName?: string
  companyCity?: string
  companyIndustry?: string
  companyCerts?: string
  companyUSP?: string
  hourlyLimit?: number
  dailyLimit?: number
  maxFollowups?: number
  followupDelays?: string
}

export type WhatsAppAccountUpdatePayload = Partial<WhatsAppAccountCreatePayload>

export const whatsappApi = {
  list: () =>
    api.get<WhatsAppAccount[]>(`/whatsapp/accounts?tzOffset=${getClientTimezoneOffset()}`),

  get: (id: number) => api.get<WhatsAppAccount>(`/whatsapp/accounts/${id}`),

  create: (data: WhatsAppAccountCreatePayload) =>
    api.post<WhatsAppAccount>('/whatsapp/accounts', data),

  update: (id: number, data: WhatsAppAccountUpdatePayload) =>
    api.put<WhatsAppAccount>(`/whatsapp/accounts/${id}`, data),

  remove: (id: number) => api.delete(`/whatsapp/accounts/${id}`),

  enable: (id: number) => api.post(`/whatsapp/accounts/${id}/enable`),

  disable: (id: number) => api.post(`/whatsapp/accounts/${id}/disable`),

  updateCloudCredentials: (
    id: number,
    data: {
      provider?: 'meta' | 'aisensy'
      metaPhoneNumberId?: string
      metaAccessToken?: string
      metaWabaId?: string
      templateLanguage?: string
      aisensyProjectId?: string
      aisensyApiKey?: string
      aisensyCampaignApiKey?: string
      defaultCampaignName?: string
    },
  ) => api.patch(`/whatsapp/accounts/${id}/cloud-credentials`, data),

  getProfile: (id: number) => api.get(`/whatsapp/accounts/${id}/profile`),

  resetCounters: () => api.post('/whatsapp/reset-counters'),

  getStatus: () => api.get<{ connected: boolean; accounts: unknown[] }>('/whatsapp/status'),
}
