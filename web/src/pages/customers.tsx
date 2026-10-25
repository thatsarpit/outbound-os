import { SearchInput } from '@/components/ui/search-input'
import { ErrorState } from '@/components/ui/error-state'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, Repeat, Wallet, X, Mail, MessageSquare, ChevronRight } from 'lucide-react'
import { crmApi, type Customer, type NotifyChannel } from '@/api/endpoints/crm'
import { formatMoney } from '@/api/endpoints/sales'
import { formatCurrencyTotals } from '@/lib/money-groups'
import { CurrencyTotals } from '@/components/ui/currency-totals'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { MetricCard } from '@/components/ui/metric-card'
import { DrawerShell } from '@/components/ui/drawer-shell'
import { Badge } from '@/components/ui/badge'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from '@/stores/toast-store'
import { formatDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'

/**
 * Customers — the buying relationships, as opposed to leads we are still
 * chasing. Sorted by most recent order, because the useful question is
 * usually "who is active" rather than "who is alphabetically first".
 *
 * Lifetime value and order counts are server-computed rollups; nothing here
 * writes them.
 */

const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] text-text-primary placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted'

const CHANNEL_LABEL: Record<NotifyChannel, string> = {
  both: 'Email + WhatsApp',
  email: 'Email only',
  whatsapp: 'WhatsApp only',
  none: 'No updates',
}

