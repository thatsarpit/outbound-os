import { Suspense, lazy, useDeferredValue, useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Inbox, ListChecks, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inboxApi } from '@/api/endpoints/inbox'
import type { ConversationChannel, InboxThreadState } from '@/api/types'
import { ThreadListItem } from '@/components/inbox/thread-list-item'
import { OtherEmail } from '@/components/inbox/other-email'
import {
  MobileError,
  MobileLoadMore,
  MobileRefresh,
  mobileSearchParams,
  mobileInput,
  mobileLeadId,
} from '@/components/mobile/mobile-shared'
import { CONVERSATION_CHANNELS, CHANNELS } from '@/lib/channels'
import { loadDraft } from '@/lib/email-drafts'
import { loadedMobileRows, nextMobilePage } from '@/lib/mobile-list'
import { useMobileListScroll } from '@/hooks/use-mobile-list-scroll'
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
  const { rememberScroll, returnToList } = useMobileListScroll(selected)
  const search = params.get('search') || ''
  const deferred = useDeferredValue(search.trim())
  const channelValue = params.get('filterChannel') as ConversationChannel
  const channel = CONVERSATION_CHANNELS.includes(channelValue) ? channelValue : 'all'
  const queueValue = params.get('state') as InboxThreadState
  const queue = ['all', 'needs_reply', 'waiting', 'resolved'].includes(queueValue)
    ? queueValue
    : 'needs_reply'
  const assignment = privateSales
    ? 'mine'
    : params.get('assignment') === 'everyone'
      ? 'everyone'
      : params.get('assignment') === 'unassigned'
        ? 'unassigned'
        : user?.role !== 'viewer' && (params.get('assignment') === 'mine' || user?.role === 'agent')
          ? 'mine'
          : 'everyone'
  const page = mobileLeadId(params.get('page')) ?? 1
  const updateParams = (values: Record<string, string | null>, replace = true) => {
    setParams(mobileSearchParams(values), { replace, preventScrollReset: true })
  }
  const result = useInfiniteQuery({
    refetchOnWindowFocus: true,
    queryKey: [
      'inbox-threads',
      'mobile',
      dashboardScope,
      deferred,
      channel,
      queue,
      assignment,
      page,
    ],
    initialPageParam: page,
    queryFn: async ({ pageParam }) => {
      const response = await inboxApi.listThreads({
        channel: channel === 'all' ? undefined : channel,
        state: queue === 'all' ? undefined : queue,
        search: deferred || undefined,
        assignedToMe: assignment === 'mine' || undefined,
        assigned: assignment === 'unassigned' ? false : undefined,
        page: pageParam,
        limit: 25,
      })
      if (!response || !Array.isArray(response.threads))
        throw new Error('The conversation response was incomplete.')
      return response
    },
    getNextPageParam: nextMobilePage,
    refetchInterval: (query) => 15_000 * (query.state.data?.pages.length ?? 1),
    enabled: !selected,
  })
  const firstPage = result.data?.pages[0]
  const totalPages = Math.max(1, firstPage?.pages ?? 1)
  useEffect(() => {
    if (selected || !firstPage || page <= totalPages) return
    if (new URLSearchParams(window.location.search).toString() !== params.toString()) return
    setParams(mobileSearchParams({ page: null }, params), {
      replace: true,
      preventScrollReset: true,
    })
  }, [firstPage, page, params, selected, setParams, totalPages])

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
          onClose={() =>
            returnToList(() =>
              updateParams({
                leadId: null,
                channel: null,
                accountId: null,
                replyMessageId: null,
                threadKey: null,
              }),
            )
          }
          onReplyContextChange={({ channel: nextChannel, accountId, replyMessageId }) =>
            updateParams({
              channel: nextChannel,
              ...(accountId !== undefined
                ? { accountId: accountId ? String(accountId) : null }
                : {}),
              replyMessageId: replyMessageId ? String(replyMessageId) : null,
            })
          }
        />
      </Suspense>
    )
  const rows = loadedMobileRows(
    result.data?.pages.map((response) => response.threads) ?? [],
    (thread) => thread.leadId,
  )
  const total = firstPage?.total ?? rows.length
  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-3 top-4 size-4 text-text-muted"
          aria-hidden="true"
        />
        <span className="sr-only">Search conversations</span>
        <input
          type="search"
          className={`${mobileInput} min-h-12 rounded-xl pl-9`}
          value={search}
          onChange={(event) => updateParams({ search: event.target.value || null, page: null })}
          placeholder="Search conversations"
        />
      </label>
      <div
        role="group"
        aria-label="Conversation status"
        className="flex rounded-xl border border-border bg-surface p-1"
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
            onClick={() =>
              updateParams({ state: value === 'needs_reply' ? null : value, page: null })
            }
            className={`min-h-11 flex-1 whitespace-nowrap rounded-lg px-1 text-xs focus-visible:outline-2 focus-visible:outline-focus ${queue === value ? 'bg-accent-muted font-semibold text-accent' : 'text-text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={privateSales ? 'grid gap-2' : 'grid grid-cols-2 gap-2'}>
        <label className="min-w-0 space-y-1 text-xs font-medium text-text-secondary">
          <span>Channel</span>
          <select
            aria-label="Filter by channel"
            className={mobileInput}
            value={channel}
            onChange={(event) =>
              updateParams({
                filterChannel: event.target.value === 'all' ? null : event.target.value,
                page: null,
              })
            }
          >
            <option value="all">All channels</option>
            {CONVERSATION_CHANNELS.map((id) => (
              <option key={id} value={id}>
                {CHANNELS[id].label}
              </option>
            ))}
          </select>
        </label>
        {!privateSales && (
          <label className="min-w-0 space-y-1 text-xs font-medium text-text-secondary">
            <span>Assigned to</span>
            <select
              aria-label="Conversation assignment"
              className={mobileInput}
              value={assignment}
              onChange={(event) => updateParams({ assignment: event.target.value, page: null })}
            >
              <option value="everyone">Everyone</option>
              {user?.role !== 'viewer' && <option value="mine">Me</option>}
              <option value="unassigned">Unassigned</option>
            </select>
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {privateSales && (
          <ClaimableInbounds
            onClaim={(leadId) => {
              rememberScroll()
              updateParams(
                {
                  leadId: String(leadId),
                  channel: 'whatsapp',
                  accountId: null,
                  replyMessageId: null,
                  threadKey: null,
                },
                false,
              )
            }}
          />
        )}
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
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {firstPage && (
          <p className="text-xs font-medium tabular-nums text-text-muted" role="status">
            {total} {queue === 'needs_reply' ? 'need a reply' : 'conversations'}
            {channel !== 'all' ? ` · ${CHANNELS[channel].label}` : ''}
            {rows.length < total && ` · ${rows.length} loaded`}
          </p>
        )}
        <MobileRefresh
          updatedAt={result.dataUpdatedAt}
          refreshing={result.isFetching}
          stale={result.isRefetchError}
          retry={() => void result.refetch()}
        />
      </div>
      {result.isPending && result.fetchStatus !== 'paused' ? (
        <p role="status" className="py-10 text-center text-sm text-text-muted">
          Loading conversations…
        </p>
      ) : result.fetchStatus === 'paused' && !result.data ? null : result.isLoadingError ? (
        <MobileError message="Could not load conversations." retry={() => result.refetch()} />
      ) : (
        <>
          {rows.length ? (
            <ul
              role="list"
              className="overflow-hidden rounded-2xl border border-border bg-surface [&>li:last-child>button]:border-0"
            >
              {rows.map((thread) => (
                <li key={thread.leadId}>
                  <ThreadListItem
                    mobile
                    thread={thread}
                    selected={false}
                    onSelect={() => {
                      rememberScroll()
                      const draft = loadDraft(dashboardScope, thread.leadId)
                      const accountId =
                        draft?.senderAccountId ??
                        (thread.channel === 'email' ? thread.senderAccountId : null)
                      updateParams(
                        {
                          leadId: String(thread.leadId),
                          channel: draft?.channel ?? thread.channel,
                          accountId: accountId ? String(accountId) : null,
                          threadKey: thread.threadKey,
                          replyMessageId: null,
                        },
                        false,
                      )
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-border bg-surface p-8 text-center">
              <Inbox className="mx-auto h-8 w-8 text-accent" aria-hidden="true" />
              <h2 className="mt-3 font-medium">
                {deferred || channel !== 'all'
                  ? 'No matching conversations'
                  : queue === 'needs_reply'
                    ? 'All caught up'
                    : queue === 'waiting'
                      ? 'No conversations waiting for a reply'
                      : queue === 'resolved'
                        ? 'No resolved conversations'
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
          <MobileLoadMore
            hasMore={result.hasNextPage}
            busy={result.isFetching}
            loading={result.isFetchingNextPage}
            failed={result.isFetchNextPageError}
            onLoad={() => void result.fetchNextPage({ cancelRefetch: false })}
            onStartOver={page > 1 ? () => updateParams({ page: null }) : undefined}
          />
        </>
      )}
    </div>
  )
}
