import { api } from '../client'

function getClientTimezoneOffset() {
  return typeof window === 'undefined' ? 0 : new Date().getTimezoneOffset()
}

export interface DailyBreakdownRow {
  label: string
  leadsCreated: number
  msgsSent: number
  replies: number
}

export interface FunnelStage {
  stage: string
  label: string
  count: number
  cumulative: number
  conversionRate: number
  dropoff: number
}

export interface FunnelResponse {
  range: string
  total: number
  paused: number
  waUnavailable: number
  funnel: FunnelStage[]
  avgReplyHours: number | null
}

export interface CampaignRoiRow {
  id: number
  name: string
  channel: string
  status: string
  totalLeads: number
  sent: number
  replied: number
  converted: number
  replyRate: number
  conversionRate: number
  revenue: number
  avgDealValue: number
  startedAt: string | null
  completedAt: string | null
}

export interface CampaignRoiResponse {
  range: string
  pipeline: {
    totalDealValue: number
    convertedLeads: number
    avgDealValue: number
  }
  campaigns: CampaignRoiRow[]
}

export interface EmailPerformanceResponse {
  range: string
  totals: { sent: number; replied: number; replyRate: number }
  variants: { variant: string; sent: number; replied: number; replyRate: number }[]
}

export type AnalyticsRange = '7d' | '14d' | '30d' | '90d' | 'all'

export const analyticsApi = {
  daily: (days = 14) =>
    api.get<DailyBreakdownRow[]>(
      `/analytics/daily?days=${days}&tzOffset=${getClientTimezoneOffset()}`,
    ),

  funnel: (range: AnalyticsRange = '30d') =>
    api.get<FunnelResponse>(`/analytics/funnel?range=${range}`),

  campaignRoi: (range: AnalyticsRange = '30d') =>
    api.get<CampaignRoiResponse>(`/analytics/campaign-roi?range=${range}`),

  emailPerformance: (range: AnalyticsRange = '30d') =>
    api.get<EmailPerformanceResponse>(
      `/analytics/email-performance?range=${range}&tzOffset=${getClientTimezoneOffset()}`,
    ),

  recomputeWeights: () =>
    api.post<{ success: boolean; updated: number }>('/analytics/recompute-weights'),
}
