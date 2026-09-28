import { useHomeCurrency } from '@/hooks/use-home-currency'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useChartTheme } from '@/hooks/use-chart-theme'
import { formatCount, formatCurrency, formatNumber } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { Users, Send, MessageSquare, TrendingUp } from 'lucide-react'
import { SkeletonCard } from '@/components/ui/skeleton'
import { ChartFrame } from '@/components/ui/chart-frame'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { BarList } from '@/components/ui/bar-list'
import { CategoryBar } from '@/components/ui/category-bar'
import { PageHeader } from '@/components/ui/page-header'
import { ErrorState } from '@/components/ui/error-state'
import { analyticsApi, type AnalyticsRange } from '@/api/endpoints/analytics'

/* ── Payload hardening ───────────────────────────────────────────────────────
 * Every query on this page used to hand the raw response straight to the
 * renderer. When an endpoint returned something other than the documented
 * shape — an error object, an empty body, a renamed field — the first
 * `.slice()` / `.map()` / `.reduce()` threw and the error boundary blanked the
 * whole route (`chartData.slice is not a function`). Coercion happens here, in
 * the queryFn, so a bad payload degrades to an empty chart and every other
 * section on the page keeps working.
 */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

interface DailyRow {
  label: string
  leadsCreated: number
  msgsSent: number
  replies: number
}

interface DistRow {
  name: string
  value: number
}

interface FunnelStageRow {
  stage: string
  label: string
  count: number
  cumulative: number
  conversionRate: number
  dropoff: number
}

interface CampaignRow {
  id: number
  name: string
  sent: number
  replied: number
  replyRate: number
  converted: number
  revenue: number
}

interface TeamRow {
  id: number
  name: string
  role: string
  leadsAssigned: number
  replied: number
  closed: number
  avgScore: number
  conversionRate: number
}

/** A `{ status, _count: { id } }`-style bucket, whatever the key is called. */
function toDist(rows: unknown, key: string, fallbackName: string): DistRow[] {
  return asArray<Record<string, unknown>>(rows).map((row) => ({
    name: str(row?.[key], fallbackName),
    value: num((row?._count as { id?: unknown } | undefined)?.id),
  }))
}

