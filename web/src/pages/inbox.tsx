import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  Component,
  type ReactNode,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { inboxApi } from '@/api/endpoints/inbox'
import { EMAIL_TEMPLATE_LIST_QUERY_KEY, templatesApi } from '@/api/endpoints/templates'
import type { InboxChannel, InboxThreadState, MediaFile } from '@/api/types'
import { ChannelHealthStrip } from '@/components/inbox/channel-health-strip'
import { ComposeEmailDrawer } from '@/components/inbox/compose-email-drawer'
import { ThreadListItem } from '@/components/inbox/thread-list-item'
import { LeadContextPanel } from '@/components/inbox/lead-context-panel'
import { DrawerShell, SkeletonCard, Button } from '@/components/ui'
import { buildReplySubject, getRenderedTemplateText } from '@/lib/email-compose'
import { saveDraft, loadDraft, clearDraft } from '@/lib/email-drafts'
import { ROLE_EXPERIENCE } from '@/lib/role-shell'
import { cn } from '@/lib/utils'
import { CHANNELS, CHANNEL_ORDER } from '@/lib/channels'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import { AlertCircle, MessageSquare, PenSquare, Search } from 'lucide-react'
import { ConversationSurface } from '@/components/inbox/conversation-surface'

class InboxErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-[60vh] items-center justify-center text-center">
          <div>
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-danger" />
            <p className="font-medium text-text-primary">Inbox encountered an error</p>
            <p className="mt-1 text-sm text-text-muted">{this.state.error.message}</p>
            <Button className="mt-4" onClick={() => this.setState({ error: null })}>
              Retry
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const STATE_FILTERS: Array<{ value: InboxThreadState; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'needs_reply', label: 'Needs Reply' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'resolved', label: 'Resolved' },
]

