import { Suspense, lazy, useDeferredValue, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Inbox, ListChecks, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inboxApi } from '@/api/endpoints/inbox'
import type { ConversationChannel, InboxThreadState } from '@/api/types'
import { ThreadListItem } from '@/components/inbox/thread-list-item'
import { OtherEmail } from '@/components/inbox/other-email'
import {
  MobileError,
  MobilePagination,
  MobileRefresh,
  mobileSearchParams,
  mobileInput,
  mobileLeadId,
} from '@/components/mobile/mobile-shared'
import { CONVERSATION_CHANNELS, CHANNELS } from '@/lib/channels'
import { loadDraft } from '@/lib/email-drafts'
import { useAuthStore, usePrivateSalesAgent } from '@/stores/auth-store'
import { ClaimableInbounds } from '@/components/inbox/claimable-inbounds'

const MobileConversation = lazy(() =>
  import('@/components/mobile/conversation').then((module) => ({
    default: module.MobileConversation,
  })),
)

export default function MobileInboxPage() {
  const privateSales = usePrivateSalesAgent()
  const { dashboardScope, hasCapability, user } = useAuthStore()
  const [params, setParams] = useSearchParams()
  const selected = mobileLeadId(params.get('leadId'))
  const search = params.get('search') || ''
  const deferred = useDeferredValue(search.trim())
  const channelValue = params.get('filterChannel') as ConversationChannel
  const channel = CONVERSATION_CHANNELS.includes(channelValue) ? channelValue : 'all'
  const queueValue = params.get('state') as InboxThreadState
  const queue = ['all', 'needs_reply', 'waiting', 'resolved'].includes(queueValue) ? queueValue : 'needs_reply'
  const assignment = privateSales ? 'mine' : params.get('assignment') === 'everyone' ? 'everyone'
    : params.get('assignment') === 'unassigned' ? 'unassigned'
      : user?.role !== 'viewer' && (params.get('assignment') === 'mine' || user?.role === 'agent') ? 'mine' : 'everyone'
  const page = mobileLeadId(params.get('page')) ?? 1
  const updateParams = (values: Record<string, string | null>, replace = true) => {
    setParams(mobileSearchParams(values), { replace, preventScrollReset: true })
  }
  const result = useQuery({
    refetchOnWindowFocus: true,
    queryKey: ['inbox-threads', 'mobile', dashboardScope, deferred, channel, queue, assignment, page],
    queryFn: () =>
      inboxApi.listThreads({
        channel: channel === 'all' ? undefined : channel,
        state: queue === 'all' ? undefined : queue,
        search: deferred || undefined,
        assignedToMe: assignment === 'mine' || undefined,
        assigned: assignment === 'unassigned' ? false : undefined,
        page,
        limit: 25,
      }),
    refetchInterval: 15_000,
    enabled: !selected,
  })
  const totalPages = Math.max(1, result.data?.pages ?? 1)
  useEffect(() => {
    if (selected || !result.data || page <= totalPages) return
    if (new URLSearchParams(window.location.search).toString() !== params.toString()) return
    const next = new URLSearchParams(params)
    if (totalPages > 1) next.set('page', String(totalPages))
    else next.delete('page')
    setParams(next, { replace: true, preventScrollReset: true })
  }, [page, params, result.data, selected, setParams, totalPages])

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
          selectedChannel={params.get('channel')}
          selectedEmailAccountId={mobileLeadId(params.get('accountId'))}
          selectedEmailReplyId={mobileLeadId(params.get('replyMessageId'))}
          onClose={() => updateParams({ leadId: null, channel: null, accountId: null, replyMessageId: null, threadKey: null })}
          onReplyContextChange={({ channel: nextChannel, accountId, replyMessageId }) =>
            updateParams({
              channel: nextChannel,
              ...(accountId !== undefined ? { accountId: accountId ? String(accountId) : null } : {}),
              replyMessageId: replyMessageId ? String(replyMessageId) : null,
            })
          }
        />
      </Suspense>
    )
  const rows = result.data?.threads ?? []
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MobileRefresh updatedAt={result.dataUpdatedAt} refreshing={result.isFetching}
          stale={result.isRefetchError} retry={() => void result.refetch()} />
        {privateSales && <ClaimableInbounds onClaim={leadId => updateParams({ leadId: String(leadId), channel: 'whatsapp', accountId: null, replyMessageId: null, threadKey: null }, false)} />}
        <OtherEmail />
        {hasCapability('page.campaigns') && (
          <Button asChild size="sm" variant="secondary" className="min-h-11">
            <Link to="/delivery">
              <ListChecks className="size-4" aria-hidden="true" />
              Delivery review
            </Link>
          </Button>
        )}
      </div>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-text-muted" />
        <span className="sr-only">Search conversations</span>
        <input
          type="search"
          className={`${mobileInput} pl-9`}
          value={search}
          onChange={(event) => updateParams({ search: event.target.value || null, page: null })}
          placeholder="Search conversations"
        />
      </label>
      {!privateSales && <label className="flex items-center justify-between gap-2 text-sm text-text-secondary">
        Assigned to
        <select aria-label="Conversation assignment" className="min-h-11 rounded-lg bg-surface px-3 text-base"
          value={assignment} onChange={event => updateParams({ assignment: event.target.value, page: null })}>
          <option value="everyone">Everyone</option>
          {user?.role !== 'viewer' && <option value="mine">Me</option>}
          <option value="unassigned">Unassigned</option>
        </select>
      </label>}
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
            onClick={() => updateParams({ state: value === 'needs_reply' ? null : value, page: null })}
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
          onChange={(event) => updateParams({ filterChannel: event.target.value === 'all' ? null : event.target.value, page: null })}
        >
          <option value="all">All channels</option>
          {CONVERSATION_CHANNELS.map((id) => (
            <option key={id} value={id}>
              {CHANNELS[id].label}
            </option>
          ))}
        </select>
      </label>
      {result.isPending && result.fetchStatus !== 'paused' ? (
        <p role="status" className="py-10 text-center text-sm text-text-muted">
          Loading conversations…
        </p>
      ) : result.fetchStatus === 'paused' && !result.data ? null : result.isLoadingError ? (
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
                    const accountId = draft?.senderAccountId ??
                      (thread.channel === 'email' ? thread.senderAccountId : null)
                    updateParams({
                      leadId: String(thread.leadId),
                      channel: draft?.channel ?? thread.channel,
                      accountId: accountId ? String(accountId) : null,
                      threadKey: thread.threadKey,
                      replyMessageId: null,
                    }, false)
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface p-8 text-center">
              <Inbox className="mx-auto h-8 w-8 text-accent" />
              <h2 className="mt-3 font-medium">
                {deferred || channel !== 'all'
                  ? 'No matching conversations'
                  : queue === 'needs_reply'
                    ? 'All caught up'
                    : queue === 'waiting'
                      ? 'No conversations waiting for a reply'
                      : queue === 'resolved' ? 'No resolved conversations' : 'No conversations yet'}
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
          <MobilePagination page={page} pages={result.data?.pages ?? 1} onChange={value => updateParams({ page: value > 1 ? String(value) : null })} />
        </>
      )}
    </div>
  )
}
