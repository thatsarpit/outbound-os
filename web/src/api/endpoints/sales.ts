import { api } from '../client'

/**
 * Orders, customer invoices and shipments.
 *
 * All money is integer minor units (cents/paise) in the order's currency —
 * the same convention the backend uses. Format at the edge with formatMoney;
 * never do arithmetic on a formatted string.
 */

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'in_production'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'partially_paid' | 'void'

export type ShipmentStatus =
  | 'pending'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'returned'

export interface PaymentMethod {
  id: number
  name: string
  /** Basis points: 10% = 1000. */
  feeBps: number
  feeFixed: number
  passOnByDefault: boolean
  enabled: boolean
  sortOrder: number
  notes: string | null
}

export interface Supplier {
  id: number
  name: string
  matchTag: string | null
  matchPriority: number
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  currency: string
  enabled: boolean
  notes: string | null
  orderCount?: number
}

export interface Settlement {
  goodsTotal: number
  fee: number
  invoiceTotal: number
  netReceivable: number
  computedInr: number | null
  landedInr: number | null
  procurementCostInr: number
  profitInr: number | null
  marginPct: number | null
  usingActual: boolean
  currency: string
  feeMode: 'absorb' | 'pass_on'
  fxRateToInr: number | null
  paymentMethod: PaymentMethod | null
  supplier: Supplier | null
}

export interface OrderItem {
  id: number
  orderId: number
  /** Catalogue entry this line came from, if any. */
  productId: number | null
  product?: { id: number; name: string; strength: string | null } | null
  productName: string
  strength: string | null
  packing: string | null
  hsnCode: string | null
  quantity: number
  unit: string
  unitPrice: number
  lineTotal: number
  /** What the supplier charges per unit, in paise. */
  procurementUnitCost: number
  procurementTotal: number
  sortOrder: number
}

export interface SalesInvoice {
  id: number
  orderId: number
  number: string
  status: InvoiceStatus
  currency: string
  subtotal: number
  taxTotal: number
  total: number
  amountPaid: number
  taxRate: number | null
  placeOfSupply: string | null
  issuedAt: string | null
  dueAt: string | null
  paidAt: string | null
  pdfUrl: string | null
  notes: string | null
  createdAt: string
}

export interface Shipment {
  id: number
  orderId: number
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  status: ShipmentStatus
  lastStatusRaw: string | null
  lastCheckedAt: string | null
  lastError: string | null
  shippedAt: string | null
  estimatedDelivery: string | null
  deliveredAt: string | null
  packageCount: number | null
  weightGrams: number | null
  notes: string | null
  createdAt: string
  order?: { id: number; orderNumber: string; customerName: string; country: string | null }
}

export interface SalesOrder {
  id: number
  leadId: number | null
  customerId: number | null
  orderNumber: string
  status: OrderStatus
  customerName: string
  customerCompany: string | null
  customerEmail: string | null
  customerPhone: string | null
  country: string | null
  billingAddress: string | null
  shippingAddress: string | null
  currency: string
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  incoterms: string | null
  portOfDestination: string | null
  paymentTerms: string | null
  notes: string | null
  supplierId: number | null
  paymentMethodId: number | null
  feeMode: 'absorb' | 'pass_on'
  feeAmount: number
  /** 1/10,000 rupee per unit of the order currency: 83.4567 = 834567. */
  fxRateToInr: number | null
  amountReceivedInr: number | null
  procurementCostInr: number
  supplier?: Supplier | null
  paymentMethod?: PaymentMethod | null
  confirmedAt: string | null
  createdAt: string
  updatedAt: string
  items: OrderItem[]
  invoices: SalesInvoice[]
  shipments: Shipment[]
  lead?: { id: number; name: string; company: string | null } | null
}

