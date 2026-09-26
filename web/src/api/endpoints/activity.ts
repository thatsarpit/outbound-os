import { api } from '../client'
import type { ActivityLog } from '../types'

export interface Alert {
  id: number
  type: string
  title: string
  body: string
  severity: 'info' | 'warning' | 'error' | 'success'
  read: boolean
  leadId?: number | null
  createdAt: string
}

export const activityApi = {
  list: (filters: { limit?: number; type?: string; leadId?: number } = {}) => {
    const params = new URLSearchParams()
    if (filters.limit != null) params.set('count', String(filters.limit))
    if (filters.type) params.set('type', filters.type)
    if (filters.leadId != null) params.set('leadId', String(filters.leadId))
    const query = params.toString()
    return api.get<ActivityLog[]>(`/activity${query ? `?${query}` : ''}`)
  },

  listAlerts: () => api.get<Alert[]>('/alerts'),

  markAlertRead: (id: number) => api.post(`/alerts/${id}/read`),

  markAllAlertsRead: () => api.post('/alerts/read-all'),

  getUnreadCount: () => api.get<{ count: number }>('/alerts/count'),
}
