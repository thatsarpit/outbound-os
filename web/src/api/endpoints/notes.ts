import { api } from '../client'
import type { LeadNote } from '../types'

export type LeadNoteType = 'note' | 'call' | 'meeting' | 'email_manual'

export interface LeadNoteCreatePayload {
  content: string
  type?: LeadNoteType
}

export const notesApi = {
  list: (leadId: number) => api.get<LeadNote[]>(`/leads/${leadId}/notes`),

  create: (leadId: number, data: LeadNoteCreatePayload) =>
    api.post<LeadNote>(`/leads/${leadId}/notes`, data),

  remove: (leadId: number, noteId: number) =>
    api.delete<{ success: boolean }>(`/leads/${leadId}/notes/${noteId}`),
}