const STATUS_VARIANT = { active: 'success', dormant: 'neutral', blocked: 'danger' } as const

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  // Addressable so the Leads page can link straight to a lead's customer.
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get('customer') ? Number(searchParams.get('customer')) : null
  const setOpenId = (id: number | null) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (id === null) next.delete('customer')
        else next.set('customer', String(id))
        return next
      },
      { replace: true },
    )
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', search, page],
    queryFn: () => crmApi.listCustomers({ search: search || undefined, page }),
  })
  const { data: stats } = useQuery({
    queryKey: ['customer-stats'],
    queryFn: () => crmApi.getCustomerStats(),
  })

  const customers = data?.data ?? []

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Customers"
        description="Everyone who has bought, and what they are worth."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard icon={Users} label="Customers" value={stats?.customerCount ?? 0} />
        <MetricCard
          icon={Wallet}
          label="Lifetime value"
          value={
            stats
              ? stats.lifetimeValueByCurrency.length > 1
                ? `${stats.lifetimeValueByCurrency.length} currencies`
                : formatCurrencyTotals(stats.lifetimeValueByCurrency)
              : '—'
          }
          hint="Non-draft order values; no currency conversion"
        />
        <MetricCard
          icon={Repeat}
          label="Repeat buyers"
          value={stats?.repeatCustomers ?? 0}
          hint="More than one order"
        />
      </div>

      {(stats?.lifetimeValueByCurrency.length ?? 0) > 1 && (
        <SectionCard
          title="Customer order values by currency"
          description="Lifetime non-draft order values, without conversion."
        >
          <CurrencyTotals totals={stats?.lifetimeValueByCurrency} />
        </SectionCard>
      )}

      <SectionCard title="All customers" description="Most recent order first.">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SearchInput
            label="Search customers"
            placeholder="Name, company or email…"
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
          />
          {!isLoading && !isError && (
            <span className="text-xs text-text-muted">
              {customers.length} of {data?.total ?? 0} shown
            </span>
          )}
        </div>

        {isLoading ? (
          <SkeletonTable rows={6} />
        ) : isError ? (
          <ErrorState title="Could not load customers" onRetry={() => refetch()} />
        ) : customers.length === 0 ? (
          <EmptyState
            icon={Users}
            tone={search ? 'filtered' : 'waiting'}
            title={search ? 'No matching customers' : 'No customers yet'}
            description={
              search
                ? 'Try another name, company or email.'
                : 'Customers appear when you record their first order.'
            }
            action={
              search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-sm text-accent hover:underline"
                >
                  Clear search
                </button>
              ) : (
                <Link to="/leads" className="text-sm text-accent hover:underline">
                  View leads
                </Link>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" style={{ minWidth: 820 }}>
              <thead className="bg-surface-raised">
                <tr className="border-b border-border text-[11px] uppercase tracking-[0.06em] text-text-muted">
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-left font-medium">Country</th>
                  <th className="px-3 py-2 text-right font-medium">Orders</th>
                  <th className="px-3 py-2 text-right font-medium">Lifetime value</th>
                  <th className="px-3 py-2 text-left font-medium">Last order</th>
                  <th className="px-3 py-2 text-left font-medium">Updates</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setOpenId(c.id)}
                    className="cursor-pointer border-b border-border-subtle transition-colors hover:bg-surface-raised"
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left font-medium text-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                        onClick={(event) => {
                          event.stopPropagation()
                          setOpenId(c.id)
                        }}
                      >
                        {c.name}
                      </button>
                      {c.company && <div className="text-[11px] text-text-muted">{c.company}</div>}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-text-secondary">
                      {c.country || '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.totalOrders}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrencyTotals(c.lifetimeValueByCurrency)}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-text-muted">
                      {c.lastOrderAt ? formatDate(c.lastOrderAt) : '—'}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-text-secondary">
                      {CHANNEL_LABEL[c.notifyChannel]}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[c.status] ?? 'neutral'}>{c.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(data?.pages ?? 1) > 1 && (
          <nav
            aria-label="Customer pages"
            className="mt-4 flex items-center justify-between gap-3 text-xs"
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {data?.pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= (data?.pages ?? 1)}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </nav>
        )}
      </SectionCard>

      {openId !== null && <CustomerDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function CustomerDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => crmApi.getCustomer(id),
  })

  const update = useMutation({
    mutationFn: (patch: Partial<Customer>) => crmApi.updateCustomer(id, patch),
    onSuccess: () => {
      toast.success('Customer updated')
      queryClient.invalidateQueries({ queryKey: ['customer', id] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <DrawerShell onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{customer?.name ?? 'Customer'}</h2>
          {customer?.company ? (
            <p className="text-[12px] text-text-muted">{customer.company}</p>
          ) : null}
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
        {isLoading || !customer ? (
          <SkeletonTable rows={4} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-surface-raised p-3">
                <div className="text-[11px] uppercase tracking-wide text-text-muted">Orders</div>
                <div className="mt-1 text-lg tabular-nums">{customer.totalOrders}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-raised p-3">
                <div className="text-[11px] uppercase tracking-wide text-text-muted">Lifetime</div>
                <div className="mt-1 text-lg tabular-nums">
                  <CurrencyTotals totals={customer.lifetimeValueByCurrency} />
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface-raised p-3">
                <div className="text-[11px] uppercase tracking-wide text-text-muted">
                  Last order
                </div>
                <div className="mt-1 text-[13px]">
                  {customer.lastOrderAt ? formatDate(customer.lastOrderAt) : '—'}
                </div>
              </div>
            </div>

            <SectionCard
              title="Order updates"
              description="How this customer hears about their orders. Set to no updates and nothing is sent, whatever happens to the order."
            >
              <select
                className={inputClass}
                value={customer.notifyChannel}
                onChange={(e) => update.mutate({ notifyChannel: e.target.value as NotifyChannel })}
                aria-label="Notification channel"
              >
                {(Object.keys(CHANNEL_LABEL) as NotifyChannel[]).map((k) => (
                  <option key={k} value={k}>
                    {CHANNEL_LABEL[k]}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] text-text-muted">
                {customer.email ? `Email → ${customer.email}` : 'No email on file'}
                {' · '}
                {customer.phone ? `WhatsApp → ${customer.phone}` : 'No phone on file'}
              </p>
            </SectionCard>

            <SectionCard
              title="Orders"
              description={customer.orders?.length ? undefined : 'No orders yet.'}
            >
              {customer.orders?.map((o) => (
                <Link
                  key={o.id}
                  to={`/orders?order=${o.id}`}
                  className="-mx-2 flex items-center justify-between rounded-md border-b border-border-subtle px-2 py-2 transition-colors last:border-0 hover:bg-surface-raised"
                >
                  <div>
                    <div className="font-mono text-[13px] text-accent">{o.orderNumber}</div>
                    <div className="text-[11px] text-text-muted">{formatDate(o.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-[13px]">
                      {formatMoney(o.total, o.currency)}
                    </span>
                    <Badge variant="neutral">{o.status.replace(/_/g, ' ')}</Badge>
                    <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
                  </div>
                </Link>
              ))}
            </SectionCard>

            <SectionCard
              title="Updates sent"
              description={customer.notifications?.length ? undefined : 'Nothing sent yet.'}
            >
              {customer.notifications?.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start justify-between gap-2 border-b border-border-subtle py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[13px]">
                      {n.channel === 'email' ? (
                        <Mail className="h-3 w-3 text-text-muted" />
                      ) : (
                        <MessageSquare className="h-3 w-3 text-text-muted" />
                      )}
                      {n.event.replace(/_/g, ' ')}
                    </div>
                    <div className="truncate text-[11px] text-text-muted">{n.recipient}</div>
                    {n.error && <div className="text-[11px] text-danger">{n.error}</div>}
                  </div>
                  <Badge
                    variant={
                      n.status === 'sent' ? 'success' : n.status === 'failed' ? 'danger' : 'neutral'
                    }
                  >
                    {n.status}
                  </Badge>
                </div>
              ))}
            </SectionCard>

            <SectionCard title="Details">
              <div className="grid grid-cols-2 gap-3">
                {(['email', 'phone', 'country', 'gstin'] as const).map((f) => (
                  <label key={f} className="block">
                    <span className="text-[12px] font-medium text-text-secondary capitalize">
                      {f}
                    </span>
                    <input
                      className={cn(inputClass, 'mt-1')}
                      defaultValue={customer[f] ?? ''}
                      onBlur={(e) => {
                        if (e.target.value !== (customer[f] ?? ''))
                          update.mutate({ [f]: e.target.value })
                      }}
                    />
                  </label>
                ))}
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </DrawerShell>
  )
}
