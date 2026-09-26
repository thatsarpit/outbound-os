import { api } from '../client'
import type { LeadTask } from '../types'

export interface LeadTaskCreatePayload {
  title: string
  dueAt?: string | null
  done?: boolean
}

export interface LeadTaskUpdatePayload {
  title?: string
  dueAt?: string | null
  done?: boolean
}

export interface TeamTaskRow extends LeadTask {
  leadName?: string | null
  leadCompany?: string | null
  leadMobile?: string | null
  assignedToId?: number | null
}

export const tasksApi = {
  list: (leadId: number) => api.get<LeadTask[]>(`/leads/${leadId}/tasks`),

  create: (leadId: number, data: LeadTaskCreatePayload) =>
    api.post<LeadTask>(`/leads/${leadId}/tasks`, data),

  update: (leadId: number, taskId: number, data: LeadTaskUpdatePayload) =>
    api.patch<LeadTask>(`/leads/${leadId}/tasks/${taskId}`, data),

  remove: (leadId: number, taskId: number) =>
    api.delete<{ success: boolean }>(`/leads/${leadId}/tasks/${taskId}`),

  listTeamTasks: (filters: { status?: 'pending' | 'done' | 'all'; userId?: number } = {}) => {
    const params = new URLSearchParams()
    if (filters.status) params.set('status', filters.status)
    if (filters.userId != null) params.set('userId', String(filters.userId))
    const query = params.toString()
    return api.get<TeamTaskRow[]>(`/tasks${query ? `?${query}` : ''}`)
  },
}
