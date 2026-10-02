import { DashboardLayout } from '@/components/ui/dashboard-layout'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  ReferenceLine,
} from 'recharts'
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
import { overviewApi } from '@/api/endpoints/overview'
import { useChartTheme } from '@/hooks/use-chart-theme'
import { useChartFormatters } from '@/hooks/use-chart-formatters'
import { cn, formatCount } from '@/lib/utils'
import { formatDate } from '@/lib/format-date'
import { CHANNELS as CHANNEL_META, CHANNEL_ORDER } from '@/lib/channels'
import { MetricCard } from '@/components/ui/metric-card'
import { StageDistribution } from '@/components/ui/stage-distribution'
import { SectionCard } from '@/components/ui/section-card'
import { WidgetCard } from '@/components/ui/widget-card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { PageHeader } from '@/components/ui/page-header'
import { SetupChecklist } from '@/components/onboarding/setup-checklist'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'

const CHANNEL_KEYS = [...CHANNEL_ORDER, 'other'] as const
const STAGES = ['new', 'contacted', 'replied', 'engaged', 'closed']
function labelFor(status: string) {
  return status.replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase())
}
function change(current: number, previous: number) {
  return previous === 0 ? undefined : ((current - previous) / previous) * 100
}

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
  tone: 'warning' | 'info'
  to: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-focus"
    >
      <Icon
        aria-hidden="true"
        className={cn('h-4 w-4 shrink-0', tone === 'warning' ? 'text-warning' : 'text-info')}
      />
      <span className="min-w-0 flex-1 text-[13px] text-text-secondary">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{formatCount(count)}</span>
      <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-text-muted" />
    </Link>
  )
}

