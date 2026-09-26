import { api } from '../client'
import type { SalesOrder } from './sales'

/** Customers, revenue and the updates customers receive. Money is minor units. */

export type NotifyChannel = 'email' | 'whatsapp' | 'both' | 'none'
export type CustomerStatus = 'active' | 'dormant' | 'blocked'

export interface Customer {
  id: number
  leadId: number | null
  name: string
  company: string | null
  email: string | null
  phone: string | null
  country: string | null
  billingAddress: string | null
  shippingAddress: string | null
  gstin: string | null
  taxId: string | null
  status: CustomerStatus
  currency: string
  notifyChannel: NotifyChannel
  totalOrders: number
  lifetimeValue: number
  lastOrderAt: string | null
  notes: string | null
  tags: string | null
  createdAt: string
  orders?: SalesOrder[]
  notifications?: OrderNotification[]
  lead?: { id: number; name: string; source: string } | null
}

export interface OrderNotification {
  id: number
  orderId: number
  customerId: number | null
  event: string
  channel: 'email' | 'whatsapp'
  status: 'pending' | 'sent' | 'failed' | 'skipped'
  recipient: string | null
  subject: string | null
  body: string | null
  templateName: string | null
  error: string | null
  sentAt: string | null
  createdAt: string
}

export interface CustomerStats {
  customerCount: number
  lifetimeValue: number
  repeatCustomers: number
  topCustomers: Array<{
    id: number
    name: string
    company: string | null
    lifetimeValue: number
    totalOrders: number
    currency: string
  }>
}

export interface RevenueSummary {
  months: Array<{ month: string; total: number }>
  byCountry: Array<{ country: string; total: number }>
  bookedTotal: number
  orderCount: number
  invoiced: number
  collected: number
  outstanding: number
  unpaidInvoices: Array<{
    id: number
    number: string
    total: number
    amountPaid: number
    dueAt: string | null
    currency: string
    order: { id: number; orderNumber: string; customerName: string }
  }>
}

export const crmApi = {
  listCustomers: (
    filters: { search?: string; status?: string; sortBy?: string; page?: number } = {},
  ) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return
      params.set(k, String(v))
    })
    return api.get<{ data: Customer[]; total: number; page: number; pages: number }>(
      `/customers?${params}`,
    )
  },
  getCustomer: (id: number) => api.get<Customer>(`/customers/${id}`),
  getCustomerStats: () => api.get<CustomerStats>('/customers/stats'),
  createCustomer: (data: Partial<Customer>) => api.post<Customer>('/customers', data),
  updateCustomer: (id: number, data: Partial<Customer>) =>
    api.patch<Customer>(`/customers/${id}`, data),
  deleteCustomer: (id: number) => api.delete(`/customers/${id}`),
  convertLead: (leadId: number) => api.post<Customer>(`/leads/${leadId}/convert`, {}),

  getRevenue: (months = 12) => api.get<RevenueSummary>(`/revenue/summary?months=${months}`),

  notifyOrder: (orderId: number, event: string, ctx: Record<string, unknown> = {}) =>
    api.post<{ results: Array<{ channel: string; status: string; error?: string }> }>(
      `/orders/${orderId}/notify`,
      { event, ...ctx },
    ),
  orderNotifications: (orderId: number) =>
    api.get<{ data: OrderNotification[] }>(`/orders/${orderId}/notifications`),
}
