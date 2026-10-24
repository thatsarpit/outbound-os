import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Download,
  History,
  UserPlus,
} from 'lucide-react'
import { activityApi } from '@/api/endpoints/activity'
import type { ActivityLog } from '@/api/types'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, formatRelativeTime } from '@/lib/utils'

/**
 * Recorded workspace events. Coverage is explicit rather than an invented audit trail.
 *
 * `activityApi` shipped complete and was imported by nothing, so the question
 * "who changed this, and when" had no answer anywhere in the product. It is
 * the first thing a buyer with a compliance team asks about.
 */

type ActivityTone = 'neutral' | 'success' | 'danger' | 'info'

const TYPE_META: Record<string, { label: string; icon: React.ElementType; tone: ActivityTone }> = {
  lead_created: { label: 'Lead created', icon: UserPlus, tone: 'info' },
  lead_imported: { label: 'Lead imported', icon: Download, tone: 'info' },
  reply_received: { label: 'Reply received', icon: ArrowDownLeft, tone: 'success' },
  message_sent: { label: 'Message sent', icon: ArrowUpRight, tone: 'neutral' },
  message_failed: { label: 'Send failed', icon: AlertTriangle, tone: 'danger' },
  system_error: { label: 'System error', icon: AlertTriangle, tone: 'danger' },
}

const TONE_CLASSES: Record<ActivityTone, string> = {
  neutral: 'text-text-muted',
  success: 'text-success',
  danger: 'text-danger',
  info: 'text-info',
}

/**
 * The API composes `message` as an HTML string with lead names interpolated
 * unescaped, and decorates it with emoji. Lead names arrive from third-party
 * imports, so this is rendered as text and never as markup — a lead called
 * `<img onerror=...>` would otherwise execute. Icons carry what the emoji did.
 */
function toPlainText(message: string): string {
  return (
    message
      .replace(/<[^>]*>/g, '')
      // `Extended_Pictographic` is the Unicode property for emoji; hand-rolled
      // ranges also swept up regional indicators, which combine into flags.
      .replace(/\p{Extended_Pictographic}\uFE0F?/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}

function getTimestamp(item: ActivityLog): string {
  return item.timestamp || item.createdAt || ''
}

/** Only lead events carry a resolvable id (`lead_42`); message ids do not. */
function getLeadId(item: ActivityLog): number | null {
  if (typeof item.leadId === 'number') return item.leadId
  const match = String(item.id).match(/^lead_(\d+)$/)
  return match ? Number(match[1]) : null
}

function dayLabel(iso: string): string {
  if (!iso) return 'Earlier'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Earlier'
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(date, today)) return 'Today'
  if (same(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ActivityPage() {
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  const {
    data: response,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['activity-records', page, typeFilter],
    queryFn: async () => {
      const result = await activityApi.records({ page, type: typeFilter })
      if (!result || !Array.isArray(result.items))
        throw new Error('Recorded activity is unavailable.')
      return result
    },
    refetchInterval: 60_000,
  })

  const activity = useMemo(() => response?.items ?? [], [response])
  const availableTypes = response?.types ?? []
  const filtered = activity

  const grouped = useMemo(() => {
    const groups = new Map<string, ActivityLog[]>()
    for (const item of filtered) {
      const key = dayLabel(getTimestamp(item))
      const bucket = groups.get(key)
      if (bucket) bucket.push(item)
      else groups.set(key, [item])
    }
    return [...groups.entries()]
  }, [filtered])

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Activity"
        description="Persisted workspace events. Older actions and event types without logging may not appear here."
      />

      <SectionCard
        title="Recent events"
        description={isLoading ? undefined : `${response?.total ?? 0} recorded events`}
        action={
          availableTypes.length > 1 ? (
            <div className="flex max-w-full flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('all')
                  setPage(1)
                }}
                aria-pressed={typeFilter === 'all'}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] transition-colors',
                  typeFilter === 'all'
                    ? 'bg-surface-raised font-medium text-text-primary'
                    : 'text-text-muted hover:text-text-primary',
                )}
              >
                All
              </button>
              {availableTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setTypeFilter(type)
                    setPage(1)
                  }}
                  aria-pressed={typeFilter === type}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] transition-colors',
                    typeFilter === type
                      ? 'bg-surface-raised font-medium text-text-primary'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {TYPE_META[type]?.label || type.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          ) : undefined
        }
      >
        {isLoading ? (
          <LoadingState variant="card" />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            tone={typeFilter === 'all' ? 'waiting' : 'filtered'}
            icon={History}
            title={typeFilter === 'all' ? 'No activity yet' : 'Nothing of that kind'}
            description={
              typeFilter === 'all'
                ? 'Lead captures, sends and replies will appear here as traffic starts flowing.'
                : 'Try a different event type.'
            }
          />
        ) : (
          <div className="space-y-6">
            {grouped.map(([label, items]) => (
              <section key={label}>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                  {label}
                </h3>
                <ul className="mt-2 divide-y divide-border-subtle">
                  {items.map((item) => {
                    const meta = TYPE_META[item.type] ?? {
                      label: item.type,
                      icon: History,
                      tone: 'neutral' as ActivityTone,
                    }
                    const Icon = meta.icon
                    const leadId = getLeadId(item)
                    const text = toPlainText(item.message)

                    const row = (
                      <>
                        <Icon
                          aria-hidden="true"
                          className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', TONE_CLASSES[meta.tone])}
                        />
                        <span className="min-w-0 flex-1 text-[13px] text-text-secondary">
                          {text}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
                          {formatRelativeTime(getTimestamp(item))}
                        </span>
                        {leadId && (
                          <ChevronRight
                            aria-hidden="true"
                            className="h-3.5 w-3.5 shrink-0 text-text-muted"
                          />
                        )}
                      </>
                    )

                    return (
                      <li key={String(item.id)}>
                        {leadId ? (
                          <Link
                            to={`/leads?leadId=${leadId}`}
                            className="-mx-2 flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-surface-raised"
                          >
                            {row}
                          </Link>
                        ) : (
                          <div className="flex items-start gap-2.5 px-0 py-2">{row}</div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
        {(response?.pages ?? 1) > 1 && (
          <nav
            aria-label="Activity pages"
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
              Page {page} of {response?.pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= (response?.pages ?? 1)}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </nav>
        )}
      </SectionCard>
    </div>
  )
}