export interface OrderFilters {
  status?: string
  search?: string
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface OrderListResponse {
  data: SalesOrder[]
  total: number
  page: number
  pages: number
}

export interface OrderStats {
  byStatus: Array<{ status: string; _count: { id: number }; _sum: { total: number | null } }>
  totalRevenue: number
  orderCount: number
  openShipments: number
}

/**
 * What creating an order actually sends. Lines are partial on purpose: a line
 * that names a catalogue product can omit price, unit and strength and let the
 * catalogue supply them.
 */
export type NewOrderInput = Omit<Partial<SalesOrder>, 'items'> & {
  items?: Array<Partial<Omit<OrderItem, 'id' | 'orderId'>>>
}

export const salesApi = {
  listOrders: (filters: OrderFilters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return
      params.set(k, String(v))
    })
    return api.get<OrderListResponse>(`/orders?${params}`)
  },

  getOrder: (id: number) => api.get<SalesOrder>(`/orders/${id}`),

  getStats: () => api.get<OrderStats>('/orders/stats'),

  createOrder: (data: NewOrderInput) => api.post<SalesOrder>('/orders', data),

  updateOrder: (id: number, data: Partial<SalesOrder>) =>
    api.patch<SalesOrder>(`/orders/${id}`, data),

  deleteOrder: (id: number) => api.delete(`/orders/${id}`),

  addItem: (orderId: number, data: Partial<OrderItem>) =>
    api.post<SalesOrder>(`/orders/${orderId}/items`, data),

  updateItem: (itemId: number, data: Partial<OrderItem>) =>
    api.patch<SalesOrder>(`/order-items/${itemId}`, data),

  deleteItem: (itemId: number) => api.delete<SalesOrder>(`/order-items/${itemId}`),

  createInvoice: (orderId: number, data: Partial<SalesInvoice> = {}) =>
    api.post<SalesInvoice>(`/orders/${orderId}/invoices`, data),

  updateInvoice: (id: number, data: Partial<SalesInvoice>) =>
    api.patch<SalesInvoice>(`/invoices/${id}`, data),

  createShipment: (orderId: number, data: Partial<Shipment>) =>
    api.post<Shipment>(`/orders/${orderId}/shipments`, data),

  updateShipment: (id: number, data: Partial<Shipment>) =>
    api.patch<Shipment>(`/shipments/${id}`, data),

  deleteShipment: (id: number) => api.delete(`/shipments/${id}`),

  getSettlement: (orderId: number) => api.get<Settlement>(`/orders/${orderId}/settlement`),

  listPaymentMethods: () => api.get<{ data: PaymentMethod[] }>('/payment-methods'),
  createPaymentMethod: (d: Partial<PaymentMethod>) =>
    api.post<PaymentMethod>('/payment-methods', d),
  updatePaymentMethod: (id: number, d: Partial<PaymentMethod>) =>
    api.patch<PaymentMethod>(`/payment-methods/${id}`, d),
  deletePaymentMethod: (id: number) => api.delete(`/payment-methods/${id}`),

  listSuppliers: () => api.get<{ data: Supplier[] }>('/suppliers'),
  createSupplier: (d: Partial<Supplier>) => api.post<Supplier>('/suppliers', d),
  updateSupplier: (id: number, d: Partial<Supplier>) => api.patch<Supplier>(`/suppliers/${id}`, d),
  deleteSupplier: (id: number) => api.delete(`/suppliers/${id}`),

  /** Suppliers a lead's tags route to, best first, with an ambiguity flag. */
  supplierForLead: (leadId: number) =>
    api.get<{ supplier: Supplier | null; matches: Supplier[]; ambiguous: boolean }>(
      `/leads/${leadId}/supplier`,
    ),

  listShipments: (status?: string) =>
    api.get<{ data: Shipment[]; total: number }>(
      `/shipments${status && status !== 'all' ? `?status=${status}` : ''}`,
    ),
}

/** Paise → rupees, with Indian digit grouping. */
export function formatInr(paise: number | null | undefined) {
  if (paise === null || paise === undefined) return '—'
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

/** Basis points → a readable percent: 1000 → "10%", 290 → "2.9%". */
export const bpsToPercent = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`

/** FX stored as 1/10,000 rupee per unit → a readable rate. */
export const fxToDisplay = (fx: number | null) => (fx ? (fx / 10000).toFixed(4) : '')
export const displayToFx = (v: string) => Math.round((Number(v) || 0) * 10000)

/** Minor units → a display string. Arithmetic must happen before this. */
export function formatMoney(minorUnits: number, currency = 'USD') {
  const value = (minorUnits || 0) / 100
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    // An unknown currency code should still render a number, not throw.
    return `${currency} ${value.toFixed(2)}`
  }
}
