import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Package,
  Plus,
  Receipt,
  Truck,
  ExternalLink,
  Trash2,
  X,
  Contact,
  Users,
} from 'lucide-react'
import { leadsApi } from '@/api/endpoints/leads'
import { productsApi } from '@/api/endpoints/products'
import {
  salesApi,
  formatMoney,
  formatInr,
  type OrderStatus,
  type SalesOrder,
  type ShipmentStatus,
} from '@/api/endpoints/sales'
import { PageHeader } from '@/components/ui/page-header'
import { SettlementPanel } from '@/components/orders/settlement-panel'
import { NotificationLog } from '@/components/orders/notification-log'
import { SectionCard } from '@/components/ui/section-card'
import { MetricCard } from '@/components/ui/metric-card'
import { DrawerShell } from '@/components/ui/drawer-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from '@/stores/toast-store'
import { formatDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'

/**
 * Orders — what happens after a deal closes.
 *
 * The pipeline used to end at "closed" and everything after it lived outside
 * the software. This is the order, what was invoiced against it, and where the
 * package is.
 *
 * Money arrives as integer minor units and is only ever formatted for display;
 * no arithmetic happens on a formatted string.
 */

const ORDER_STATUSES: OrderStatus[] = [
  'draft',
  'confirmed',
  'in_production',
  'ready_to_ship',
  'shipped',
  'delivered',
  'cancelled',
]

const STATUS_VARIANT: Record<
  string,
  'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
> = {
  draft: 'neutral',
  confirmed: 'info',
  in_production: 'warning',
  ready_to_ship: 'warning',
  shipped: 'accent',
  delivered: 'success',
  cancelled: 'danger',
  pending: 'neutral',
  in_transit: 'accent',
  out_for_delivery: 'warning',
  exception: 'danger',
  returned: 'danger',
  issued: 'info',
  paid: 'success',
  partially_paid: 'warning',
  void: 'neutral',
}

const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const CARRIERS = ['dhl', 'fedex', 'ups', 'bluedart', 'delhivery', 'aramex', 'india_post', 'other']

const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] text-text-primary placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted'

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-text-secondary">{l}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

