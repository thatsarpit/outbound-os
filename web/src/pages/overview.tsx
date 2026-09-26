import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  overviewApi,
  type OverviewStatsResponse,
  type EmailPerformanceResponse,
} from '@/api/endpoints/overview'
import { useChartTheme } from '@/hooks/use-chart-theme'
import { cn, formatCount } from '@/lib/utils'
import { formatDate } from '@/lib/format-date'
import {
  Users,
  Send,
  MessageSquare,
  TrendingUp,
  ChevronRight,
  PhoneOff,
  Clock,
  Inbox,
} from 'lucide-react'
import { SkeletonCard } from '@/components/ui/skeleton'
import { MetricCard } from '@/components/ui/metric-card'
import { StageDistribution } from '@/components/ui/stage-distribution'
import { BarList } from '@/components/ui/bar-list'
import { SectionCard } from '@/components/ui/section-card'
import { PageHeader } from '@/components/ui/page-header'
import { SetupChecklist } from '@/components/onboarding/setup-checklist'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { ChartFrame } from '@/components/ui/chart-frame'

/* ── Needs-attention queue ──
 * The old Overview was five vanity counters and a pie chart: it said how the
 * business was doing but never what to do next. These rows are the actionable
 * half, and each one links to the filtered view that resolves it. */

function AttentionRow({
  icon: Icon,
  label,
  count,
  tone,
  to,
}: {
  icon: React.ElementType
  label: string
  count: number
  tone: 'warning' | 'danger' | 'info'
  to: string
}) {
  const TONES = {
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-info',
  } as const

  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-raised"
    >
      <Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', TONES[tone])} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-text-secondary">{label}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
        {formatCount(count)}
      </span>
      <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-text-muted" />
    </Link>
  )
}

