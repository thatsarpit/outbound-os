import { getSessionToken } from '@/stores/auth-store'
import { api, apiFetch } from '../client'

export interface ImportBatch {
  id: number
  filename: string
  totalRows: number
  imported: number
  duplicates: number
  failed: number
  status: 'processing' | 'completed' | 'failed'
  createdAt: string
}

export interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  failed: number
  errors?: string[]
  totalInDb?: number
  batchId?: number
}

export const importApi = {
  listBatches: () => api.get<ImportBatch[]>('/import/batches'),

  uploadCsv: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.upload<ImportResult>('/import/csv', formData)
  },

  exportCsv: async (
    filters: {
      status?: string
      poolId?: number | null
      search?: string
      tier?: string
    } = {},
  ) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, val]) => {
      if (val === undefined || val === null || val === '') return
      params.set(key, String(val))
    })
    const query = params.toString()
    // Use raw fetch since response is a blob
    const token = await getSessionToken()
    const res = await fetch(`/api/export/csv${query ? `?${query}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error('Export failed')
    return res.blob()
  },

  downloadTemplate: () => {
    const headers = [
      'name',
      'mobile',
      'email',
      'company',
      'country',
      'product',
      'quantity',
      'brand',
      'source',
    ]
    const sample = [
      'Rajesh Kumar',
      '919876543210',
      'rajesh@example.com',
      'Kumar Traders',
      'India',
      'Stainless hex bolts M8',
      '10000 pieces',
      'Acme',
      'manual',
    ]
    const csv = `${headers.join(',')}\n${sample.join(',')}\n`
    return new Blob([csv], { type: 'text/csv' })
  },
}

// Silence unused import warning — apiFetch is re-exported for future direct use
export { apiFetch }