/** Small labelled figure. Used for the secondary numbers that used to be pills. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  )
}

function SectionMessage({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-text-muted">{children}</p>
}

export default function AnalyticsPage() {
  const home = useHomeCurrency()
  const chartTheme = useChartTheme()
  const timezoneOffset = typeof window === 'undefined' ? 0 : new Date().getTimezoneOffset()
  const range: AnalyticsRange = '30d'

  // ── Daily breakdown ──
  const {
    data: daily = [],
    isLoading: dailyLoading,
    error: dailyError,
    refetch: refetchDaily,
  } = useQuery<DailyRow[]>({
    queryKey: ['analytics-daily'],
    queryFn: async () =>
      asArray<Record<string, unknown>>(await analyticsApi.daily(14)).map((row) => ({
        label: str(row?.label),
        leadsCreated: num(row?.leadsCreated),
        msgsSent: num(row?.msgsSent),
        replies: num(row?.replies),
      })),
    refetchInterval: 60_000,
  })

  // ── Distributions (country + tier) ──
  const {
    data: charts,
    isLoading: chartsLoading,
    error: chartsError,
    refetch: refetchCharts,
  } = useQuery({
    queryKey: ['analytics-charts', timezoneOffset],
    queryFn: async () => {
      const res = (await api.get<unknown>(`/stats/charts?days=30&tzOffset=${timezoneOffset}`)) as
        | Record<string, unknown>
        | undefined
      return {
        countryDist: toDist(res?.countryDist, 'country', 'Unknown'),
        tierDist: toDist(res?.tierDist, 'leadTier', 'Unscored'),
      }
    },
    refetchInterval: 120_000,
  })

  // ── Funnel ──
  const {
    data: funnel,
    isLoading: funnelLoading,
    error: funnelError,
    refetch: refetchFunnel,
  } = useQuery({
    queryKey: ['analytics-funnel', range],
    queryFn: async () => {
      const res = (await analyticsApi.funnel(range)) as Record<string, unknown> | undefined
      const avg = res?.avgReplyHours
      return {
        total: num(res?.total),
        paused: num(res?.paused),
        waUnavailable: num(res?.waUnavailable),
        avgReplyHours: typeof avg === 'number' && Number.isFinite(avg) ? avg : null,
        stages: asArray<Record<string, unknown>>(res?.funnel).map((s, i) => ({
          stage: str(s?.stage, `stage-${i}`),
          label: str(s?.label, str(s?.stage, `Stage ${i + 1}`)),
          count: num(s?.count),
          cumulative: num(s?.cumulative),
          conversionRate: num(s?.conversionRate),
          dropoff: num(s?.dropoff),
        })) satisfies FunnelStageRow[],
      }
    },
    refetchInterval: 120_000,
  })

  // ── Campaign ROI ──
  const {
    data: campaignRoi,
    isLoading: roiLoading,
    error: roiError,
    refetch: refetchRoi,
  } = useQuery({
    queryKey: ['analytics-campaign-roi', range],
    queryFn: async () => {
      const res = (await analyticsApi.campaignRoi(range)) as Record<string, unknown> | undefined
      const pipeline = (res?.pipeline ?? {}) as Record<string, unknown>
      return {
        pipeline: {
          totalDealValue: num(pipeline.totalDealValue),
          convertedLeads: num(pipeline.convertedLeads),
          avgDealValue: num(pipeline.avgDealValue),
        },
        campaigns: asArray<Record<string, unknown>>(res?.campaigns).map((c, i) => ({
          id: num(c?.id) || i,
          name: str(c?.name, 'Untitled campaign'),
          sent: num(c?.sent),
          replied: num(c?.replied),
          replyRate: num(c?.replyRate),
          converted: num(c?.converted),
          revenue: num(c?.revenue),
        })) satisfies CampaignRow[],
      }
    },
    refetchInterval: 120_000,
  })

  // ── Team performance ──
  const {
    data: teamStats = [],
    isLoading: teamLoading,
    error: teamError,
    refetch: refetchTeam,
  } = useQuery<TeamRow[]>({
    queryKey: ['analytics-team'],
    queryFn: async () =>
      asArray<Record<string, unknown>>(await api.get<unknown>('/analytics/team')).map((m, i) => ({
        id: num(m?.id) || i,
        name: str(m?.name, 'Unnamed'),
        role: str(m?.role, '—'),
        leadsAssigned: num(m?.leadsAssigned),
        replied: num(m?.replied),
        closed: num(m?.closed),
        avgScore: num(m?.avgScore),
        conversionRate: num(m?.conversionRate),
      })),
    refetchInterval: 120_000,
  })

  const leadsCreated = daily.reduce((a, d) => a + d.leadsCreated, 0)
  const msgsSent = daily.reduce((a, d) => a + d.msgsSent, 0)
  const replies = daily.reduce((a, d) => a + d.replies, 0)
  const replyRate = msgsSent > 0 ? (replies / msgsSent) * 100 : 0
  const hasDaily = daily.some((d) => d.leadsCreated + d.msgsSent + d.replies > 0)

  const countryData = (charts?.countryDist ?? []).slice(0, 8)
  const countryTotal = countryData.reduce((sum, c) => sum + c.value, 0)

  // Tier is an ordered scale, so it gets the sequential ramp rather than eight
  // categorical hues. The ramp runs light→dark, and HOT is listed first, so it
  // is reversed to put the strongest step on the hottest tier.
  const TIER_ORDER = ['HOT', 'WARM', 'COLD']
  const tierData = [...(charts?.tierDist ?? [])].sort((a, b) => {
    const ai = TIER_ORDER.indexOf(a.name.toUpperCase())
    const bi = TIER_ORDER.indexOf(b.name.toUpperCase())
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
  const tierRamp = chartTheme.sequential(tierData.length).reverse()

  const funnelRamp = chartTheme.sequential(funnel?.stages.length ?? 0)
  // Darkest = largest, so the ramp direction matches the sort order.
  const countryRamp = chartTheme.sequential(countryData.length).reverse()

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Analytics"
        description={
          funnel ? (
            <>
              <span className="tabular-nums">{formatCount(funnel.total)}</span>{' '}
              {funnel.total === 1 ? 'active lead' : 'active leads'} over the last 30 days
            </>
          ) : (
            'Outreach and conversion performance over the last 30 days.'
          )
        }
      />

      {/* Headline metrics — 14-day activity */}
      {dailyLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={0} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Users}
            label="Leads created"
            value={formatCount(leadsCreated)}
            hint="Last 14 days"
            trend={daily.map((d) => d.leadsCreated)}
          />
          <MetricCard
            icon={Send}
            label="Messages sent"
            value={formatCount(msgsSent)}
            hint="Last 14 days"
            trend={daily.map((d) => d.msgsSent)}
          />
          <MetricCard
            icon={MessageSquare}
            label="Replies received"
            value={formatCount(replies)}
            hint="Last 14 days"
            trend={daily.map((d) => d.replies)}
          />
          <MetricCard
            icon={TrendingUp}
            label="Reply rate"
            value={`${replyRate.toFixed(1)}%`}
            hint={`${formatCount(replies)} of ${formatCount(msgsSent)} sent`}
          />
        </div>
      )}

      {/* Daily activity */}
      <SectionCard title="Outreach volume" description="Messages sent per day, last 14 days.">
        {dailyError ? (
          <ErrorState
            compact
            title="Couldn't load daily activity"
            description={(dailyError as Error).message}
            onRetry={() => refetchDaily()}
          />
        ) : dailyLoading ? (
          <div className="h-64 animate-pulse rounded-md bg-surface-raised" />
        ) : !hasDaily ? (
          <SectionMessage>No activity recorded in this window yet.</SectionMessage>
        ) : (
          <ChartFrame
            className="h-64"
            fallback={<div className="h-full rounded-md bg-surface-raised" />}
          >
            {({ width, height }) => (
              <BarChart
                width={width}
                height={height}
                data={daily}
                barGap={2}
                margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
              >
                <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke={chartTheme.axis}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  stroke={chartTheme.axis}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                  tickFormatter={(v: number) => formatNumber(v)}
                />
                <Tooltip
                  contentStyle={chartTheme.tooltip}
                  itemStyle={{ color: 'var(--color-text-primary)' }}
                  labelStyle={{ color: 'var(--color-text-secondary)' }}
                  cursor={{ fill: chartTheme.grid, fillOpacity: 0.5 }}
                  formatter={(value, name) =>
                    [formatCount(Number(value)), String(name)] as [string, string]
                  }
                />
                {/* One series, one axis. Messages sent runs an order of
                    magnitude above leads and replies, so plotting all three
                    here flattened the smaller two into invisible slivers.
                    They get their own chart below, on a scale they can be
                    read at. A single series needs no legend — the title
                    names it. */}
                <Bar
                  isAnimationActive={false}
                  dataKey="msgsSent"
                  name="Sent"
                  fill={chartTheme.palette[2]}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            )}
          </ChartFrame>
        )}
      </SectionCard>

      {/* Leads and replies share a scale with each other but not with sends,
          so they are readable together here and were not above. */}
      <SectionCard title="Lead flow" description="New leads and replies received, last 14 days.">
        {dailyError ? (
          <ErrorState
            compact
            title="Couldn't load lead flow"
            description={(dailyError as Error).message}
            onRetry={() => refetchDaily()}
          />
        ) : dailyLoading ? (
          <div className="h-56 animate-pulse rounded-md bg-surface-raised" />
        ) : !hasDaily ? (
          <SectionMessage>No activity recorded in this window yet.</SectionMessage>
        ) : (
          <ChartFrame
            className="h-56"
            fallback={<div className="h-full rounded-md bg-surface-raised" />}
          >
            {({ width, height }) => (
              <BarChart
                width={width}
                height={height}
                data={daily}
                barGap={2}
                margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
              >
                <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke={chartTheme.axis}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  stroke={chartTheme.axis}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                  tickFormatter={(v: number) => formatNumber(v)}
                />
                <Tooltip
                  contentStyle={chartTheme.tooltip}
                  itemStyle={{ color: 'var(--color-text-primary)' }}
                  labelStyle={{ color: 'var(--color-text-secondary)' }}
                  cursor={{ fill: chartTheme.grid, fillOpacity: 0.5 }}
                  formatter={(value, name) =>
                    [formatCount(Number(value)), String(name)] as [string, string]
                  }
                />
                {/* Two series, so a legend is required — identity is never
                    carried by colour alone. Slots 0 and 5 skip crimson and
                    amber, which read as danger and warning in this system. */}
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '0.75rem', paddingTop: 8 }}
                  formatter={(value: string) => (
                    <span className="text-text-secondary">{value}</span>
                  )}
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="leadsCreated"
                  name="Leads created"
                  fill={chartTheme.palette[0]}
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="replies"
                  name="Replies"
                  fill={chartTheme.palette[5]}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            )}
          </ChartFrame>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Country distribution */}
        <SectionCard
          title="Leads by country"
          description="Top eight countries by lead volume, last 30 days."
        >
          {chartsError ? (
            <ErrorState
              compact
              title="Couldn't load country data"
              description={(chartsError as Error).message}
              onRetry={() => refetchCharts()}
            />
          ) : chartsLoading ? (
            <div className="h-40 animate-pulse rounded-md bg-surface-raised" />
          ) : countryData.length === 0 ? (
            <SectionMessage>No country recorded on leads in this window.</SectionMessage>
          ) : (
            /* A ranked list IS the right form here — this is top-N by volume.
               It is the only panel on the page that stays one, now that the
               parts-of-a-whole and ordered-stage panels use their own forms. */
            <BarList
              formatValue={formatCount}
              items={countryData.map((c, i) => ({
                label: c.name,
                value: c.value,
                display: `${formatCount(c.value)}  ·  ${countryTotal > 0 ? ((c.value / countryTotal) * 100).toFixed(0) : 0}%`,
                color: countryRamp[i],
              }))}
            />
          )}
        </SectionCard>

        {/* Tier distribution */}
        <SectionCard title="Leads by tier" description="Score band across the same window.">
          {chartsError ? (
            <ErrorState
              compact
              title="Couldn't load tier data"
              description={(chartsError as Error).message}
              onRetry={() => refetchCharts()}
            />
          ) : chartsLoading ? (
            <div className="h-40 animate-pulse rounded-md bg-surface-raised" />
          ) : tierData.length === 0 ? (
            <SectionMessage>No leads have been scored in this window.</SectionMessage>
          ) : (
            /* HOT/WARM/COLD are shares of one population, so they belong in
               one segmented bar. As three separate bars the fact that they sum
               to the whole was invisible, and it took three rows to say less. */
            <CategoryBar
              formatValue={formatCount}
              segments={tierData.map((t, i) => ({
                label: t.name,
                value: t.value,
                color: tierRamp[i],
              }))}
            />
          )}
        </SectionCard>
      </div>

      {/* Conversion funnel */}
      <SectionCard
        title="Conversion funnel"
        description="Current-status progression across active leads, last 30 days."
      >
        {funnelError ? (
          <ErrorState
            compact
            title="Couldn't load the funnel"
            description={(funnelError as Error).message}
            onRetry={() => refetchFunnel()}
          />
        ) : funnelLoading ? (
          <div className="h-48 animate-pulse rounded-md bg-surface-raised" />
        ) : !funnel || funnel.stages.length === 0 ? (
          <SectionMessage>No funnel data for this window yet.</SectionMessage>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Figure label="Active base" value={formatCount(funnel.total)} />
              <Figure label="Paused" value={formatCount(funnel.paused)} />
              <Figure label="No WhatsApp" value={formatCount(funnel.waUnavailable)} />
              <Figure
                label="Avg reply"
                value={funnel.avgReplyHours == null ? '—' : `${funnel.avgReplyHours}h`}
              />
            </div>
            {/* Stages have an inherent order, so they take the sequential ramp
                rather than eight unrelated hues. */}
            <div className="mt-5 space-y-3">
              {funnel.stages.map((stage, i) => {
                const reachedPct = funnel.total > 0 ? (stage.cumulative / funnel.total) * 100 : 0
                return (
                  <div key={stage.stage} className="rounded-md border border-border p-3">
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="min-w-0 truncate font-medium text-text-primary">
                        {stage.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-text-muted">
                        <span className="font-semibold text-text-primary">
                          {formatCount(stage.cumulative)}
                        </span>{' '}
                        {reachedPct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                          width: `${Math.max(reachedPct, stage.cumulative > 0 ? 1.5 : 0)}%`,
                          backgroundColor: funnelRamp[i],
                        }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-text-muted">
                      <span>At this stage {formatCount(stage.count)}</span>
                      <span>Step conversion {stage.conversionRate.toFixed(1)}%</span>
                      {stage.dropoff > 0 && <span>Drop-off {stage.dropoff.toFixed(1)}%</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </SectionCard>

      {/* Campaign ROI */}
      <SectionCard
        title="Campaign ROI"
        description="Campaign-attributed closed revenue and conversion, last 30 days."
      >
        {roiError ? (
          <ErrorState
            compact
            title="Couldn't load campaign ROI"
            description={(roiError as Error).message}
            onRetry={() => refetchRoi()}
          />
        ) : roiLoading ? (
          <div className="h-40 animate-pulse rounded-md bg-surface-raised" />
        ) : !campaignRoi || campaignRoi.campaigns.length === 0 ? (
          <SectionMessage>No campaigns ran in this window.</SectionMessage>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Figure label="Revenue" value={formatCurrency(campaignRoi.pipeline.totalDealValue, home)} />
              <Figure label="Converted" value={formatCount(campaignRoi.pipeline.convertedLeads)} />
              <Figure label="Avg deal" value={formatCurrency(campaignRoi.pipeline.avgDealValue, home)} />
            </div>

            {/* Mobile */}
            <div className="mt-5 space-y-2 md:hidden">
              {campaignRoi.campaigns.map((camp) => (
                <div key={camp.id} className="rounded-md border border-border p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-[13px] font-medium text-text-primary">
                      {camp.name}
                    </p>
                    <p className="shrink-0 text-[13px] font-semibold tabular-nums text-text-primary">
                      {formatCurrency(camp.revenue, home)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-text-muted">
                    <span>Sent {formatCount(camp.sent)}</span>
                    <span>Replies {formatCount(camp.replied)}</span>
                    <span>Reply {camp.replyRate.toFixed(1)}%</span>
                    <span>Converted {formatCount(camp.converted)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="mt-5 hidden overflow-x-auto md:block">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] text-text-muted">
                    <th className="py-2 text-left font-medium">Campaign</th>
                    <th className="py-2 text-right font-medium">Sent</th>
                    <th className="py-2 text-right font-medium">Replies</th>
                    <th className="py-2 text-right font-medium">Reply %</th>
                    <th className="py-2 text-right font-medium">Converted</th>
                    <th className="py-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignRoi.campaigns.map((camp) => (
                    <tr
                      key={camp.id}
                      className="border-b border-border-subtle transition-colors last:border-0 hover:bg-surface-raised"
                    >
                      <td className="py-2 pr-3 font-medium text-text-primary">{camp.name}</td>
                      <td className="py-2 text-right tabular-nums text-text-secondary">
                        {formatCount(camp.sent)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-text-secondary">
                        {formatCount(camp.replied)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-text-secondary">
                        {camp.replyRate.toFixed(1)}%
                      </td>
                      <td className="py-2 text-right tabular-nums text-text-secondary">
                        {formatCount(camp.converted)}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums text-text-primary">
                        {formatCurrency(camp.revenue, home)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>

      {/* Team performance */}
      <SectionCard
        title="Team performance"
        description="Leads assigned, replied and closed per agent."
      >
        {teamError ? (
          <ErrorState
            compact
            title="Couldn't load team performance"
            description={(teamError as Error).message}
            onRetry={() => refetchTeam()}
          />
        ) : teamLoading ? (
          <div className="h-40 animate-pulse rounded-md bg-surface-raised" />
        ) : teamStats.length === 0 ? (
          <SectionMessage>No agents have leads assigned yet.</SectionMessage>
        ) : (
          <>
            {/* Mobile */}
            <div className="space-y-2 md:hidden">
              {teamStats.map((member) => (
                <div key={member.id} className="rounded-md border border-border p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-text-primary">
                        {member.name}
                      </p>
                      <p className="text-[11px] capitalize text-text-muted">{member.role}</p>
                    </div>
                    <p className="shrink-0 text-[13px] font-semibold tabular-nums text-text-primary">
                      {member.conversionRate.toFixed(1)}%
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-text-muted">
                    <span>Assigned {formatCount(member.leadsAssigned)}</span>
                    <span>Replied {formatCount(member.replied)}</span>
                    <span>Closed {formatCount(member.closed)}</span>
                    <span>Avg score {formatCount(member.avgScore)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] text-text-muted">
                    <th className="py-2 text-left font-medium">Agent</th>
                    <th className="py-2 text-right font-medium">Assigned</th>
                    <th className="py-2 text-right font-medium">Replied</th>
                    <th className="py-2 text-right font-medium">Closed</th>
                    <th className="py-2 text-right font-medium">Avg score</th>
                    <th className="py-2 text-right font-medium">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {teamStats.map((member) => (
                    <tr
                      key={member.id}
                      className="border-b border-border-subtle transition-colors last:border-0 hover:bg-surface-raised"
                    >
                      <td className="py-2 pr-3">
                        <p className="font-medium text-text-primary">{member.name}</p>
                        <p className="text-[11px] capitalize text-text-muted">{member.role}</p>
                      </td>
                      <td className="py-2 text-right tabular-nums text-text-secondary">
                        {formatCount(member.leadsAssigned)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-text-secondary">
                        {formatCount(member.replied)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-text-secondary">
                        {formatCount(member.closed)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-text-secondary">
                        {formatCount(member.avgScore)}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums text-text-primary">
                        {member.conversionRate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}
