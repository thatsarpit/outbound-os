import { api } from '../client'

export interface SystemStatus {
  engineRunning?: boolean
  pollingActive?: boolean
  poolsLoaded?: number
}

export interface SystemHealthIssue {
  severity: 'down' | 'warn'
  area: string
  message: string
}

/**
 * Shape of GET /api/system/health. Only the fields the dashboard consumes are
 * typed here; the endpoint also returns cpu/memory/disk raw blocks.
 */
export interface SystemHealthCheck {
  health?: { overall: 'ok' | 'degraded' | 'down'; issues: SystemHealthIssue[] }
  db?: string
  instance?: string
  llm?: { model: string; ok: boolean; lastError: string | null; hasApiKey: boolean }
  whatsapp?: Array<{
    id: number
    name: string
    enabled: boolean
    isReady: boolean
    messagesSentToday: number
  }>
  email?: Array<{ id: number; email: string; lastError: string | null }>
  recovery?: {
    enabled: boolean
    running: boolean
    lastHeartbeatAt: string | null
    lastRecoveryAt: string | null
    lastRecoveryReason: string | null
    lastRecoveryStatus: 'running' | 'ok' | 'degraded' | 'failed' | null
    lastDowntimeMs: number | null
    summary?: {
      reconciliation?: {
        checked?: number
        whatsappQueued?: number
        emailQueued?: number
        imessageQueued?: number
      }
    } | null
  }
}

export const systemApi = {
  getStatus: () => api.get<SystemStatus>('/system/status'),

  getHealth: () => api.get<SystemHealthCheck>('/system/health'),

  runRecovery: () => api.post<SystemHealthCheck['recovery']>('/system/recovery/run'),

  queuePreview: () =>
    api.get<{
      queued: number
      byAccount: { accountId: number; count: number }[]
      sample: unknown[]
    }>('/queue/preview'),
}