/** Stage keys are snake_case identifiers; people read sentence case. */
function humanizeStage(status: string): string {
  const s = status.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function OverviewPage() {
  const chartTheme = useChartTheme()

  const { data: stats, isLoading: statsLoading } = useQuery<OverviewStatsResponse>({
    queryKey: ['overview-stats'],
    queryFn: async () => {
      const res = await overviewApi.getStats()
      if (!res) throw new Error('Empty response')
      return res
    },
    refetchInterval: 30_000,
  })

  const { data: charts, isLoading: chartsLoading } = useQuery({
    queryKey: ['overview-charts'],
    queryFn: async () => {
      const res = await overviewApi.getCharts(14)
      if (!res) throw new Error('Empty response')
      return res
    },
    refetchInterval: 60_000,
  })

  const { data: emailPerf } = useQuery<EmailPerformanceResponse>({
    queryKey: ['email-performance', '30d'],
    queryFn: async () => {
      const res = await overviewApi.getEmailPerformance('30d')
      if (!res) throw new Error('Empty response')
      return res
    },
    refetchInterval: 120_000,
  })

  if (statsLoading) {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={0} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} lines={6} />
          ))}
        </div>
      </div>
    )
  }

  const msgsByDay = charts?.msgsByDay || []
  const statusDist = charts?.statusDist || []
  const pending = stats?.pending || 0
  const waUnavailable = stats?.waUnavailable || 0
  const contacted = stats?.contacted || 0
  const replied = stats?.replied || 0
  const replyRate = contacted > 0 ? (replied / contacted) * 100 : 0
  const attentionTotal = pending + waUnavailable
  const trend = msgsByDay.map((d) => d.count)

  // Pipeline stages have an inherent order, so they are rendered in funnel
  // order with a sequential ramp rather than sorted by size with categorical
  // colours. Anything off the progression falls to the axis grey.
  const STAGE_ORDER = ['new', 'contacted', 'replied', 'engaged', 'closed']
  const orderedStages = [...statusDist].sort((a, b) => {
    const ai = STAGE_ORDER.indexOf(a.status)
    const bi = STAGE_ORDER.indexOf(b.status)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
  const stageRamp = chartTheme.sequential(orderedStages.length)
  const variantRamp = chartTheme.sequential(1)

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Overview"
        description="Live pipeline health across every connected channel."
      />

      <SetupChecklist />

      {/* Headline metrics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Total leads"
          value={formatCount(stats?.totalLeads || 0)}
          hint={`${formatCount(stats?.newToday || 0)} new today`}
          trend={trend}
        />
        <MetricCard
          icon={Send}
          label="Messages sent today"
          value={formatCount(stats?.sentToday || 0)}
          trend={trend}
        />
        <MetricCard
          icon={MessageSquare}
          label="Leads replied"
          value={formatCount(replied)}
          meter={contacted > 0 ? replied / contacted : 0}
          hint={`of ${formatCount(contacted)} contacted`}
        />
        <MetricCard
          icon={TrendingUp}
          label="Reply rate"
          value={`${replyRate.toFixed(1)}%`}
          meter={replyRate / 100}
          hint="Across all channels"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Activity */}
        <SectionCard
          className="lg:col-span-2"
          title="Messages sent"
          description="Last 14 days, in your local time."
        >
          {chartsLoading ? (
            <div className="h-56 animate-pulse rounded-md bg-surface-raised" />
          ) : msgsByDay.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-text-muted">
              No messages sent in this window yet.
            </div>
          ) : (
            <ChartFrame
              className="h-56"
              fallback={<div className="h-full rounded-md bg-surface-raised" />}
            >
              {({ width, height }) => (
                <AreaChart
                  width={width}
                  height={height}
                  data={msgsByDay}
                  margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
                >
                  <defs>
                    <linearGradient id="msgGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartTheme.palette[0]} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={chartTheme.palette[0]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                  <XAxis
                    dataKey="day"
                    stroke={chartTheme.axis}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val: string) => formatDate(val, 'short')}
                  />
                  <YAxis
                    stroke={chartTheme.axis}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tick={{ fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={chartTheme.tooltip}
                    cursor={{ stroke: chartTheme.axis, strokeWidth: 1 }}
                    labelFormatter={(val) => formatDate(String(val), 'short')}
                    formatter={(value) => [formatCount(Number(value)), 'Sent'] as [string, string]}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={chartTheme.palette[0]}
                    strokeWidth={2}
                    fill="url(#msgGradient)"
                    activeDot={{ r: 4, strokeWidth: 2, stroke: chartTheme.tooltipSurface }}
                  />
                </AreaChart>
              )}
            </ChartFrame>
          )}
        </SectionCard>

        {/* What needs doing */}
        <SectionCard
          title="Needs attention"
          description={
            attentionTotal === 0 ? 'Nothing is waiting on you.' : 'Items waiting on a decision.'
          }
        >
          {attentionTotal === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
              <Inbox aria-hidden="true" className="h-6 w-6 text-text-muted" />
              <p className="text-sm text-text-secondary">The queue is clear.</p>
            </div>
          ) : (
            <div className="-mx-2 space-y-0.5">
              {pending > 0 && (
                <AttentionRow
                  icon={Clock}
                  label="Queued to send"
                  count={pending}
                  tone="info"
                  to="/leads?status=contacted"
                />
              )}
              {waUnavailable > 0 && (
                <AttentionRow
                  icon={PhoneOff}
                  label="No WhatsApp number"
                  count={waUnavailable}
                  tone="warning"
                  to="/leads?filter=wa_unavailable"
                />
              )}
            </div>
          )}

          {stats && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                Lead tiers
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(
                  [
                    ['Hot', stats.scoreDistribution?.hot || 0, 'text-hot'],
                    ['Warm', stats.scoreDistribution?.warm || 0, 'text-warm'],
                    ['Cold', stats.scoreDistribution?.cold || 0, 'text-cold'],
                  ] as const
                ).map(([label, value, tone]) => (
                  <div key={label} className="rounded-md border border-border px-2.5 py-2">
                    <p className={cn('text-base font-semibold tabular-nums', tone)}>
                      {formatCount(value)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-muted">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Pipeline */}
        <SectionCard title="Pipeline" description="Where every lead currently sits.">
          {statusDist.length === 0 ? (
            <p className="text-sm text-text-muted">No leads yet.</p>
          ) : (
            <StageDistribution
              formatValue={formatCount}
              stages={orderedStages.map((s, i) => ({
                label: humanizeStage(s.status),
                value: s._count.id,
                color:
                  s.status === 'paused' || s.status === 'wa_unavailable'
                    ? chartTheme.axis
                    : stageRamp[i],
                // Paused leads are not a step on the path; counting them in the
                // drop-off between stages would make the arithmetic lie.
                offProgression: s.status === 'paused' || s.status === 'wa_unavailable',
              }))}
            />
          )}
        </SectionCard>

        {/* Email performance */}
        <SectionCard
          title="Email performance"
          description="Reply rate by template variant, last 30 days."
          action={
            emailPerf && emailPerf.totals.sent > 0 ? (
              <span className="text-xs tabular-nums text-text-muted">
                {formatCount(emailPerf.totals.replied)} / {formatCount(emailPerf.totals.sent)}{' '}
                replied
              </span>
            ) : undefined
          }
        >
          {!emailPerf || emailPerf.variants.length === 0 ? (
            <p className="text-sm text-text-muted">No emails sent in this window yet.</p>
          ) : (
            (() => {
              const rates = emailPerf.variants.slice(0, 5).map((v) => ({
                v,
                rate: v.sent > 0 ? v.replied / v.sent : 0,
              }))
              const best = Math.max(...rates.map((r) => r.rate), 0) || 1
              return (
                <BarList
                  items={rates.map(({ v, rate }) => ({
                    label: v.variant,
                    value: v.replied,
                    // Bars rank by reply RATE, matching the number beside them.
                    // They used to be sized by reply COUNT while the label read
                    // a percentage, so the longest bar was not the best
                    // variant. Scaled against the best rate rather than 100%,
                    // because these cluster in a narrow band and at absolute
                    // scale every bar looked identical.
                    share: rate / best,
                    display: `${(rate * 100).toFixed(0)}%  ·  ${formatCount(v.replied)}/${formatCount(v.sent)}`,
                    color: variantRamp[0],
                  }))}
                />
              )
            })()
          )}
        </SectionCard>
      </div>
    </div>
  )
}
