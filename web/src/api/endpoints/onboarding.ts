import { queryOptions } from '@tanstack/react-query'
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
  webhookOrigin?: string
}

export const onboardingApi = {
  status: () => api.get<OnboardingStatus>('/onboarding/status'),
  dismiss: (dismissed = true) => api.post('/onboarding/dismiss', { dismissed }),
  getProfile: () => api.get<WorkspaceProfile>('/workspace/profile'),
  saveProfile: (values: WorkspaceProfile) => api.put<WorkspaceProfile>('/workspace/profile', values),
  createSource: (presetId: string, name?: string) =>
    api.post<CreatedLeadSource>('/webhooks/sources/from-preset', { presetId, name }),
  testSource: async (source: CreatedLeadSource, payload: Record<string, unknown>) => {
    const response = await fetch(`/api/webhooks/inbound/${encodeURIComponent(source.source)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': source.apiKey },
      body: JSON.stringify({ ...payload, test: true }),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || result?.test !== true || result?.created !== false) {
      throw new Error(result?.error || 'The source did not confirm a mapping test. Check its key and configuration.')
    }
    return result.mapped as Record<string, unknown>
  },
}

export const onboardingStatusQuery = queryOptions({
  queryKey: ['onboarding-status'],
  queryFn: async () => {
    const status = await onboardingApi.status()
    if (!status?.steps || !status.channels || !status.counts) {
      throw new Error('Setup status is unavailable. Check that the dashboard and API versions match.')
    }
    return status
  },
  meta: { silent: true },
})
