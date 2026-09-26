import { api } from '../client'

export interface WorkspaceConfig {
  [key: string]: string | number | boolean | undefined
  waMaxMessages?: number
  waWarmupMode?: boolean
  WA_MIN_DELAY?: number
  WA_MAX_DELAY?: number
}

export interface BrandConfig {
  brandName: string
  tagline: string
  businessName: string
  businessCity: string
  businessCountry: string
  businessIndustry: string
  businessCertifications: string
  personaName: string
  personaGender: string
  personaTitle: string
  timezone: string
}

export interface SheetsWebhookConfig {
  url: string | null
  enabled: boolean
  lastSyncAt?: string | null
  totalSynced?: number
}

export const settingsApi = {
  getConfig: () => api.get<WorkspaceConfig>('/config'),

  updateConfig: (data: Record<string, string | number | boolean>) =>
    api.patch<WorkspaceConfig>('/config', data),

  getBrand: () => api.get<BrandConfig>('/config/brand'),

  updateEnv: (data: Record<string, string>) => api.post('/config/env', data),

  // Google Sheets sync
  getSheetsWebhook: () => api.get<SheetsWebhookConfig>('/settings/sheets-webhook'),

  setSheetsWebhook: (data: { url: string; enabled?: boolean }) =>
    api.post<SheetsWebhookConfig>('/settings/sheets-webhook', data),

  testSheetsWebhook: () =>
    api.post<{ success: boolean; message?: string }>('/settings/sheets-webhook/test'),

  deleteSheetsWebhook: () => api.delete<{ success: boolean }>('/settings/sheets-webhook'),
}
