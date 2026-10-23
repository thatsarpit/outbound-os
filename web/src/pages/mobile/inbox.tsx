import { Suspense, lazy, useDeferredValue, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Inbox, Search } from 'lucide-react'
import { inboxApi } from '@/api/endpoints/inbox'
import type { InboxChannel, InboxThreadState } from '@/api/types'
import { ThreadListItem } from '@/components/inbox/thread-list-item'
import {
  MobileError,
  MobilePagination,
  MobileRefresh,
  mobileInput,
  mobileLeadId,
} from '@/components/mobile/mobile-shared'
import { CHANNEL_ORDER, CHANNELS } from '@/lib/channels'
import { loadDraft } from '@/lib/email-drafts'
import { useAuthStore } from '@/stores/auth-store'

const MobileConversation = lazy(() =>
  import('@/components/mobile/conversation').then((module) => ({
    default: module.MobileConversation,
  })),
)

export default function MobileInboxPage() {
  const { dashboardScope } = useAuthStore()
  const [params, setParams] = useSearchParams()
  const selected = mobileLeadId(params.get('leadId'))
  const [search, setSearch] = useState(params.get('search') || '')
  const deferred = useDeferredValue(search.trim())
  const [channel, setChannel] = useState<'all' | InboxChannel>(() =>
    CHANNEL_ORDER.includes(params.get('filterChannel') as InboxChannel)
      ? (params.get('filterChannel') as InboxChannel)
      : 'all',
  )
  const [queue, setQueue] = useState<InboxThreadState>(() => {
    const value = params.get('state') as InboxThreadState
    return ['all', 'needs_reply', 'waiting', 'resolved'].includes(value) ? value : 'needs_reply'
  })
  const [page, setPage] = useState(Math.max(1, Number(params.get('page')) || 1))
  const queueParams = () => {
    const next = new URLSearchParams()
    if (search.trim()) next.set('search', search.trim())
    if (channel !== 'all') next.set('filterChannel', channel)
    if (queue !== 'needs_reply') next.set('state', queue)
    if (page > 1) next.set('page', String(page))
    return next
  }
  const result = useQuery({
    refetchOnWindowFocus: true,
    queryKey: ['inbox-threads', 'mobile', dashboardScope, deferred, channel, queue, page],
    queryFn: () =>
      inboxApi.listThreads({
        channel: channel === 'all' ? undefined : channel,
        state: queue === 'all' ? undefined : queue,
        search: deferred || undefined,
        page,
        limit: 25,
      }),
    refetchInterval: 15_000,
    enabled: !selected,
  })
  useEffect(() => {
    if (result.data) setPage((current) => Math.min(current, Math.max(1, result.data?.pages ?? 1)))
  }, [result.data])

  if (selected)
    return (
      <Suspense
        fallback={
          <p role="status" className="p-4 text-sm text-text-muted">
            Loading conversation…
          </p>
        }
      >
        <MobileConversation
          key={`${dashboardScope}:${selected}`}
          leadId={selected}
          initialChannel={params.get('channel')}
          onClose={() => setParams(queueParams())}
          onChannelNavigate={(channel) =>
            setParams(
              () => {
                const next = queueParams()
                next.set('leadId', String(selected))
                next.set('channel', channel)
                return next
              },
              { replace: true },
            )
          }
        />
      </Suspense>
    )
  const rows = result.data?.threads ?? []
  return (
    <div className="space-y-4">
      <MobileRefresh updatedAt={result.dataUpdatedAt} refreshing={result.isFetching} />
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-text-muted" />
        <span className="sr-only">Search conversations</span>
        <input
          type="search"
          className={`${mobileInput} pl-9`}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
          placeholder="Search conversations"
        />
      </label>
      <div
        aria-label="Conversation status"
        className="flex rounded-lg border border-border bg-surface p-1"
      >
        {(
          [
            { value: 'needs_reply', label: 'Needs reply' },
            { value: 'all', label: 'All' },
            { value: 'waiting', label: 'Waiting' },
            { value: 'resolved', label: 'Done' },
          ] as const
        ).map(({ value, label }) => (
          <button
            type="button"
            key={value}
            aria-pressed={queue === value}
            onClick={() => {
              setQueue(value)
              setPage(1)
            }}
            className={`min-h-11 flex-1 whitespace-nowrap rounded-md px-1 text-xs ${queue === value ? 'bg-accent-muted font-medium text-accent' : 'text-text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-3 text-xs text-text-muted">
        Channel
        <select
          aria-label="Filter by channel"
          className="min-h-11 max-w-[70%] rounded-lg bg-surface px-3 text-base text-text-secondary"
          value={channel}
          onChange={(event) => {
            setChannel(event.target.value as typeof channel)
            setPage(1)
          }}
        >
          <option value="all">All channels</option>
          {CHANNEL_ORDER.map((id) => (
            <option key={id} value={id}>
              {CHANNELS[id].label}
            </option>
          ))}
        </select>
      </label>
      {result.isPending ? (
        <p role="status" className="py-10 text-center text-sm text-text-muted">
          Loading conversations…
        </p>
      ) : result.error ? (
        <MobileError message="Could not load conversations." retry={() => result.refetch()} />
      ) : (
        <>
          <p className="text-xs tabular-nums text-text-muted">
            {result.data?.total ?? rows.length}{' '}
            {queue === 'needs_reply' ? 'need a reply' : 'conversations'}
            {channel !== 'all' ? ` · ${CHANNELS[channel].label}` : ''}
          </p>
          {rows.length ? (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              {rows.map((thread) => (
                <ThreadListItem
                  key={thread.leadId}
                  mobile
                  thread={thread}
                  selected={false}
                  onSelect={() => {
                    const draft = loadDraft(dashboardScope, thread.leadId)
                    const next = queueParams()
                    next.set('leadId', String(thread.leadId))
                    next.set('channel', draft?.channel ?? thread.channel)
                    setParams(next)
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface p-8 text-center">
              <Inbox className="mx-auto h-8 w-8 text-accent" />
              <h2 className="mt-3 font-medium">
                {deferred
                  ? 'No matching conversations'
                  : queue === 'needs_reply'
                    ? 'All caught up'
                    : 'No conversations yet'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                {deferred
                  ? 'Try another name or clear the search.'
                  : queue === 'needs_reply'
                    ? 'Switch to All to review your conversation history.'
                    : 'Replies will appear here when a lead gets in touch.'}
              </p>
            </div>
          )}
          <MobilePagination page={page} pages={result.data?.pages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  )
}