export default function OverviewPage() {
  const [days, setDays] = useState<7 | 14 | 30>(14)
  const theme = useChartTheme()
  const chartNumbers = useChartFormatters()
  const statsQuery = useQuery({
    queryKey: ['overview-stats', days],
    queryFn: () => overviewApi.getStats(days),
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  })
  const chartsQuery = useQuery({
    queryKey: ['overview-charts', days],
    queryFn: () => overviewApi.getCharts(days),
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  })
  const emailQuery = useQuery({
    queryKey: ['email-performance', days],
    queryFn: () => overviewApi.getEmailPerformance(`${days}d`),
    placeholderData: (previous) => previous,
    refetchInterval: 120_000,
  })
  const stats = statsQuery.data
  const charts = chartsQuery.data
  const email = emailQuery.data
  const hasOtherMessages = (charts?.msgsByDay ?? []).some((day) => day.other > 0)
  const visibleChannels = hasOtherMessages ? CHANNEL_KEYS : CHANNEL_ORDER
  const seriesOrder = [...visibleChannels, 'count', 'previousTotal']
  const current = stats?.period?.current
  const previous = stats?.period?.previous
  const messageRows = (charts?.msgsByDay ?? []).map((day) => ({
    day: day.day,
    WhatsApp: day.whatsapp,
    Email: day.email,
    iMessage: day.imessage,
    Telegram: day.telegram,
    ...(hasOtherMessages ? { Other: day.other } : {}),
    total: day.count,
    previousTotal: day.previousTotal,
  }))
  const stageRows = [...(charts?.statusDist ?? [])].sort(
    (a, b) => STAGES.indexOf(a.status) - STAGES.indexOf(b.status),
  )
  const stageColors = theme.ordinalStages
  const stages = stageRows.map((stage) => ({
    label: labelFor(stage.status),
    value: stage._count.id,
    href: `/leads?status=${encodeURIComponent(stage.status)}`,
    color: STAGES.includes(stage.status) ? stageColors[STAGES.indexOf(stage.status)] : theme.axis,
    offProgression: !STAGES.includes(stage.status),
  }))
  const emailRows = (email?.variants ?? []).slice(0, 5).map((variant) => ({
    variant: variant.variant,
    rate: variant.sent ? Math.round((variant.replied / variant.sent) * 1000) / 10 : 0,
    replied: variant.replied,
    sent: variant.sent,
  }))
  const average = email?.totals.sent ? (email.totals.replied / email.totals.sent) * 100 : 0
  const emailScale = Math.min(
    100,
    Math.max(
      10,
      Math.ceil((Math.max(average, ...emailRows.map((row) => row.rate)) * 1.25) / 10) * 10,
    ),
  )
  const tickStep = emailScale <= 20 ? 10 : 20
  const emailTicks = Array.from(
    { length: Math.floor(emailScale / tickStep) + 1 },
    (_, index) => index * tickStep,
  )
  if (emailTicks[emailTicks.length - 1] !== emailScale) emailTicks.push(emailScale)
  const channelConfig = Object.fromEntries(
    visibleChannels.map((channel) => [
      channel,
      {
        label: channel === 'other' ? 'Other' : CHANNEL_META[channel].label,
        color: theme.channel[channel],
      },
    ]),
  ) as ChartConfig
  channelConfig.previousTotal = { label: 'Previous period', color: theme.axis }
  channelConfig.count = { label: 'Total', color: theme.axis }
  const attentionTotal = (stats?.pending ?? 0) + (stats?.waUnavailable ?? 0)
  const deltaLabel = `vs previous ${days} days`
  const metric = (now?: number, then?: number) =>
    now === undefined || then === undefined ? undefined : change(now, then)
  const metricItems = [
    {
      icon: Users,
      label: 'New leads',
      now: current?.newLeads,
      before: previous?.newLeads,
      trend: (charts?.msgsByDay ?? []).map((day) => day.newLeads),
    },
    {
      icon: Send,
      label: 'Messages sent',
      now: current?.messagesSent,
      before: previous?.messagesSent,
      trend: (charts?.msgsByDay ?? []).map((day) => day.count),
    },
    {
      icon: MessageSquare,
      label: 'Leads contacted',
      now: current?.contactedLeads,
      before: previous?.contactedLeads,
      trend: (charts?.msgsByDay ?? []).map((day) => day.contactedLeads),
    },
    {
      icon: TrendingUp,
      label: 'Leads replied',
      now: current?.repliedLeads,
      before: previous?.repliedLeads,
      trend: (charts?.msgsByDay ?? []).map((day) => day.repliedLeads),
    },
  ]
  const widgets = {
    messages: (
      <WidgetCard
        title="Messages sent"
        description={`Daily by channel, with the previous ${days} days aligned by day.`}
        rows={messageRows}
        loading={chartsQuery.isLoading}
        error={chartsQuery.isError}
        onRetry={() => chartsQuery.refetch()}
      >
        <ChartContainer
          config={channelConfig}
          className="h-72 w-full"
          role="img"
          aria-label="Messages sent by channel each day"
        >
          <ComposedChart
            data={charts?.msgsByDay ?? []}
            margin={{ top: 8, right: 8, bottom: 4, left: 8 }}
            accessibilityLayer
          >
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={(value: string) => formatDate(value, 'short')}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={48}
              tickMargin={6}
            />
            <ChartTooltip
              cursor={{ stroke: theme.axis, strokeWidth: 1 }}
              itemSorter={(item) => seriesOrder.indexOf(String(item.dataKey))}
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(value) => formatDate(String(value), 'short')}
                />
              }
            />
            <ChartLegend
              itemSorter={(item) => seriesOrder.indexOf(String(item.dataKey))}
              content={<ChartLegendContent />}
            />
            {visibleChannels.map((channel) => (
              <Area
                key={channel}
                name={channel === 'other' ? 'Other' : CHANNEL_META[channel].label}
                type="monotone"
                dataKey={channel}
                stackId="sent"
                fill={theme.channel[channel]}
                fillOpacity={0.1}
                stroke={theme.channel[channel]}
                strokeWidth={2}
                activeDot={{ r: 4, stroke: theme.tooltipSurface, strokeWidth: 2 }}
              />
            ))}
            <Line
              dataKey="count"
              name="Total"
              stroke="transparent"
              dot={false}
              activeDot={false}
              legendType="none"
            />
            <Line
              name="Previous period"
              type="monotone"
              dataKey="previousTotal"
              stroke={theme.axis}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, stroke: theme.tooltipSurface, strokeWidth: 2 }}
            />
          </ComposedChart>
        </ChartContainer>
      </WidgetCard>
    ),
    attention: (
      <SectionCard
        title="Needs attention"
        description={attentionTotal ? 'Items waiting on a decision.' : 'Nothing is waiting on you.'}
      >
        {attentionTotal === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
            <Inbox className="h-6 w-6 text-text-muted" />
            <p className="text-sm text-text-secondary">The queue is clear.</p>
          </div>
        ) : (
          <div className="-mx-2 space-y-0.5">
            {(stats?.pending ?? 0) > 0 && (
              <AttentionRow
                icon={Clock}
                label="Queued to send"
                count={stats!.pending}
                tone="info"
                to="/leads?status=contacted"
              />
            )}
            {(stats?.waUnavailable ?? 0) > 0 && (
              <AttentionRow
                icon={PhoneOff}
                label="No WhatsApp number"
                count={stats!.waUnavailable}
                tone="warning"
                to="/leads?status=wa_unavailable"
              />
            )}
          </div>
        )}
        {stats ? (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-semibold text-text-muted">Lead tiers</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(['hot', 'warm', 'cold'] as const).map((tier) => (
                <div key={tier} className="rounded-md border border-border px-2 py-2">
                  <p className="text-base font-semibold">
                    {formatCount(stats.scoreDistribution[tier] ?? 0)}
                  </p>
                  <p className="text-xs capitalize text-text-muted">{tier}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </SectionCard>
    ),
    pipeline: (
      <WidgetCard
        title="Pipeline"
        description="Current lead share by stage. Select a stage to see its leads."
        rows={stageRows.map((s) => ({ stage: labelFor(s.status), leads: s._count.id }))}
        loading={chartsQuery.isLoading}
        error={chartsQuery.isError}
        onRetry={() => chartsQuery.refetch()}
      >
        <StageDistribution stages={stages} formatValue={formatCount} />
      </WidgetCard>
    ),
    email: (
      <WidgetCard
        title="Email template reply rates"
        description={`Recipients who replied out of recipients sent each template, last ${days} days.`}
        rows={emailRows}
        loading={emailQuery.isLoading}
        error={emailQuery.isError}
        onRetry={() => emailQuery.refetch()}
      >
        <div className="grid min-w-0 grid-cols-[minmax(0,94px)_minmax(0,1fr)_110px] gap-1 sm:grid-cols-[minmax(0,136px)_minmax(0,1fr)_120px]">
          <div className="flex h-64 flex-col pb-[34px] pt-[26px]">
            {emailRows.map((row) => (
              <div key={row.variant} className="flex min-h-0 flex-1 items-center">
                <span
                  className="block w-full truncate text-[11px] text-text-secondary"
                  title={row.variant}
                >
                  {row.variant}
                </span>
              </div>
            ))}
          </div>
          <ChartContainer
            config={{ rate: { label: 'Reply rate', color: theme.channel.email } }}
            className="h-64 min-w-0 w-full"
            role="img"
            aria-label={`Email reply rates by template on a zero to ${emailScale} percent scale`}
          >
            <BarChart
              data={emailRows}
              layout="vertical"
              // Room on the right for the last tick label ("40%"), which
              // is centred on the plot edge and was clipped at 8px.
              margin={{ top: 26, right: 18, bottom: 4, left: 14 }}
              accessibilityLayer
            >
              <CartesianGrid stroke={theme.grid} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, emailScale]}
                ticks={emailTicks}
                interval={0}
                tickFormatter={(v: number) => `${v}%`}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
              />
              <YAxis type="category" dataKey="variant" hide width={0} />
              <ReferenceLine
                x={average}
                stroke={theme.axis}
                strokeDasharray="3 3"
                label={{
                  value: `Avg ${chartNumbers.percent(average)}`,
                  position: 'top',
                  fill: theme.axis,
                  fontSize: 10,
                }}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => String(payload?.[0]?.payload?.variant ?? '')}
                  />
                }
              />
              <Bar
                dataKey="rate"
                name="Reply rate"
                fill={theme.channel.email}
                barSize={20}
                shape={(raw: unknown) => {
                  const mark = raw as {
                    x: number
                    y: number
                    width: number
                    height: number
                    fill: string
                  }
                  const middle = mark.y + mark.height / 2
                  return (
                    <g>
                      <line
                        x1={mark.x}
                        x2={mark.x + mark.width}
                        y1={middle}
                        y2={middle}
                        stroke={mark.fill}
                        strokeWidth={2}
                      />
                      <circle
                        cx={mark.x + mark.width}
                        cy={middle}
                        r={5}
                        fill={mark.fill}
                        stroke={theme.tooltipSurface}
                        strokeWidth={2}
                      />
                    </g>
                  )
                }}
              />
            </BarChart>
          </ChartContainer>
          <div className="flex h-64 flex-col pb-[34px] pt-[26px]">
            {emailRows.map((row) => (
              <div
                key={row.variant}
                className="flex min-h-0 flex-1 items-center justify-end whitespace-nowrap text-right text-[11px] tabular-nums text-text-secondary"
              >
                {chartNumbers.percent(row.rate)} · {row.replied}/{row.sent}
              </div>
            ))}
          </div>
        </div>
      </WidgetCard>
    ),
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Overview"
        description="Live pipeline health across every connected channel."
      />
      <SetupChecklist />
      <div className="flex flex-wrap items-center gap-2" aria-label="Reporting period">
        <span className="mr-1 text-sm text-text-secondary">Last</span>
        {([7, 14, 30] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDays(value)}
            aria-pressed={days === value}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-focus',
              days === value
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-border bg-surface text-text-secondary hover:bg-surface-raised',
            )}
          >
            {value} days
          </button>
        ))}
      </div>
      {statsQuery.isError ? (
        <ErrorState title="Could not load overview" onRetry={() => statsQuery.refetch()} />
      ) : statsQuery.isLoading ? (
        <LoadingState variant="page" />
      ) : (
        <div
          className={cn(
            'grid grid-cols-2 gap-3 xl:grid-cols-4',
            statsQuery.isFetching && 'opacity-70',
          )}
        >
          {metricItems.map((item) => {
            const delta = metric(item.now, item.before)
            return (
              <MetricCard
                key={item.label}
                icon={item.icon}
                label={item.label}
                value={item.now ?? 0}
                delta={delta === undefined ? undefined : { value: delta, label: deltaLabel }}
                hint={item.before === 0 ? 'No activity in previous period' : undefined}
                trend={item.trend}
              />
            )
          })}
        </div>
      )}
      <DashboardLayout page="overview" widgets={widgets} />
    </div>
  )
}
