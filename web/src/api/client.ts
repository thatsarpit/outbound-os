import type { ApiError } from './types'
import { getSessionToken, useAuthStore } from '@/stores/auth-store'

const API_BASE = '/api'

export class ApiClientError extends Error {
  status: number
  code?: string
  details?: string

  constructor(message: string, status: number, code?: string, details?: string) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T | void> {
  const token = await getSessionToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Only set Content-Type for non-FormData bodies
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })

  // Handle 401 — a Clerk session that expired mid-request. Clerk's own
  // <SignedOut> gate (via ClerkAuthBridge) is what actually redirects; this
  // just stops the caller from reading a body that never came.
  if (response.status === 401) {
    // A built-in session that expired or was revoked: drop it so the route
    // guard sends the person back to sign in instead of showing empty pages.
    const auth = useAuthStore.getState()
    if (auth.provider === 'local' && auth.isAuthenticated) auth.setFromLocal(null)
    throw new ApiClientError('Unauthorized', 401)
  }

  // Handle empty responses (204, etc.)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined
  }

  let data
  try {
    data = await response.json()
  } catch {
    if (!response.ok) {
      throw new ApiClientError(response.statusText || 'Request failed', response.status)
    }
    return undefined as T
  }

  if (!response.ok) {
    const err = data as ApiError
    throw new ApiClientError(err.error || 'Request failed', response.status, err.code, err.details)
  }

  return data as T
}

export const api = {
  get: <T>(endpoint: string) => apiFetch<T>(endpoint),

  post: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string) => apiFetch<T>(endpoint, { method: 'DELETE' }),

  upload: <T>(endpoint: string, formData: FormData) =>
    apiFetch<T>(endpoint, { method: 'POST', body: formData }),
}
