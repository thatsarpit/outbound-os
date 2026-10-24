import { ErrorState } from '@/components/ui/error-state'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { TrendingUp, Wallet, FileWarning, Globe } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { crmApi } from '@/api/endpoints/crm'
import { formatMoney } from '@/api/endpoints/sales'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { SkeletonCard } from '@/components/ui/skeleton'
import { useChartTheme } from '@/hooks/use-chart-theme'
import { formatDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'

/**
 * Revenue — what was booked, what was invoiced, and what is still owed.
 *
 * Order values follow creation date and current non-draft status. Invoice
 * balances and recorded paid amounts are lifetime figures, not a payment-flow ledger.
 */

const monthLabel = (m: string) => {
  const [y, mm] = m.split('-')
  return new Date(Number(y), Number(mm) - 1, 1).toLocaleDateString('en-GB', {
    month: 'short',
    year: '2-digit',
  })
}

export default function RevenuePage() {
  const chartTheme = useChartTheme()
  const [months, setMonths] = useState(12)
  const [currency, setCurrency] = useState('')
  const [invoicePage, setInvoicePage] = useState(1)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['revenue', months, currency, invoicePage],
    queryFn: () => crmApi.getRevenue(months, currency, invoicePage),
  })

  useEffect(() => {
    if (data?.byCurrency.length && !data.byCurrency.some((row) => row.currency === currency)) {
      setCurrency(data.byCurrency[0].currency)
      setInvoicePage(1)
    }
  }, [data, currency])
  const selected = data?.byCurrency.find((row) => row.currency === currency) || data?.byCurrency[0]
  const displayedCurrency = selected?.currency || currency
  const countryRamp = chartTheme.sequential(selected?.byCountry.length ?? 0).reverse()
  const series = (selected?.months ?? []).map((m) => ({
    ...m,
    label: monthLabel(m.month),
    value: m.total / 100,
  }))
  const hasData = (selected?.orderCount ?? 0) > 0

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Revenue"
        description="Order values by creation date, with lifetime invoice balances. Currencies are reported separately."
        actions={
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Reporting currency"
              className="h-9 rounded-md border border-border bg-surface px-2 text-[13px]"
              value={displayedCurrency}
              onChange={(event) => {
                setCurrency(event.target.value)
                setInvoicePage(1)
              }}
            >
              {!data?.byCurrency.length && <option value="">No currencies yet</option>}
              {data?.byCurrency.map((row) => (
                <option key={row.currency} value={row.currency}>
                  {row.currency}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-text-secondary"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              aria-label="Period"
            >
              {[3, 6, 12, 24].map((m) => (
                <option key={m} value={m}>
                  Last {m} months
                </option>
              ))}
            </select>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={0} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState title="Could not load revenue" onRetry={() => refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={TrendingUp}
              label="Order value · selected period"
              value={selected ? formatMoney(selected.bookedTotal, displayedCurrency) : '—'}
              hint={`${selected?.orderCount ?? 0} non-draft orders · creation date`}
            />
            <MetricCard
              icon={Wallet}
              label="Invoiced · lifetime"
              value={selected ? formatMoney(selected.invoiced, displayedCurrency) : '—'}
              hint="All-time non-draft, non-void invoices"
            />
            <MetricCard
              icon={Wallet}
              label="Recorded paid · lifetime"
              value={selected ? formatMoney(selected.collected, displayedCurrency) : '—'}
              hint="Invoice amountPaid totals; not dated receipts"
            />
            <MetricCard
              icon={FileWarning}
              label="Outstanding · lifetime"
              value={selected ? formatMoney(selected.outstanding, displayedCurrency) : '—'}
              hint="Remaining invoice balances across all dates"
            />
          </div>

          <SectionCard
            title={`Order value by month · ${displayedCurrency || 'currency unavailable'}`}
            description={`Selected period uses order creation dates in ${data?.period?.timezone || 'workspace time'}. Drafts and cancellations are excluded; this is not confirmation-date revenue.`}
          >
            {!hasData || series.length === 0 ? (
              <EmptyState
                compact
                icon={TrendingUp}
                title="No order value in this period"
                description="Non-draft orders created in this period will appear here."
              />
            ) : (
              <div className="h-64">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  initialDimension={{ width: 320, height: 256 }}
                >
                  <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartTheme.grid}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      stroke={chartTheme.axis}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke={chartTheme.axis}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={54}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v) => [
                        formatMoney(Math.round(Number(v ?? 0) * 100), displayedCurrency),
                        'Order value',
                      ]}
                    />
                    <Bar dataKey="value" fill={chartTheme.palette[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard
              title="By destination"
              description={`Order value in ${displayedCurrency || 'the selected currency'}, by destination.`}
            >
              {!hasData || !selected?.byCountry.length ? (
                <EmptyState
                  compact
                  icon={Globe}
                  title="Nothing yet"
                  description="Non-draft orders created in this period will appear here."
                />
              ) : (
                <div className="space-y-2">
                  {selected!.byCountry.map((c, i) => {
                    const max = selected!.byCountry[0]?.total || 1
                    return (
                      <div key={c.country} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 truncate xl:w-40 text-[13px] text-text-secondary">
                          {c.country}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(3, (c.total / max) * 100)}%`,
                              backgroundColor: countryRamp[i],
                            }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right text-[13px] tabular-nums">
                          {formatMoney(c.total, displayedCurrency)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Unpaid invoices · lifetime"
              description={`${data?.unpaidInvoiceCount ?? 0} invoices across all dates${currency ? ` · ${currency}` : ' · all currencies'}. Oldest due date first.`}
            >
              {!data?.unpaidInvoices.length ? (
                <EmptyState
                  compact
                  icon={FileWarning}
                  title="Nothing outstanding"
                  description="No issued or partially paid invoices were returned for this selection."
                />
              ) : (
                <div className="space-y-1">
                  {data.unpaidInvoices.map((inv) => {
                    const overdue = inv.dueAt ? new Date(inv.dueAt) < new Date() : false
                    return (
                      <Link
                        key={inv.id}
                        to={`/orders?order=${inv.order?.id}`}
                        className="-mx-2 flex items-center justify-between rounded-md border-b border-border-subtle px-2 py-2 transition-colors last:border-0 hover:bg-surface-raised"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-[13px] text-accent">{inv.number}</div>
                          <div className="truncate text-[11px] text-text-muted">
                            {inv.order?.customerName} · {inv.order?.orderNumber}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[13px] tabular-nums">
                            {formatMoney(Math.max(0, inv.total - inv.amountPaid), inv.currency)}
                          </div>
                          {inv.dueAt && (
                            <div
                              className={cn(
                                'text-[11px]',
                                overdue ? 'text-danger' : 'text-text-muted',
                              )}
                            >
                              {overdue ? 'Overdue ' : 'Due '}
                              {formatDate(inv.dueAt)}
                            </div>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
              {(data?.invoicePages ?? 1) > 1 && (
                <nav
                  aria-label="Unpaid invoice pages"
                  className="mt-3 flex items-center justify-between gap-3 text-xs"
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={invoicePage <= 1}
                    onClick={() => setInvoicePage((value) => value - 1)}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {invoicePage} of {data?.invoicePages}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={invoicePage >= (data?.invoicePages ?? 1)}
                    onClick={() => setInvoicePage((value) => value + 1)}
                  >
                    Next
                  </Button>
                </nav>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}
