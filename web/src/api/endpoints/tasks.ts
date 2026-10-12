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
  overdue?: boolean | null
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

  listTeamTasks: (filters: { page?: number; limit?: number; done?: boolean } = {}) => {
    const params = new URLSearchParams()
    if (filters.page) params.set('page', String(filters.page))
    if (filters.limit) params.set('limit', String(filters.limit))
    if (filters.done) params.set('done', 'true')
    return api.get<{
      tasks: TeamTaskRow[]
      overdueCount: number
      total: number
      page: number
      pages: number
    }>(`/tasks?${params}`)
  },
}
