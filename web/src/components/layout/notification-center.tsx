import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { Bell, CheckCircle2, Info, Loader2, Pause, TriangleAlert, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { leadsApi } from '@/api/endpoints/leads'
import { useDashboardNotifications } from '@/hooks/use-dashboard-notifications'
import { getChannel } from '@/lib/channels'
import { invalidateLeadSurfaceQueries } from '@/lib/lead-automation'
import {
  useNotificationStore,
  type DashboardNotification,
  type NotificationSeverity,
} from '@/stores/notification-store'
import { toast } from '@/stores/toast-store'
import { cn, formatDate } from '@/lib/utils'

/**
 * Notification centre — the bell in the top bar.
 *
 * The panel used to be a stack of cards: a header carrying a description line,
 * a synced line, a connection pill and a count pill; rows with a 36px icon tile,
 * an uppercase kind badge, three filled meta pills and a duplicate "open"
 * button below the row that was already a link. Six notifications did not fit.
 *
 * It is now one dense list. Each row is a single hairline-separated line block:
 * an unread dot, a severity glyph, the title and relative time on one line, the
 * message on the next, and channel / lead / account as one quiet meta line.
 * The whole block is the link, so the per-row CTA is gone (its wording survives
 * as the link's title attribute). Connection state and last sync moved to the
 * footer, where they belong — they are status, not the headline.
 */

const SEVERITY: Record<NotificationSeverity, { icon: LucideIcon; className: string }> = {
  error: { icon: XCircle, className: 'text-danger' },
  warning: { icon: TriangleAlert, className: 'text-warning' },
  success: { icon: CheckCircle2, className: 'text-success' },
  // Info is the "nothing is wrong" case, so it stays ink rather than spending a
  // colour on it — colour in this system means something happened.
  info: { icon: Info, className: 'text-text-muted' },
}

function buildInboxHref(item: DashboardNotification) {
  const params = new URLSearchParams()
  if (item.leadId) params.set('leadId', String(item.leadId))
  if (item.channel) params.set('channel', item.channel)
  if (item.threadKey) params.set('threadKey', item.threadKey)
  const query = params.toString()
  return query ? `/inbox?${query}` : '/inbox'
}

function getNotificationDestination(item: DashboardNotification) {
  const normalized = item.kind.toLowerCase()
  const inboxEligible =
    Boolean(item.leadId) &&
    (normalized.includes('reply') ||
      normalized.includes('manual_reply') ||
      normalized.includes('email_sent') ||
      normalized.includes('email_failed') ||
      normalized.includes('message_failed'))

  if (inboxEligible) {
    return {
      href: buildInboxHref(item),
      cta:
        item.channel === 'email'
          ? 'Open email thread'
          : item.channel === 'whatsapp'
            ? 'Open WhatsApp thread'
            : item.channel === 'imessage'
              ? 'Open iMessage thread'
              : item.channel === 'telegram'
                ? 'Open Telegram thread'
                : 'Open thread',
    }
  }

  if (normalized.includes('sync_failed')) {
    return { href: '/integrations', cta: 'Open integrations' }
  }
  if (
    normalized.includes('lead') ||
    normalized.includes('task') ||
    normalized.includes('intervention')
  ) {
    return { href: '/leads', cta: 'Open leads' }
  }
  if (normalized.includes('campaign')) {
    return { href: '/campaigns', cta: 'Open campaigns' }
  }
  if (normalized.includes('import')) {
    return { href: '/import', cta: 'Open import' }
  }
  if (normalized.includes('wa') || normalized.includes('system')) {
    return { href: '/integrations', cta: 'Open integrations' }
  }

  return { href: '/overview', cta: 'Open overview' }
}

function canPauseLead(item: DashboardNotification) {
  if (!item.leadId) return false
  const normalized = item.kind.toLowerCase()
  if (normalized.includes('manual_reply') || normalized.includes('email_sent')) return false
  return (
    normalized.includes('reply') ||
    normalized.includes('intervention') ||
    normalized.includes('task_due') ||
    normalized.includes('failed')
  )
}

function NotificationRow({
  item,
  pausePending,
  onOpen,
  onPause,
}: {
  item: DashboardNotification
  pausePending: boolean
  onOpen: (id: string) => void
  onPause: (item: DashboardNotification) => void
}) {
  const severity = SEVERITY[item.severity]
  const SeverityIcon = severity.icon
  const destination = getNotificationDestination(item)
  const channel = item.channel ? getChannel(item.channel) : null
  const ChannelIcon = channel?.icon
  const showPause = canPauseLead(item)

  const details: string[] = []
  if (item.leadId) details.push(`Lead #${item.leadId}`)
  if (item.accountId) details.push(`Account #${item.accountId}`)
  const hasMeta = Boolean(channel) || details.length > 0 || showPause

  return (
    <div className="flex gap-2 border-b border-border-subtle px-3 py-2 transition-colors last:border-b-0 hover:bg-surface-raised/60">
      {/* Unread lives in its own narrow column so titles stay aligned. */}
      <span className="flex w-1.5 shrink-0 justify-center pt-1.5">
        {!item.read && (
          <span className="h-1.5 w-1.5 rounded-full bg-focus" title="Unread" aria-label="Unread" />
        )}
      </span>

      <SeverityIcon
        aria-hidden="true"
        className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', severity.className)}
      />

      <div className="min-w-0 flex-1">
        <Link
          to={destination.href}
          title={destination.cta}
          onClick={() => onOpen(item.id)}
          className="block"
        >
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-[13px] text-text-primary',
                item.read ? 'font-medium' : 'font-semibold',
              )}
            >
              {item.title}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
              {formatDate(item.timestamp, 'relative')}
            </span>
          </span>
          <span className="mt-0.5 block line-clamp-2 text-xs leading-4 text-text-secondary">
            {item.message}
          </span>
        </Link>

        {hasMeta && (
          <div className="mt-1 flex items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-text-muted">
              {channel && ChannelIcon && (
                <>
                  <ChannelIcon
                    aria-hidden="true"
                    className={cn('h-3 w-3 shrink-0', channel.text)}
                  />
                  <span className="shrink-0">{channel.label}</span>
                </>
              )}
              {details.length > 0 && (
                <span className="truncate tabular-nums" title={details.join(' · ')}>
                  {channel ? `· ${details.join(' · ')}` : details.join(' · ')}
                </span>
              )}
            </span>
            {showPause && (
              <button
                type="button"
                onClick={() => onPause(item)}
                disabled={pausePending}
                className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-50"
              >
                {pausePending ? (
                  <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                ) : (
                  <Pause aria-hidden="true" className="h-3 w-3" />
                )}
                Pause lead
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function NotificationCenter() {
  useDashboardNotifications()
  const location = useLocation()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const {
    items,
    unreadCount,
    isConnected,
    connectionLabel,
    lastSyncedAt,
    markAllRead,
    markOneRead,
  } = useNotificationStore()

  const pauseLeadMutation = useMutation({
    mutationFn: ({ leadId }: { leadId: number; itemId: string }) =>
      leadsApi.updateLead(leadId, { status: 'paused' }),
    onSuccess: (_updatedLead, variables) => {
      invalidateLeadSurfaceQueries(queryClient)
      markOneRead(variables.itemId)
      toast.warning('Lead automation paused')
    },
    onError: (error: Error) => {
      toast.error(`Failed to pause lead: ${error.message}`)
    },
  })

  useEffect(() => {
    if (!isOpen) return

    const handleClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  const isLoading = connectionLabel === 'Connecting...'

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((open) => !open)
        }}
        aria-label={isOpen ? 'Close notifications' : 'Open notifications'}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          'relative inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors',
          'hover:bg-surface-raised hover:text-text-primary',
          isOpen && 'bg-surface-raised text-text-primary',
        )}
      >
        <Bell aria-hidden="true" className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-sm bg-accent px-1 text-[10px] font-semibold tabular-nums text-accent-fg">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            'absolute right-0 top-[calc(100%+0.375rem)] z-[120] overflow-hidden rounded-lg',
            'border border-border bg-surface-overlay shadow-md animate-fade-in',
            'w-[360px] max-w-[calc(100vw-1.5rem)]',
          )}
        >
          <div className="flex h-9 items-center gap-2 border-b border-border px-3">
            <p className="text-[13px] font-semibold text-text-primary">Notifications</p>
            {unreadCount > 0 && (
              <span className="rounded-sm bg-accent-muted px-1 py-px text-[11px] font-medium tabular-nums text-text-secondary">
                {unreadCount}
              </span>
            )}
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="ml-auto rounded-sm px-1 py-0.5 text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:pointer-events-none disabled:text-text-muted disabled:opacity-50"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-text-muted">
                {isLoading ? 'Loading notifications…' : 'No notifications yet.'}
              </p>
            ) : (
              items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  pausePending={
                    pauseLeadMutation.isPending && pauseLeadMutation.variables?.itemId === item.id
                  }
                  onOpen={(id) => {
                    markOneRead(id)
                    setIsOpen(false)
                  }}
                  onPause={(target) =>
                    pauseLeadMutation.mutate({ leadId: target.leadId!, itemId: target.id })
                  }
                />
              ))
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border bg-surface-raised/50 px-3 py-1.5">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted">
              <span
                aria-hidden="true"
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  isConnected ? 'bg-success' : 'bg-warning',
                )}
              />
              <span className="truncate">{connectionLabel}</span>
              {lastSyncedAt && (
                <span className="shrink-0 tabular-nums">
                  · {formatDate(lastSyncedAt, 'relative')}
                </span>
              )}
            </span>
            <Link
              to="/overview"
              onClick={() => setIsOpen(false)}
              className="ml-auto shrink-0 text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              All activity
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
