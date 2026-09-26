import { api } from '../client'
import type { Lead } from '../types'

export const EMAIL_TEMPLATE_LIST_QUERY_KEY = ['email-templates'] as const

export interface EmailTemplate {
  id: number
  name: string
  subject: string
  htmlBody: string
  textBody: string
  category: string | null
  variables: string
  createdAt: string
  updatedAt: string
}

export interface EmailTemplatePreviewContext {
  leadId?: number
  lead?: Pick<
    Lead,
    'id' | 'name' | 'company' | 'email' | 'mobile' | 'country' | 'product' | 'quantity' | 'brand'
  >
  context?: Record<string, unknown>
}

export interface EmailTemplateRenderResponse {
  subject: string
  htmlBody: string
  textBody: string
}

export interface EmailTemplateCreatePayload {
  name: string
  subject: string
  htmlBody: string
  textBody?: string
  category?: string | null
  variables?: string[]
}

export interface EmailTemplateUpdatePayload {
  name?: string
  subject?: string
  htmlBody?: string
  textBody?: string
  category?: string | null
  variables?: string[]
}

export const templatesApi = {
  list: () => api.get<EmailTemplate[]>('/email/templates'),

  get: (id: number) => api.get<EmailTemplate>(`/email/templates/${id}`),

  create: (data: EmailTemplateCreatePayload) => api.post<EmailTemplate>('/email/templates', data),

  update: (id: number, data: EmailTemplateUpdatePayload) =>
    api.patch<EmailTemplate>(`/email/templates/${id}`, data),

  remove: (id: number) => api.delete(`/email/templates/${id}`),

  render: (id: number, payload: EmailTemplatePreviewContext = {}) =>
    api.post<EmailTemplateRenderResponse>(`/email/templates/${id}/render`, payload),
}