export default function OrdersPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  /**
   * The open drawer lives in the URL, not component state, so another page can
   * link straight to one order — Revenue's unpaid invoices and a customer's
   * order history both do. It also makes the back button close the drawer and
   * a reload keep it open.
   */
  const [searchParams, setSearchParams] = useSearchParams()
  const openOrderId = searchParams.get('order') ? Number(searchParams.get('order')) : null
  const setOpenOrderId = (id: number | null) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (id === null) next.delete('order')
        else next.set('order', String(id))
        return next
      },
      { replace: true },
    )
  }
  const [creating, setCreating] = useState(false)
  // Arriving from a lead's "New order" link. The lead id stays in the URL so
  // the form can prefill from it and pick the supplier its tags route to.
  const fromLeadId = searchParams.get('newFromLead')
    ? Number(searchParams.get('newFromLead'))
    : null

  const { data, isLoading } = useQuery({
    queryKey: ['orders', statusFilter, search],
    queryFn: () =>
      salesApi.listOrders({ status: statusFilter || undefined, search: search || undefined }),
  })

  const { data: stats } = useQuery({
    queryKey: ['order-stats'],
    queryFn: () => salesApi.getStats(),
    refetchInterval: 60_000,
  })

  const orders = data?.data ?? []
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    queryClient.invalidateQueries({ queryKey: ['order-stats'] })
    if (openOrderId) queryClient.invalidateQueries({ queryKey: ['order', openOrderId] })
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Orders"
        description="Confirmed deals, their invoices, and where the package is."
        actions={
          <Button
            size="sm"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setCreating(true)}
          >
            New order
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Package}
          label="Orders"
          value={stats?.orderCount ?? 0}
          hint="Excludes drafts and cancelled"
        />
        <MetricCard
          icon={Receipt}
          label="Booked value"
          value={stats ? formatMoney(stats.totalRevenue, orders[0]?.currency || 'USD') : '—'}
          hint="Across all confirmed orders"
        />
        <MetricCard
          icon={Truck}
          label="Open shipments"
          value={stats?.openShipments ?? 0}
          hint="Not yet delivered"
        />
        <MetricCard
          icon={Package}
          label="Awaiting dispatch"
          value={
            stats?.byStatus
              ?.filter((s) => ['confirmed', 'in_production', 'ready_to_ship'].includes(s.status))
              .reduce((n, s) => n + s._count.id, 0) ?? 0
          }
          hint="Confirmed but not shipped"
        />
      </div>

      <SectionCard title="All orders" description="Newest first.">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            className={cn(inputClass, 'max-w-xs')}
            placeholder="Search order no, customer, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={cn(inputClass, 'max-w-[200px]')}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <SkeletonTable rows={6} />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No orders yet"
            description="When a deal closes, record it here so the invoice and shipment live alongside it."
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                Create the first order
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" style={{ minWidth: 900 }}>
              <thead className="bg-surface-raised">
                <tr className="border-b border-border text-[11px] uppercase tracking-[0.06em] text-text-muted">
                  <th className="px-3 py-2 text-left font-medium">Order</th>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-left font-medium">Invoice</th>
                  <th className="px-3 py-2 text-left font-medium">Shipment</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const ship = o.shipments?.[0]
                  const inv = o.invoices?.[0]
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setOpenOrderId(o.id)}
                      className="cursor-pointer border-b border-border-subtle transition-colors hover:bg-surface-raised"
                    >
                      <td className="px-3 py-2 font-mono text-[12px] tabular-nums">
                        {o.orderNumber}
                      </td>
                      <td className="px-3 py-2">
                        {o.customerId ? (
                          <Link
                            to={`/customers?customer=${o.customerId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-text-primary hover:text-accent hover:underline"
                          >
                            {o.customerName}
                          </Link>
                        ) : (
                          <div className="text-text-primary">{o.customerName}</div>
                        )}
                        {o.customerCompany && (
                          <div className="text-[11px] text-text-muted">{o.customerCompany}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={STATUS_VARIANT[o.status] ?? 'neutral'}>
                          {label(o.status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(o.total, o.currency)}
                      </td>
                      <td className="px-3 py-2 text-[12px]">
                        {inv ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-mono">{inv.number}</span>
                            <Badge variant={STATUS_VARIANT[inv.status] ?? 'neutral'}>
                              {label(inv.status)}
                            </Badge>
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[12px]">
                        {ship ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Badge variant={STATUS_VARIANT[ship.status] ?? 'neutral'}>
                              {label(ship.status)}
                            </Badge>
                            {ship.carrier && (
                              <span className="uppercase text-text-muted">{ship.carrier}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-text-muted">
                        {formatDate(o.createdAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {(creating || fromLeadId !== null) && (
        <NewOrderDrawer
          fromLeadId={fromLeadId}
          onClose={() => {
            setCreating(false)
            if (fromLeadId !== null) {
              setSearchParams(
                (cur) => {
                  const next = new URLSearchParams(cur)
                  next.delete('newFromLead')
                  return next
                },
                { replace: true },
              )
            }
          }}
          onCreated={(order) => {
            setCreating(false)
            invalidate()
            setOpenOrderId(order.id)
          }}
        />
      )}

      {openOrderId !== null && (
        <OrderDrawer
          orderId={openOrderId}
          onClose={() => setOpenOrderId(null)}
          onChanged={invalidate}
        />
      )}
    </div>
  )
}

// ── New order ────────────────────────────────────────────────────────────────

type DraftItem = {
  productId: number | null
  productName: string
  strength: string
  quantity: string
  unit: string
  unitPrice: string
  cost: string
}

const blankItem = (): DraftItem => ({
  productId: null,
  productName: '',
  strength: '',
  quantity: '1',
  unit: 'box',
  unitPrice: '',
  cost: '',
})

function NewOrderDrawer({
  fromLeadId,
  onClose,
  onCreated,
}: {
  fromLeadId: number | null
  onClose: () => void
  onCreated: (o: SalesOrder) => void
}) {
  const [form, setForm] = useState({
    customerName: '',
    customerCompany: '',
    customerEmail: '',
    customerPhone: '',
    country: '',
    currency: 'USD',
    incoterms: '',
    portOfDestination: '',
    paymentTerms: '',
    shippingAddress: '',
    notes: '',
  })
  const [items, setItems] = useState<DraftItem[]>([blankItem()])
  const [supplierId, setSupplierId] = useState<number | null>(null)

  // Prefill from the lead this was started from.
  const { data: lead } = useQuery({
    queryKey: ['lead-for-order', fromLeadId],
    queryFn: () => leadsApi.getLead(fromLeadId!),
    enabled: fromLeadId !== null,
  })

  // Which supplier the lead's tags route to. Returns every match plus an
  // ambiguity flag, because a lead can legitimately carry two supplier tags.
  const { data: routing } = useQuery({
    queryKey: ['lead-supplier', fromLeadId],
    queryFn: () => salesApi.supplierForLead(fromLeadId!),
    enabled: fromLeadId !== null,
  })

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => salesApi.listSuppliers(),
    staleTime: 300_000,
  })

  const { data: catalogue } = useQuery({
    queryKey: ['products', 'active'],
    queryFn: () => productsApi.list({ active: 'true' }),
    staleTime: 300_000,
  })

  useEffect(() => {
    if (!lead) return
    setForm((f) => ({
      ...f,
      customerName: f.customerName || lead.name || '',
      customerCompany: f.customerCompany || lead.company || '',
      customerEmail: f.customerEmail || lead.email || '',
      customerPhone: f.customerPhone || lead.mobile || '',
      country: f.country || lead.country || '',
    }))
    if (lead.product) {
      setItems((cur) =>
        cur.length === 1 && !cur[0].productName
          ? [{ ...cur[0], productName: lead.product ?? '' }]
          : cur,
      )
    }
  }, [lead])

  useEffect(() => {
    if (routing?.supplier && supplierId === null) setSupplierId(routing.supplier.id)
  }, [routing, supplierId])

  // Prices are typed in major units (what the customer sees) and converted once,
  // here, so the API only ever receives minor units.
  const toMinor = (v: string) => Math.round((Number(v) || 0) * 100)
  const previewTotal = useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * toMinor(i.unitPrice), 0),
    [items],
  )
  const previewCost = useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * toMinor(i.cost), 0),
    [items],
  )

  const create = useMutation({
    mutationFn: () =>
      salesApi.createOrder({
        ...form,
        leadId: fromLeadId ?? undefined,
        supplierId: supplierId ?? undefined,
        items: items
          .filter((i) => i.productId !== null || i.productName.trim())
          .map((i) => ({
            productId: i.productId ?? undefined,
            productName: i.productName.trim(),
            strength: i.strength || null,
            quantity: Number(i.quantity) || 1,
            unit: i.unit || 'unit',
            unitPrice: toMinor(i.unitPrice),
            procurementUnitCost: toMinor(i.cost),
          })),
      }),
    onSuccess: (order) => {
      if (!order) return
      toast.success(`Order ${order.orderNumber} created`)
      onCreated(order)
    },
    onError: (e: Error) => toast.error(`Could not create order: ${e.message}`),
  })

  const setItem = (idx: number, patch: Partial<DraftItem>) =>
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  return (
    <DrawerShell onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">New order</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-text-muted hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer name *">
            <input
              className={inputClass}
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
            />
          </Field>
          <Field label="Company">
            <input
              className={inputClass}
              value={form.customerCompany}
              onChange={(e) => setForm({ ...form, customerCompany: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              className={inputClass}
              value={form.customerEmail}
              onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputClass}
              value={form.customerPhone}
              onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
            />
          </Field>
          <Field label="Country">
            <input
              className={inputClass}
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
          </Field>
          <Field label="Currency">
            <select
              className={inputClass}
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {['USD', 'EUR', 'GBP', 'AUD', 'INR'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Incoterms">
            <input
              className={inputClass}
              placeholder="DDP, FOB, CIF…"
              value={form.incoterms}
              onChange={(e) => setForm({ ...form, incoterms: e.target.value })}
            />
          </Field>
          <Field label="Port of destination">
            <input
              className={inputClass}
              value={form.portOfDestination}
              onChange={(e) => setForm({ ...form, portOfDestination: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Supplier">
          <select
            className={inputClass}
            value={supplierId ?? ''}
            onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Not set</option>
            {(suppliers?.data ?? [])
              .filter((s) => s.enabled)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          {routing?.ambiguous && (
            <p className="mt-1 text-[11px] text-warning">
              This lead matches {routing.matches.map((m) => m.name).join(' and ')} — check the
              supplier is right before saving.
            </p>
          )}
          {routing?.supplier && !routing.ambiguous && (
            <p className="mt-1 text-[11px] text-text-muted">Routed from the lead's tags.</p>
          )}
        </Field>

        <Field label="Shipping address">
          <textarea
            className={cn(inputClass, 'h-16 py-2')}
            value={form.shippingAddress}
            onChange={(e) => setForm({ ...form, shippingAddress: e.target.value })}
          />
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-text-secondary">Line items</span>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Plus className="h-3 w-3" />}
              onClick={() => setItems((c) => [...c, blankItem()])}
            >
              Add line
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_60px_54px_74px_82px_28px] gap-2">
                {/* Picking from the catalogue fills the rest of the row. Typing
                    a name instead still works — a one-off has to be sellable
                    without first creating a product for it. */}
                <div className="min-w-0 space-y-1">
                  <select
                    className={inputClass}
                    value={it.productId ?? ''}
                    aria-label="Choose from catalogue"
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null
                      const p = (catalogue?.data ?? []).find((x) => x.id === id)
                      if (!p) {
                        setItem(idx, { productId: null })
                        return
                      }
                      setItem(idx, {
                        productId: p.id,
                        productName: p.name,
                        strength: p.strength ?? '',
                        unit: p.defaultUnit,
                        // A price in another currency is not converted — that
                        // would invent a number nobody quoted.
                        unitPrice:
                          p.sellPrice !== null && p.sellCurrency === form.currency
                            ? String(p.sellPrice / 100)
                            : '',
                        cost: p.costInr !== null ? String(p.costInr / 100) : '',
                      })
                    }}
                  >
                    <option value="">Type a product…</option>
                    {(catalogue?.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.strength ? ` · ${p.strength}` : ''}
                      </option>
                    ))}
                  </select>
                  {it.productId === null && (
                    <input
                      className={inputClass}
                      placeholder="Product name"
                      value={it.productName}
                      onChange={(e) => setItem(idx, { productName: e.target.value })}
                    />
                  )}
                </div>
                <input
                  className={inputClass}
                  placeholder="Qty"
                  inputMode="numeric"
                  value={it.quantity}
                  onChange={(e) => setItem(idx, { quantity: e.target.value })}
                />
                <input
                  className={inputClass}
                  placeholder="Unit"
                  value={it.unit}
                  onChange={(e) => setItem(idx, { unit: e.target.value })}
                />
                <input
                  className={inputClass}
                  placeholder={`Sell ${form.currency}`}
                  inputMode="decimal"
                  value={it.unitPrice}
                  onChange={(e) => setItem(idx, { unitPrice: e.target.value })}
                />
                {/* What the supplier quotes, in rupees — this is what turns a
                    sale total into a profit. */}
                <input
                  className={inputClass}
                  placeholder="Cost ₹"
                  inputMode="decimal"
                  value={it.cost}
                  onChange={(e) => setItem(idx, { cost: e.target.value })}
                />
                <button
                  type="button"
                  aria-label="Remove line"
                  onClick={() => setItems((c) => c.filter((_, i) => i !== idx))}
                  className="text-text-muted transition-colors hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end gap-4 text-[13px] tabular-nums">
            <span className="text-text-secondary">
              Subtotal {formatMoney(previewTotal, form.currency)}
            </span>
            {previewCost > 0 && (
              <span className="text-text-muted">Supplier cost {formatInr(previewCost)}</span>
            )}
          </div>
        </div>

        <Field label="Notes">
          <textarea
            className={cn(inputClass, 'h-16 py-2')}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          pending={create.isPending}
          disabled={!form.customerName.trim()}
          onClick={() => create.mutate()}
        >
          Create order
        </Button>
      </div>
    </DrawerShell>
  )
}

// ── Order detail ─────────────────────────────────────────────────────────────

function OrderDrawer({
  orderId,
  onClose,
  onChanged,
}: {
  orderId: number
  onClose: () => void
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => salesApi.getOrder(orderId),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['order', orderId] })
    onChanged()
  }

  const setStatus = useMutation({
    mutationFn: (status: OrderStatus) => salesApi.updateOrder(orderId, { status }),
    onSuccess: () => {
      toast.success('Order updated')
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const raiseInvoice = useMutation({
    mutationFn: () => salesApi.createInvoice(orderId, { status: 'issued' }),
    onSuccess: (inv) => {
      toast.success(`Invoice ${inv?.number} raised`)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const [ship, setShip] = useState({ carrier: 'dhl', trackingNumber: '', estimatedDelivery: '' })
  const addShipment = useMutation({
    mutationFn: () =>
      salesApi.createShipment(orderId, {
        carrier: ship.carrier,
        trackingNumber: ship.trackingNumber || null,
        estimatedDelivery: ship.estimatedDelivery || null,
      }),
    onSuccess: () => {
      toast.success('Shipment recorded — order marked shipped')
      setShip({ carrier: 'dhl', trackingNumber: '', estimatedDelivery: '' })
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const setShipmentStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ShipmentStatus }) =>
      salesApi.updateShipment(id, { status }),
    onSuccess: () => {
      toast.success('Shipment updated')
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Tracking numbers usually arrive after the shipment is recorded. Adding one
  // here is what actually notifies the customer, so it needs its own control
  // rather than forcing a second shipment row.
  const [trackingDraft, setTrackingDraft] = useState<Record<number, string>>({})
  const addTracking = useMutation({
    mutationFn: ({ id, trackingNumber }: { id: number; trackingNumber: string }) =>
      salesApi.updateShipment(id, { trackingNumber }),
    onSuccess: (_r, v) => {
      toast.success('Tracking added — customer notified')
      setTrackingDraft((d) => {
        const next = { ...d }
        delete next[v.id]
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['order-notifications', orderId] })
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <DrawerShell onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="font-mono text-sm font-semibold">{order?.orderNumber ?? 'Order'}</h2>
          {order ? <p className="text-[12px] text-text-muted">{order.customerName}</p> : null}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-text-muted hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {isLoading || !order ? (
          <SkeletonTable rows={4} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[order.status] ?? 'neutral'}>
                {label(order.status)}
              </Badge>
              <select
                className={cn(inputClass, 'h-8 max-w-[190px]')}
                value={order.status}
                onChange={(e) => setStatus.mutate(e.target.value as OrderStatus)}
                aria-label="Change order status"
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </div>

            <SectionCard title="Items">
              <table className="w-full text-[13px]">
                <tbody>
                  {order.items.map((it) => (
                    <tr key={it.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-1.5">
                        {it.productName}
                        {it.strength && <span className="text-text-muted"> · {it.strength}</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-text-muted">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatMoney(it.lineTotal, order.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="mt-3 space-y-1 border-t border-border pt-2 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-text-muted">Subtotal</dt>
                  <dd className="tabular-nums">{formatMoney(order.subtotal, order.currency)}</dd>
                </div>
                {order.discountTotal > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-text-muted">Discount</dt>
                    <dd className="tabular-nums">
                      −{formatMoney(order.discountTotal, order.currency)}
                    </dd>
                  </div>
                )}
                {order.taxTotal > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-text-muted">Tax</dt>
                    <dd className="tabular-nums">{formatMoney(order.taxTotal, order.currency)}</dd>
                  </div>
                )}
                <div className="flex justify-between font-medium">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatMoney(order.total, order.currency)}</dd>
                </div>
              </dl>
            </SectionCard>

            <SettlementPanel order={order} />

            <SectionCard
              title="Invoices"
              description={order.invoices.length ? undefined : 'None raised yet.'}
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  pending={raiseInvoice.isPending}
                  leftIcon={<Receipt className="h-3.5 w-3.5" />}
                  onClick={() => raiseInvoice.mutate()}
                >
                  Raise invoice
                </Button>
              }
            >
              {order.invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between border-b border-border-subtle py-2 last:border-0"
                >
                  <div>
                    <div className="font-mono text-[13px]">{inv.number}</div>
                    <div className="text-[11px] text-text-muted">
                      {inv.issuedAt ? `Issued ${formatDate(inv.issuedAt)}` : 'Draft'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-[13px]">
                      {formatMoney(inv.total, inv.currency)}
                    </span>
                    <Badge variant={STATUS_VARIANT[inv.status] ?? 'neutral'}>
                      {label(inv.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </SectionCard>

            <SectionCard
              title="Shipments"
              description="Record the tracking number the courier gives you."
            >
              {order.shipments.map((s) => (
                <div key={s.id} className="border-b border-border-subtle py-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[13px]">
                        <span className="uppercase text-text-muted">{s.carrier || 'carrier'}</span>
                        {s.trackingUrl ? (
                          <a
                            href={s.trackingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-accent hover:underline"
                          >
                            {s.trackingNumber}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="font-mono">{s.trackingNumber || '—'}</span>
                        )}
                      </div>
                      {s.estimatedDelivery && (
                        <div className="text-[11px] text-text-muted">
                          ETA {formatDate(s.estimatedDelivery)}
                        </div>
                      )}
                      {s.lastError && (
                        <div className="text-[11px] text-danger">
                          Tracking refresh failed: {s.lastError}
                        </div>
                      )}
                      {!s.trackingNumber && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <input
                            className={cn(inputClass, 'h-7 max-w-[190px]')}
                            placeholder="Add tracking number"
                            value={trackingDraft[s.id] ?? ''}
                            onChange={(e) =>
                              setTrackingDraft({ ...trackingDraft, [s.id]: e.target.value })
                            }
                            aria-label="Tracking number"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            pending={addTracking.isPending}
                            disabled={!(trackingDraft[s.id] ?? '').trim()}
                            onClick={() =>
                              addTracking.mutate({
                                id: s.id,
                                trackingNumber: (trackingDraft[s.id] ?? '').trim(),
                              })
                            }
                          >
                            Save &amp; notify
                          </Button>
                        </div>
                      )}
                    </div>
                    <select
                      className={cn(inputClass, 'h-8 max-w-[150px]')}
                      value={s.status}
                      onChange={(e) =>
                        setShipmentStatus.mutate({
                          id: s.id,
                          status: e.target.value as ShipmentStatus,
                        })
                      }
                      aria-label="Shipment status"
                    >
                      {[
                        'pending',
                        'in_transit',
                        'out_for_delivery',
                        'delivered',
                        'exception',
                        'returned',
                      ].map((v) => (
                        <option key={v} value={v}>
                          {label(v)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}

              <div className="mt-3 grid grid-cols-[110px_1fr_130px_auto] gap-2">
                <select
                  className={inputClass}
                  value={ship.carrier}
                  onChange={(e) => setShip({ ...ship, carrier: e.target.value })}
                  aria-label="Carrier"
                >
                  {CARRIERS.map((c) => (
                    <option key={c} value={c}>
                      {c.toUpperCase()}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  placeholder="Tracking number"
                  value={ship.trackingNumber}
                  onChange={(e) => setShip({ ...ship, trackingNumber: e.target.value })}
                />
                <input
                  className={inputClass}
                  type="date"
                  value={ship.estimatedDelivery}
                  onChange={(e) => setShip({ ...ship, estimatedDelivery: e.target.value })}
                  aria-label="Estimated delivery"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  pending={addShipment.isPending}
                  onClick={() => addShipment.mutate()}
                  leftIcon={<Truck className="h-3.5 w-3.5" />}
                >
                  Add
                </Button>
              </div>
            </SectionCard>

            <NotificationLog orderId={orderId} />

            <SectionCard title="Details">
              {/* The order snapshots its customer details, so these links are
                  the only route back to the living records behind it. */}
              {(order.customerId || order.lead) && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {order.customerId && (
                    <Link
                      to={`/customers?customer=${order.customerId}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
                    >
                      <Contact className="h-3 w-3" />
                      Customer record
                    </Link>
                  )}
                  {order.lead && (
                    <Link
                      to={`/leads?search=${encodeURIComponent(order.lead.name)}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
                    >
                      <Users className="h-3 w-3" />
                      Originating lead
                    </Link>
                  )}
                </div>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                {order.customerCompany && (
                  <>
                    <dt className="text-text-muted">Company</dt>
                    <dd>{order.customerCompany}</dd>
                  </>
                )}
                {order.customerEmail && (
                  <>
                    <dt className="text-text-muted">Email</dt>
                    <dd>{order.customerEmail}</dd>
                  </>
                )}
                {order.country && (
                  <>
                    <dt className="text-text-muted">Country</dt>
                    <dd>{order.country}</dd>
                  </>
                )}
                {order.incoterms && (
                  <>
                    <dt className="text-text-muted">Incoterms</dt>
                    <dd>{order.incoterms}</dd>
                  </>
                )}
                {order.portOfDestination && (
                  <>
                    <dt className="text-text-muted">Port</dt>
                    <dd>{order.portOfDestination}</dd>
                  </>
                )}
                {order.paymentTerms && (
                  <>
                    <dt className="text-text-muted">Payment terms</dt>
                    <dd>{order.paymentTerms}</dd>
                  </>
                )}
                {order.shippingAddress && (
                  <>
                    <dt className="text-text-muted">Ship to</dt>
                    <dd className="whitespace-pre-wrap">{order.shippingAddress}</dd>
                  </>
                )}
                {order.notes && (
                  <>
                    <dt className="text-text-muted">Notes</dt>
                    <dd className="whitespace-pre-wrap">{order.notes}</dd>
                  </>
                )}
              </dl>
            </SectionCard>
          </>
        )}
      </div>
    </DrawerShell>
  )
}
