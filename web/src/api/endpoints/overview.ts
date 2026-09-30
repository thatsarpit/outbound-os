import { api } from '../client'
import type { ActivityLog } from '../types'
import { analyticsApi, type AnalyticsRange } from './analytics'

function getClientTimezoneOffset() {
  return typeof window === 'undefined' ? 0 : new Date().getTimezoneOffset()
}

/** Overview stats — shape returned by GET /api/stats/overview */
export interface OverviewStatsResponse {
  totalLeads: number
  newToday: number
  contacted: number
  replied: number
  engaged: number
  closed: number
  pending: number
  sentToday: number
  waUnavailable: number
  scoreDistribution: { hot: number; warm: number; cold: number; new: number }
  period?: { days: number; current: PeriodStats; previous: PeriodStats }
}
export interface PeriodStats {
  newLeads: number
  messagesSent: number
  contactedLeads: number
  repliedLeads: number
}

/**
 * `/analytics/email-performance` belongs to the analytics module — this had a
 * second, identical declaration of its response type, which is how two copies
 * drift apart. Re-exported so existing imports from here keep working.
 */
export type { EmailPerformanceResponse } from './analytics'

export const overviewApi = {
  getStats: (days = 14) => {
    const params = new URLSearchParams({
      tzOffset: String(getClientTimezoneOffset()),
      days: String(days),
    })
    return api.get<OverviewStatsResponse>(`/stats/overview?${params}`)
  },

  getCharts: (days = 14) =>
    api.get<{
      msgsByDay: {
        day: string
        count: number
        previousTotal: number
        whatsapp: number
        email: number
        imessage: number
        telegram: number
        other: number
        newLeads: number
        contactedLeads: number
        repliedLeads: number
      }[]
      statusDist: { status: string; _count: { id: number } }[]
      countryDist: { country: string; _count: { id: number } }[]
      tierDist: { leadTier: string; _count: { id: number } }[]
    }>(`/stats/charts?days=${days}&tzOffset=${getClientTimezoneOffset()}`),
  getActivity: (limit = 20) => api.get<ActivityLog[]>(`/stats/activity?count=${limit}`),

  getEmailPerformance: (range: AnalyticsRange = '30d') => analyticsApi.emailPerformance(range),
}