function parseLeadId(value: string | null) {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function InboxInner() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const role = user?.role || 'viewer'
  const experience = ROLE_EXPERIENCE[role]
  const [searchParams, setSearchParams] = useSearchParams()

  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery.trim())
  const [channelFilter, setChannelFilter] = useState<'all' | InboxChannel>('all')
  const [threadStateFilter, setThreadStateFilter] = useState<InboxThreadState>('all')
  const [replyText, setReplyText] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [attachments, setAttachments] = useState<MediaFile[]>([])
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [composerChannel, setComposerChannel] = useState<InboxChannel>('whatsapp')
  const [composerSubject, setComposerSubject] = useState('')
  const [senderAccountId, setSenderAccountId] = useState<number | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const routedLeadId = parseLeadId(searchParams.get('leadId'))
  const routedTemplateId = parseLeadId(searchParams.get('templateId'))
  const routedAccountId = parseLeadId(searchParams.get('accountId'))
  const routedChannel = CHANNEL_ORDER.includes(searchParams.get('channel') as InboxChannel)
    ? (searchParams.get('channel') as InboxChannel)
    : null
  const autoAppliedRouteTemplateRef = useRef<string | null>(null)

  const { data: channelHealth } = useQuery({
    queryKey: ['inbox-channel-health'],
    queryFn: async () => {
      const health = await inboxApi.channelHealth()
      if (!health) throw new Error('Channel health returned no data')
      return health
    },
    refetchInterval: 30_000,
  })

  const {
    data: threadListData,
    isLoading: threadsLoading,
    error: threadsError,
  } = useQuery({
    queryKey: ['inbox-threads', channelFilter, threadStateFilter, deferredSearchQuery],
    queryFn: () =>
      inboxApi.listThreads({
        channel: channelFilter === 'all' ? undefined : channelFilter,
        state: threadStateFilter === 'all' ? undefined : threadStateFilter,
        search: deferredSearchQuery || undefined,
      }),
    refetchInterval: 15_000,
  })

  const threads = useMemo(() => threadListData?.threads ?? [], [threadListData?.threads])

  /* Per-channel counts for the filter row. The threads query is itself filtered
     by channel, so a count is only truthful while the filter is "all" — the
     rest of the time the loaded set is one channel and the others are unknown.
     Showing nothing beats showing a wrong number, so counts appear only then. */
  const channelCounts = useMemo(() => {
    const counts: Partial<Record<InboxChannel, number>> = {}
    if (channelFilter !== 'all') return counts
    for (const thread of threads) {
      counts[thread.channel] = (counts[thread.channel] ?? 0) + 1
    }
    return counts
  }, [threads, channelFilter])

  const {
    data: activeThread,
    isLoading: threadLoading,
    error: threadError,
  } = useQuery({
    queryKey: ['inbox-thread', selectedLeadId],
    queryFn: () => inboxApi.getThread(selectedLeadId as number),
    enabled: !!selectedLeadId,
    refetchInterval: 10_000,
  })

  const latestEmailMessage =
    activeThread?.messages
      ?.slice()
      .reverse()
      .find((message) => message.channel === 'email') || null

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: EMAIL_TEMPLATE_LIST_QUERY_KEY,
    queryFn: async () => {
      const res = await templatesApi.list()
      return Array.isArray(res) ? res : []
    },
    enabled: composerChannel === 'email' && !!selectedLeadId,
  })

  useEffect(() => {
    if (routedLeadId === selectedLeadId) return
    setSelectedLeadId(routedLeadId)
  }, [routedLeadId, selectedLeadId])

  useEffect(() => {
    if (routedTemplateId === selectedTemplateId) return
    setSelectedTemplateId(routedTemplateId)
  }, [routedTemplateId, selectedTemplateId])

  useEffect(() => {
    if (!activeThread) return

    // Try restoring a saved draft for this lead
    const draft = loadDraft(activeThread.leadId)
    if (draft && draft.plainBody.trim()) {
      setReplyText(draft.plainBody)
      setHtmlBody(draft.htmlBody)
      setComposerChannel(draft.channel)
      setComposerSubject(draft.subject)
      setCc(draft.cc)
      setBcc(draft.bcc)
      if (draft.senderAccountId) setSenderAccountId(draft.senderAccountId)
    } else {
      setReplyText('')
      setHtmlBody('')
      setCc('')
      setBcc('')
      // Smart channel default: match thread channel, or pick based on lead data
      const smartChannel: InboxChannel =
        routedChannel ??
        (activeThread.channel === 'email'
          ? 'email'
          : activeThread.channel === 'imessage'
            ? 'imessage'
            : activeThread.channel === 'telegram'
              ? 'telegram'
              : activeThread.leadEmail && !activeThread.leadMobile
                ? 'email'
                : 'whatsapp')
      setComposerChannel(smartChannel)
      setComposerSubject(buildReplySubject(latestEmailMessage?.subject || activeThread.subject))
    }
    setAttachments([])
    setSenderAccountId(
      routedAccountId ||
        activeThread.senderAccount?.id ||
        activeThread.availableSenderAccounts?.[0]?.id ||
        null,
    )
    // Reset only on thread navigation. Query refreshes must not wipe a draft
    // that is already being composed for the same lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThread?.leadId])

  useEffect(() => {
    if (!routedChannel || routedChannel === composerChannel) return
    setComposerChannel(routedChannel)
  }, [composerChannel, routedChannel])

  useEffect(() => {
    if (!routedAccountId) return
    if (!activeThread?.availableSenderAccounts?.some((account) => account.id === routedAccountId))
      return
    if (senderAccountId === routedAccountId) return
    setSenderAccountId(routedAccountId)
  }, [activeThread?.availableSenderAccounts, routedAccountId, senderAccountId])

  useEffect(() => {
    if (composerChannel !== 'email') return
    if (senderAccountId || !activeThread?.availableSenderAccounts?.length) return
    setSenderAccountId(activeThread.availableSenderAccounts[0].id)
  }, [activeThread?.availableSenderAccounts, composerChannel, senderAccountId])

  // Auto-save draft to localStorage (debounced via effect)
  useEffect(() => {
    if (!selectedLeadId || !replyText.trim()) return
    const timer = setTimeout(() => {
      saveDraft(selectedLeadId, {
        subject: composerSubject,
        htmlBody,
        plainBody: replyText,
        channel: composerChannel,
        senderAccountId,
        cc,
        bcc,
      })
    }, 1000)
    return () => clearTimeout(timer)
  }, [
    selectedLeadId,
    replyText,
    htmlBody,
    composerSubject,
    composerChannel,
    senderAccountId,
    cc,
    bcc,
  ])

  useEffect(() => {
    if (!selectedLeadId && routedLeadId) {
      return
    }

    const next = new URLSearchParams(searchParams)

    if (selectedLeadId) {
      next.set('leadId', String(selectedLeadId))
      next.set('channel', composerChannel)
      if (activeThread?.threadKey) {
        next.set('threadKey', activeThread.threadKey)
      } else {
        next.delete('threadKey')
      }
      if (composerChannel === 'email' && senderAccountId) {
        next.set('accountId', String(senderAccountId))
      } else {
        next.delete('accountId')
      }
    } else {
      next.delete('leadId')
      next.delete('channel')
      next.delete('threadKey')
      next.delete('accountId')
    }

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [
    activeThread?.threadKey,
    composerChannel,
    routedLeadId,
    searchParams,
    selectedLeadId,
    senderAccountId,
    setSearchParams,
  ])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeThread?.messages, selectedLeadId])

  const replyDisabledReason = !activeThread
    ? threadLoading
      ? 'Loading conversation…'
      : 'Select a conversation to reply.'
    : composerChannel === 'email'
      ? !activeThread.leadEmail
        ? 'This lead does not have an email address yet.'
        : activeThread.availableSenderAccounts?.length
          ? null
          : 'No verified sender account is available for this lead.'
      : composerChannel === 'telegram'
          ? !activeThread.leadTelegramPeer
            ? 'Add a Telegram @username, phone number, or peer ID to this lead first.'
            : channelHealth?.telegram.status === 'ready'
              ? null
              : 'No connected Telegram account is available.'
        : !activeThread.leadMobile
          ? `This lead does not have a mobile number for ${composerChannel === 'imessage' ? 'iMessage' : 'WhatsApp'}.`
          : null

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLeadId) throw new Error('No lead selected')
      const messageBody = replyText.trim()

      // WhatsApp files: the text, if any, is the first file's caption.
      if (composerChannel === 'whatsapp' && attachments.length > 0) {
        return inboxApi.send({
          leadId: selectedLeadId,
          channel: 'whatsapp',
          text: messageBody,
          attachmentIds: attachments.map((a) => a.id),
        })
      }
      if (!messageBody) throw new Error('Reply cannot be empty')

      if (composerChannel === 'email') {
        if (replyDisabledReason) throw new Error(replyDisabledReason)
        const subject =
          composerSubject.trim() ||
          buildReplySubject(latestEmailMessage?.subject || activeThread?.subject)

        const emailHtml = htmlBody.trim()
        return inboxApi.send({
          leadId: selectedLeadId,
          channel: 'email',
          text: messageBody,
          body: messageBody,
          htmlBody: emailHtml || undefined,
          subject,
          accountId: senderAccountId ?? undefined,
          replyToMessageId: latestEmailMessage?.id ?? undefined,
          attachmentIds: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
        })
      }

      return inboxApi.send({
        leadId: selectedLeadId,
        channel: composerChannel,
        text: messageBody,
      })
    },
    onSuccess: () => {
      if (selectedLeadId) clearDraft(selectedLeadId)
      setReplyText('')
      setHtmlBody('')
      setAttachments([])
      setCc('')
      setBcc('')
      toast.success(
        composerChannel === 'email'
          ? 'Email sent from Inbox'
          : composerChannel === 'imessage'
            ? 'iMessage sent'
            : composerChannel === 'telegram'
              ? 'Telegram message sent'
              : 'WhatsApp reply sent',
      )
      queryClient.invalidateQueries({ queryKey: ['inbox-thread', selectedLeadId] })
      queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
    },
    onError: (error: Error) => toast.error(`Reply failed: ${error.message}`),
  })

  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      if (!selectedLeadId) throw new Error('No lead selected')
      return templatesApi.render(templateId, {
        leadId: selectedLeadId,
        context: {
          company: activeThread?.leadCompany || '',
          name: activeThread?.leadName || '',
          email: activeThread?.leadEmail || '',
          mobile: activeThread?.leadMobile || '',
          senderName:
            activeThread?.availableSenderAccounts?.find((account) => account.id === senderAccountId)
              ?.senderName ||
            activeThread?.availableSenderAccounts?.find((account) => account.id === senderAccountId)
              ?.name ||
            '',
          senderEmail:
            activeThread?.availableSenderAccounts?.find((account) => account.id === senderAccountId)
              ?.email || '',
        },
      })
    },
    onSuccess: (data) => {
      if (!data) {
        toast.error('Template preview returned no content')
        return
      }
      setComposerChannel('email')
      setComposerSubject(
        data.subject || buildReplySubject(latestEmailMessage?.subject || activeThread?.subject),
      )
      const plainText = getRenderedTemplateText(data)
      setReplyText(plainText)
      setHtmlBody(data.htmlBody || `<p>${plainText.replace(/\n/g, '</p><p>')}</p>`)
      if (searchParams.get('templateId')) {
        const next = new URLSearchParams(searchParams)
        next.delete('templateId')
        setSearchParams(next, { replace: true })
      }
      toast.success('Template applied to inbox composer')
    },
    onError: (error: Error) => {
      if (searchParams.get('templateId')) {
        const next = new URLSearchParams(searchParams)
        next.delete('templateId')
        setSearchParams(next, { replace: true })
      }
      toast.error(`Template apply failed: ${error.message}`)
    },
  })

  useEffect(() => {
    if (!selectedLeadId || !routedTemplateId || !activeThread) return
    if (!templates.some((template) => template.id === routedTemplateId)) return

    const routeKey = `${selectedLeadId}:${routedTemplateId}`
    if (autoAppliedRouteTemplateRef.current === routeKey) return

    autoAppliedRouteTemplateRef.current = routeKey
    setSelectedTemplateId(routedTemplateId)
    applyTemplateMutation.mutate(routedTemplateId)
  }, [activeThread, applyTemplateMutation, routedTemplateId, selectedLeadId, templates])

  const invalidateThreadQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['inbox-thread', selectedLeadId] })
    queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
  }

  const resolveThreadMutation = useMutation({
    mutationFn: () => {
      if (!selectedLeadId) throw new Error('No lead selected')
      return inboxApi.resolveThread(selectedLeadId)
    },
    onSuccess: () => {
      toast.success('Thread resolved')
      invalidateThreadQueries()
    },
    onError: (error: Error) => toast.error(`Resolve failed: ${error.message}`),
  })

  const reopenThreadMutation = useMutation({
    mutationFn: () => {
      if (!selectedLeadId) throw new Error('No lead selected')
      return inboxApi.reopenThread(selectedLeadId)
    },
    onSuccess: () => {
      toast.success('Thread reopened')
      invalidateThreadQueries()
    },
    onError: (error: Error) => toast.error(`Reopen failed: ${error.message}`),
  })

  const assignSelfMutation = useMutation({
    mutationFn: () => {
      if (!selectedLeadId) throw new Error('No lead selected')
      return inboxApi.assignSelf(selectedLeadId)
    },
    onSuccess: () => {
      toast.success('Thread assigned to you')
      invalidateThreadQueries()
    },
    onError: (error: Error) => toast.error(`Assign failed: ${error.message}`),
  })

  const threadActionPending =
    resolveThreadMutation.isPending ||
    reopenThreadMutation.isPending ||
    assignSelfMutation.isPending

  const resolvedThreadError = threadError instanceof Error ? threadError : null
  const resolvedReplyError = sendMutation.error instanceof Error ? sendMutation.error : null

  const handleAddAttachment = (file: MediaFile) => setAttachments((prev) => [...prev, file])
  const handleRemoveAttachment = (id: number) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id))

  const scheduleSendMutation = useMutation({
    mutationFn: async (scheduledAt: string) => {
      if (!selectedLeadId) throw new Error('No lead selected')
      const messageBody = replyText.trim()
      if (!messageBody) throw new Error('Reply cannot be empty')
      const emailHtml = htmlBody.trim()
      const subjectLine =
        composerSubject.trim() ||
        buildReplySubject(latestEmailMessage?.subject || activeThread?.subject)
      return inboxApi.send({
        leadId: selectedLeadId,
        channel: 'email',
        text: messageBody,
        body: messageBody,
        htmlBody: emailHtml || undefined,
        subject: subjectLine,
        accountId: senderAccountId ?? undefined,
        replyToMessageId: latestEmailMessage?.id ?? undefined,
        attachmentIds: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        scheduledAt,
      })
    },
    onSuccess: () => {
      if (selectedLeadId) clearDraft(selectedLeadId)
      setReplyText('')
      setHtmlBody('')
      setAttachments([])
      setCc('')
      setBcc('')
      toast.success('Email scheduled successfully')
      queryClient.invalidateQueries({ queryKey: ['inbox-thread', selectedLeadId] })
      queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
    },
    onError: (error: Error) => toast.error(`Schedule failed: ${error.message}`),
  })

  return (
    <div className="animate-fade-in space-y-3">
      <ChannelHealthStrip health={channelHealth} />
      <div className="flex min-h-[calc(100vh-11rem)] flex-col gap-4 lg:h-[calc(100vh-11rem)] lg:flex-row">
        <div className="glass flex w-full shrink-0 flex-col overflow-hidden rounded-lg border border-border lg:w-88 lg:min-h-0">
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold tracking-tight">Conversations</h1>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  <span className="tabular-nums">{threadListData?.needsReply ?? 0}</span> need reply
                  &middot; <span className="tabular-nums">{threadListData?.unread ?? 0}</span>{' '}
                  unread
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setShowCompose(true)}
                leftIcon={<PenSquare className="h-3.5 w-3.5" />}
              >
                Compose
              </Button>
            </div>

            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search conversations"
                className={cn(
                  'h-8 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-[13px] text-text-primary',
                  'placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted',
                )}
              />
            </div>

            {/* Channel filter. Each option carries its own icon and colour, so
                the mix of channels in the workspace is legible before any
                thread is opened. */}
            <div className="mt-3 flex items-center gap-1 overflow-x-auto scrollbar-hide">
              <button
                type="button"
                onClick={() => setChannelFilter('all')}
                aria-pressed={channelFilter === 'all'}
                className={cn(
                  'shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  channelFilter === 'all'
                    ? 'bg-accent text-accent-fg'
                    : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
                )}
              >
                All
              </button>
              {CHANNEL_ORDER.map((id) => {
                const meta = CHANNELS[id]
                const Icon = meta.icon
                const active = channelFilter === id
                const count = channelCounts[id] ?? 0
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setChannelFilter(id)}
                    aria-pressed={active}
                    title={meta.label}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      active
                        ? cn(meta.bg, meta.text)
                        : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
                    )}
                  >
                    <Icon className={cn('h-3 w-3', active ? meta.text : 'text-text-muted')} />
                    {meta.shortLabel}
                    {count > 0 && <span className="tabular-nums opacity-70">{count}</span>}
                  </button>
                )
              })}
            </div>

            <div className="mt-1.5 flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {STATE_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setThreadStateFilter(filter.value)}
                  aria-pressed={threadStateFilter === filter.value}
                  className={cn(
                    'shrink-0 rounded-md px-2 py-1 text-[11px] transition-colors',
                    threadStateFilter === filter.value
                      ? 'bg-surface-raised font-medium text-text-primary'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[32vh] overflow-y-auto lg:flex-1 lg:min-h-0 lg:max-h-none">
            {threadsLoading ? (
              <div className="flex flex-col gap-2 p-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <SkeletonCard key={index} lines={1} className="rounded-md! p-3!" />
                ))}
              </div>
            ) : threadsError ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-medium text-danger">Failed to load threads</p>
                <p className="mt-2 text-xs text-text-muted">
                  Refresh the page or check the inbox API connection.
                </p>
              </div>
            ) : threads.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <MessageSquare className="mx-auto h-10 w-10 animate-pulse text-text-muted/50" />
                <p className="mt-4 text-sm font-medium text-text-primary">
                  {deferredSearchQuery ? 'No matching conversations' : 'No conversations yet'}
                </p>
                <p className="mt-2 text-xs leading-5 text-text-secondary">
                  {deferredSearchQuery
                    ? 'Try a broader keyword or clear the search term to bring more threads back.'
                    : 'Inbound replies and active lead conversations will appear here as message traffic starts flowing.'}
                </p>
              </div>
            ) : (
              threads.map((thread) => (
                <ThreadListItem
                  key={thread.leadId}
                  thread={thread}
                  selected={thread.leadId === selectedLeadId}
                  onSelect={() => {
                    startTransition(() => {
                      setSelectedLeadId(thread.leadId)
                      setReplyText('')
                    })
                  }}
                />
              ))
            )}
          </div>
        </div>

        <div className="hidden min-h-136 min-w-0 flex-1 gap-4 lg:flex lg:min-h-0">
          {!selectedLeadId ? (
            <div className="glass flex flex-1 flex-col items-center justify-center rounded-lg border border-border px-6 text-center text-text-muted sm:px-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-md bg-accent-muted text-accent shadow-sm">
                <MessageSquare className="h-6 w-6" />
              </div>
              <p className="mt-4 text-lg font-semibold text-text-primary">Select a conversation</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
                Pick a lead to review WhatsApp, email, iMessage, and Telegram history, draft a
                response, and send from the dashboard.
              </p>
              <div className="mt-5 flex max-w-md flex-wrap justify-center gap-2">
                {experience.focusAreas.slice(0, 4).map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs text-text-secondary"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <>
              <ConversationSurface
                activeThread={activeThread ?? null}
                threadLoading={threadLoading}
                threadError={resolvedThreadError}
                replyText={replyText}
                setReplyText={setReplyText}
                htmlBody={htmlBody}
                setHtmlBody={setHtmlBody}
                composerChannel={composerChannel}
                setComposerChannel={setComposerChannel}
                composerSubject={composerSubject}
                setComposerSubject={setComposerSubject}
                senderAccountId={senderAccountId}
                setSenderAccountId={setSenderAccountId}
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                setSelectedTemplateId={setSelectedTemplateId}
                onApplyTemplate={() => {
                  if (!selectedTemplateId) return
                  applyTemplateMutation.mutate(selectedTemplateId)
                }}
                templatesLoading={templatesLoading}
                templateApplyPending={applyTemplateMutation.isPending}
                onSend={() => sendMutation.mutate()}
                replyPending={sendMutation.isPending}
                replyError={resolvedReplyError}
                replyDisabledReason={replyDisabledReason}
                messagesEndRef={messagesEndRef}
                onResolve={() => resolveThreadMutation.mutate()}
                onReopen={() => reopenThreadMutation.mutate()}
                onAssignSelf={() => assignSelfMutation.mutate()}
                threadActionPending={threadActionPending}
                attachments={attachments}
                onAddAttachment={handleAddAttachment}
                onRemoveAttachment={handleRemoveAttachment}
                cc={cc}
                onCcChange={setCc}
                bcc={bcc}
                onBccChange={setBcc}
                onScheduleSend={(scheduledAt) => scheduleSendMutation.mutate(scheduledAt)}
              />
              {/* Third pane: who this is, what is outstanding, what was agreed.
                Hidden below xl, where the conversation needs the width more. */}
              {activeThread && <LeadContextPanel thread={activeThread} />}
            </>
          )}
        </div>

        {selectedLeadId && (
          <DrawerShell onClose={() => setSelectedLeadId(null)} className="lg:hidden">
            <ConversationSurface
              activeThread={activeThread ?? null}
              threadLoading={threadLoading}
              threadError={resolvedThreadError}
              replyText={replyText}
              setReplyText={setReplyText}
              htmlBody={htmlBody}
              setHtmlBody={setHtmlBody}
              composerChannel={composerChannel}
              setComposerChannel={setComposerChannel}
              composerSubject={composerSubject}
              setComposerSubject={setComposerSubject}
              senderAccountId={senderAccountId}
              setSenderAccountId={setSenderAccountId}
              templates={templates}
              selectedTemplateId={selectedTemplateId}
              setSelectedTemplateId={setSelectedTemplateId}
              onApplyTemplate={() => {
                if (!selectedTemplateId) return
                applyTemplateMutation.mutate(selectedTemplateId)
              }}
              templatesLoading={templatesLoading}
              templateApplyPending={applyTemplateMutation.isPending}
              onSend={() => sendMutation.mutate()}
              replyPending={sendMutation.isPending}
              replyError={resolvedReplyError}
              replyDisabledReason={replyDisabledReason}
              messagesEndRef={messagesEndRef}
              drawer
              onClose={() => setSelectedLeadId(null)}
              onResolve={() => resolveThreadMutation.mutate()}
              onReopen={() => reopenThreadMutation.mutate()}
              onAssignSelf={() => assignSelfMutation.mutate()}
              threadActionPending={threadActionPending}
              attachments={attachments}
              onAddAttachment={handleAddAttachment}
              onRemoveAttachment={handleRemoveAttachment}
              cc={cc}
              onCcChange={setCc}
              bcc={bcc}
              onBccChange={setBcc}
              onScheduleSend={(scheduledAt) => scheduleSendMutation.mutate(scheduledAt)}
            />
          </DrawerShell>
        )}
      </div>

      {showCompose && <ComposeEmailDrawer onClose={() => setShowCompose(false)} />}
    </div>
  )
}

export default function InboxPage() {
  return (
    <InboxErrorBoundary>
      <InboxInner />
    </InboxErrorBoundary>
  )
}
