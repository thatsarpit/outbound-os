import { api } from '../client'

/**
 * The product catalogue.
 *
 * Prices are minor units, same as everywhere: sellPrice in the product's own
 * currency, costInr in paise. Both are defaults that pre-fill an order line —
 * a line always keeps whatever was actually agreed.
 */

export interface Product {
  id: number
  name: string
  strength: string | null
  packing: string | null
  hsnCode: string | null
  sku: string | null
  defaultUnit: string
  sellPrice: number | null
  sellCurrency: string
  costInr: number | null
  supplierId: number | null
  supplier?: { id: number; name: string } | null
  active: boolean
  notes: string | null
  createdAt: string
  orderItems?: Array<{
    id: number
    quantity: number
    unit: string
    unitPrice: number
    lineTotal: number
    order: {
      id: number
      orderNumber: string
      customerName: string
      currency: string
      createdAt: string
      status: string
    }
  }>
}

export interface ProductPerformanceRow {
  product: {
    id: number
    name: string
    strength: string | null
    defaultUnit: string
    sellCurrency: string
  }
  lineCount: number
  quantity: number
  revenue: number
  costInr: number
}

export const productsApi = {
  list: (filters: { search?: string; active?: string; supplierId?: number } = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return
      params.set(k, String(v))
    })
    return api.get<{ data: Product[]; total: number }>(`/products?${params}`)
  },
  get: (id: number) => api.get<Product>(`/products/${id}`),
  create: (d: Partial<Product>) => api.post<Product>('/products', d),
  update: (id: number, d: Partial<Product>) => api.patch<Product>(`/products/${id}`, d),
  remove: (id: number) => api.delete(`/products/${id}`),

  /** Quantity, revenue and cost per product, across non-draft orders. */
  performance: () =>
    api.get<{ data: ProductPerformanceRow[]; unlinkedLines: number }>('/products/performance'),

  /** Most-requested product strings from lead data that aren't catalogued yet. */
  suggestions: () =>
    api.get<{ data: Array<{ name: string; askedFor: number }> }>('/products/suggestions'),
}
