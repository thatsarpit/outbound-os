import { api } from '../client'

export type WorkspaceProfile = Record<string, string>

export interface OnboardingStatus {
  dismissed: boolean
  complete: boolean
  steps: { profile: boolean; channel: boolean; leadSource: boolean; team: boolean }
  channels: { whatsapp: boolean; email: boolean; telegram: boolean; imessage: boolean }
  counts: { leadSources: number; leads: number; users: number; outgoingWebhooks: number }
  integrations: { googleSheets: boolean; outgoingWebhooks: boolean; mcp: boolean }
  profile: { BUSINESS_NAME: string; BUSINESS_TIMEZONE: string }
}

export interface CreatedLeadSource {
  id: number
  name: string
  source: string
  apiKey: string
  webhookUrl: string
}

export const onboardingApi = {
  status: () => api.get<OnboardingStatus>('/onboarding/status'),
  dismiss: (dismissed = true) => api.post('/onboarding/dismiss', { dismissed }),
  getProfile: () => api.get<WorkspaceProfile>('/workspace/profile'),
  saveProfile: (values: WorkspaceProfile) => api.put<WorkspaceProfile>('/workspace/profile', values),
  createSource: (presetId: string, name?: string) =>
    api.post<CreatedLeadSource>('/webhooks/sources/from-preset', { presetId, name }),
}
