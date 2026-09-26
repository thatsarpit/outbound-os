import { api } from '../client'
import type { User } from '../types'

export interface UserCreatePayload {
  name: string
  email: string
  password: string
  role: 'admin' | 'manager' | 'agent' | 'viewer'
  /** Enables one-time-code login for this user. */
  phone?: string
  enabled?: boolean
}

export interface UserUpdatePayload {
  name?: string
  email?: string
  password?: string
  role?: 'admin' | 'manager' | 'agent' | 'viewer'
  /** Empty string clears it, disabling one-time-code login. */
  phone?: string
  enabled?: boolean
}

export const usersApi = {
  list: () => api.get<User[]>('/users'),

  get: (id: number) => api.get<User>(`/users/${id}`),

  create: (data: UserCreatePayload) => api.post<User>('/users', data),

  update: (id: number, data: UserUpdatePayload) => api.patch<User>(`/users/${id}`, data),

  remove: (id: number) => api.delete<{ success: boolean }>(`/users/${id}`),
}
