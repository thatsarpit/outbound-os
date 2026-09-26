import { useState } from 'react'
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
import { SkeletonCard } from '@/components/ui/skeleton'
import { useChartTheme } from '@/hooks/use-chart-theme'
import { formatDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'

/**
 * Revenue — what was booked, what was invoiced, and what is still owed.
 *
 * Booked and collected are deliberately separate figures: an order counts as
 * booked when it is confirmed, but money is only collected when an invoice is
 * paid, and conflating the two is how a business talks itself into revenue it
 * has not received.
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

  const { data, isLoading } = useQuery({
    queryKey: ['revenue', months],
    queryFn: () => crmApi.getRevenue(months),
  })

  const countryRamp = chartTheme.sequential(data?.byCountry.length ?? 0).reverse()
  const series = (data?.months ?? []).map((m) => ({
    ...m,
    label: monthLabel(m.month),
    value: m.total / 100,
  }))
  const hasData = (data?.orderCount ?? 0) > 0

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Revenue"
        description="Booked, invoiced and outstanding."
        actions={
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
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={0} />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={TrendingUp}
              label="Booked"
              value={formatMoney(data?.bookedTotal ?? 0)}
              hint={`${data?.orderCount ?? 0} orders confirmed`}
            />
            <MetricCard
              icon={Wallet}
              label="Invoiced"
              value={formatMoney(data?.invoiced ?? 0)}
              hint="Issued to customers"
            />
            <MetricCard
              icon={Wallet}
              label="Collected"
              value={formatMoney(data?.collected ?? 0)}
              hint="Actually received"
            />
            <MetricCard
              icon={FileWarning}
              label="Outstanding"
              value={formatMoney(data?.outstanding ?? 0)}
              hint="Invoiced but unpaid"
            />
          </div>

          <SectionCard
            title="Revenue by month"
            description="Confirmed orders, excluding drafts and cancellations."
          >
            {series.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No revenue yet"
                description="Confirmed orders will show here once you record one."
              />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
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
                      formatter={(v) => [formatMoney(Math.round(Number(v ?? 0) * 100)), 'Revenue']}
                    />
                    <Bar dataKey="value" fill={chartTheme.palette[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="By destination" description="Where the money comes from.">
              {!hasData || !data?.byCountry.length ? (
                <EmptyState
                  icon={Globe}
                  title="Nothing yet"
                  description="Confirmed orders will appear here."
                />
              ) : (
                <div className="space-y-2">
                  {data.byCountry.map((c, i) => {
                    const max = data.byCountry[0]?.total || 1
                    return (
                      <div key={c.country} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 truncate text-[13px] text-text-secondary">
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
                          {formatMoney(c.total)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Unpaid invoices" description="Oldest due date first.">
              {!data?.unpaidInvoices.length ? (
                <EmptyState
                  icon={FileWarning}
                  title="Nothing outstanding"
                  description="Every issued invoice has been paid."
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
                            {formatMoney(inv.total - inv.amountPaid, inv.currency)}
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
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}
