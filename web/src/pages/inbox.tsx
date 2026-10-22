import { ApiClientError } from '@/api/client'
import { isReplyableEmail } from '@/lib/email-delivery'
import {
  useCallback,
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
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DrawerShell, SkeletonCard, Button } from '@/components/ui'
import { buildReplySubject, getRenderedTemplateText } from '@/lib/email-compose'
import { saveDraft, loadDraft, clearDraft, clearSubmittedDraft } from '@/lib/email-drafts'
import { ROLE_EXPERIENCE } from '@/lib/role-shell'
import { cn } from '@/lib/utils'
import { CHANNELS, CHANNEL_ORDER } from '@/lib/channels'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useUIStore } from '@/stores/ui-store'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import { AlertCircle, MessageSquare, PenSquare, Search, PanelRight } from 'lucide-react'
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
  { value: 'needs_reply', label: 'Needs reply' },
  { value: 'all', label: 'All' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'resolved', label: 'Done' },
]

function parseLeadId(value: string | null) {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function InboxInner() {
  const queryClient = useQueryClient()
  const isMobileViewport = useUIStore((state) => state.isMobileViewport)
  const online = useOnlineStatus()
  const { user, dashboardScope } = useAuthStore()
  const role = user?.role || 'viewer'
  const experience = ROLE_EXPERIENCE[role]
  const [searchParams, setSearchParams] = useSearchParams()

  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery.trim())
  const [channelFilter, setChannelFilter] = useState<'all' | InboxChannel>('all')
  const [threadStateFilter, setThreadStateFilter] = useState<InboxThreadState>('needs_reply')
  const [assignment, setAssignment] = useState('all')
  const [showContext, setShowContext] = useState(false)
  const [wideContext, setWideContext] = useState(() => matchMedia('(min-width: 1400px)').matches)
  useEffect(() => {
    const media = matchMedia('(min-width: 1400px)')
    const sync = () => setWideContext(media.matches)
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  const [replyText, setReplyText] = useState('')
  const requestIds = useRef(new Map<string, string>())
  const pendingFingerprint = useRef<string | null>(null)
  const [htmlBody, setHtmlBody] = useState('')
  const [attachments, setAttachments] = useState<MediaFile[]>([])
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [composerSubject, setComposerSubject] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const selectedLeadId = parseLeadId(searchParams.get('leadId'))
  const routedTemplateId = parseLeadId(searchParams.get('templateId'))
  const routedAccountId = parseLeadId(searchParams.get('accountId'))
  const routedChannel = CHANNEL_ORDER.includes(searchParams.get('channel') as InboxChannel)
    ? (searchParams.get('channel') as InboxChannel)
    : null
  const autoAppliedRouteTemplateRef = useRef<string | null>(null)
  const [hydratedContext, setHydratedContext] = useState('')

  // Navigation owns the selected conversation and channel. Mirroring these
  // into local state with effects lets a stale URL undo a person's selection.
  const updateRoute = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) next.delete(key)
            else next.set(key, value)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setSelectedLeadId = (leadId: number | null) => {
    updateRoute({
      leadId: leadId ? String(leadId) : null,
      channel: null,
      accountId: null,
      threadKey: null,
      templateId: null,
    })
  }
  const setComposerChannel = (channel: InboxChannel) => updateRoute({ channel })
  const setSenderAccountId = (accountId: number | null) =>
    updateRoute({ accountId: accountId ? String(accountId) : null })

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
    queryKey: [
      'inbox-threads',
      channelFilter,
      threadStateFilter,
      assignment,
      deferredSearchQuery,
      page,
    ],
    queryFn: () =>
      inboxApi.listThreads({
        channel: channelFilter === 'all' ? undefined : channelFilter,
        state: threadStateFilter === 'all' ? undefined : threadStateFilter,
        search: deferredSearchQuery || undefined,
        assignedToMe: assignment === 'me' || undefined,
        assigned: assignment === 'unassigned' ? false : undefined,
        page,
      }),
    refetchInterval: 15_000,
  })

  useEffect(() => {
    setPage(1)
  }, [channelFilter, threadStateFilter, assignment, deferredSearchQuery])
  useEffect(() => {
    if (threadListData) setPage((current) => Math.min(current, Math.max(1, threadListData.pages)))
  }, [threadListData])

  const threads = useMemo(() => threadListData?.threads ?? [], [threadListData?.threads])

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

  const composerChannel = routedChannel ?? activeThread?.channel ?? 'whatsapp'
  const availableSenders = activeThread?.availableSenderAccounts ?? []
  const senderAccountId =
    availableSenders.find((account) => account.id === routedAccountId)?.id ??
    activeThread?.senderAccount?.id ??
    availableSenders[0]?.id ??
    null

  const latestEmailMessage =
    activeThread?.messages?.slice().reverse().find(isReplyableEmail) || null

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: EMAIL_TEMPLATE_LIST_QUERY_KEY,
    queryFn: async () => {
      const res = await templatesApi.list()
      return Array.isArray(res) ? res : []
    },
    enabled: composerChannel === 'email' && !!selectedLeadId,
  })

  useEffect(() => {
    setSelectedTemplateId(routedTemplateId)
  }, [routedTemplateId])

  const draftAccountId = composerChannel === 'email' ? senderAccountId : null
  const draftContext = `${dashboardScope}:${selectedLeadId}:${composerChannel}:${draftAccountId}`
  const currentDraftContext = useRef(draftContext)
  currentDraftContext.current = draftContext
  useEffect(() => {
    if (!activeThread || activeThread.leadId !== selectedLeadId || hydratedContext === draftContext)
      return
    const draft = loadDraft(dashboardScope, activeThread.leadId, composerChannel, draftAccountId)
    setReplyText(draft?.plainBody ?? '')
    setHtmlBody(draft?.htmlBody ?? '')
    setCc(draft?.cc ?? '')
    setBcc(draft?.bcc ?? '')
    setComposerSubject(
      draft?.subject ?? buildReplySubject(latestEmailMessage?.subject || activeThread.subject),
    )
    setAttachments([])
    setHydratedContext(draftContext)
  }, [
    activeThread,
    selectedLeadId,
    dashboardScope,
    composerChannel,
    draftAccountId,
    draftContext,
    hydratedContext,
    latestEmailMessage?.subject,
  ])

  // Save promptly so browser Back and tab suspension retain the latest edit.
  // Hydration and persistence share a context guard; channel/sender switches
  // cannot write the old editor's contents into the new identity's draft.
  useEffect(() => {
    if (!selectedLeadId || hydratedContext !== draftContext) return
    saveDraft(dashboardScope, selectedLeadId, {
      subject: composerSubject,
      htmlBody,
      plainBody: replyText,
      channel: composerChannel,
      senderAccountId: draftAccountId,
      cc,
      bcc,
    })
  }, [
    dashboardScope,
    selectedLeadId,
    hydratedContext,
    draftContext,
    replyText,
    htmlBody,
    composerSubject,
    composerChannel,
    draftAccountId,
    cc,
    bcc,
  ])

  const replyDisabledReason =
    role === 'viewer'
      ? 'Read-only access. Ask your administrator for reply access.'
      : !online
        ? 'Offline. Reconnect to send your reply.'
        : !activeThread
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
    networkMode: 'always',
    retry: false,
    mutationFn: async () => {
      if (!selectedLeadId) throw new Error('No lead selected')
      if (replyDisabledReason) throw new Error(replyDisabledReason)
      const submitted = loadDraft(dashboardScope, selectedLeadId, composerChannel, draftAccountId)
      const fingerprint = JSON.stringify([
        draftContext,
        replyText,
        attachments.map((file) => file.id),
      ])
      pendingFingerprint.current = fingerprint
      const requestId = requestIds.current.get(fingerprint) || crypto.randomUUID()
      requestIds.current.set(fingerprint, requestId)
      const send = async (payload: Parameters<typeof inboxApi.send>[0]) => ({
        response: await inboxApi.send({ ...payload, clientMessageId: requestId }),
        submitted,
        fingerprint,
        leadId: selectedLeadId,
        channel: composerChannel,
        context: draftContext,
      })
      const messageBody = replyText.trim()

      // WhatsApp files: the text, if any, is the first file's caption.
      if (composerChannel === 'whatsapp' && attachments.length > 0) {
        return send({
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
        return send({
          leadId: selectedLeadId,
          channel: 'email',
          text: messageBody,
          body: messageBody,
          htmlBody: emailHtml || undefined,
          subject,
          accountId: senderAccountId ?? undefined,
          replyToMessageId: latestEmailMessage?.emailMessageId ? latestEmailMessage.id : undefined,
          attachmentIds: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
        })
      }

      return send({
        leadId: selectedLeadId,
        channel: composerChannel,
        text: messageBody,
      })
    },
    onSuccess: ({ submitted, leadId, context, fingerprint, channel }) => {
      requestIds.current.delete(fingerprint)
      clearSubmittedDraft(dashboardScope, leadId, submitted)
      // A reply completing after navigation must not clear another lead's editor.
      if (currentDraftContext.current === context) {
        setReplyText('')
        setHtmlBody('')
        setAttachments([])
        setCc('')
        setBcc('')
      }
      toast.success(
        channel === 'email'
          ? 'Email sent from Inbox'
          : channel === 'imessage'
            ? 'iMessage sent'
            : channel === 'telegram'
              ? 'Telegram message sent'
              : 'Accepted by Meta. Waiting for delivery confirmation.',
      )
      queryClient.invalidateQueries({ queryKey: ['inbox-thread', leadId] })
      queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
    },
    onError: (error: Error) => {
      if (
        error instanceof ApiClientError &&
        error.code === 'manual_send_failed' &&
        pendingFingerprint.current
      )
        requestIds.current.delete(pendingFingerprint.current)
      toast.error(`Reply failed: ${error.message}`)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox-thread'] })
      void queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
    },
  })

  const applyTemplateMutation = useMutation({
    networkMode: 'always',
    retry: false,
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
      updateRoute({ channel: 'email', templateId: null })
      setComposerSubject(
        data.subject || buildReplySubject(latestEmailMessage?.subject || activeThread?.subject),
      )
      const plainText = getRenderedTemplateText(data)
      setReplyText(plainText)
      setHtmlBody(data.htmlBody || `<p>${plainText.replace(/\n/g, '</p><p>')}</p>`)
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

  const persistCurrentDraft = () => {
    if (!selectedLeadId || hydratedContext !== draftContext) return
    if (!replyText.trim()) {
      clearDraft(dashboardScope, selectedLeadId, composerChannel, senderAccountId)
      return
    }
    saveDraft(dashboardScope, selectedLeadId, {
      subject: composerSubject,
      htmlBody,
      plainBody: replyText,
      channel: composerChannel,
      senderAccountId: draftAccountId,
      cc,
      bcc,
    })
  }

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
    networkMode: 'always',
    retry: false,
    mutationFn: async (scheduledAt: string) => {
      if (!selectedLeadId) throw new Error('No lead selected')
      const messageBody = replyText.trim()
      if (!messageBody) throw new Error('Reply cannot be empty')
      if (replyDisabledReason) throw new Error(replyDisabledReason)
      const submitted = loadDraft(dashboardScope, selectedLeadId, composerChannel, draftAccountId)
      const emailHtml = htmlBody.trim()
      const subjectLine =
        composerSubject.trim() ||
        buildReplySubject(latestEmailMessage?.subject || activeThread?.subject)
      return inboxApi
        .send({
          leadId: selectedLeadId,
          channel: 'email',
          text: messageBody,
          body: messageBody,
          htmlBody: emailHtml || undefined,
          subject: subjectLine,
          accountId: senderAccountId ?? undefined,
          replyToMessageId: latestEmailMessage?.emailMessageId ? latestEmailMessage.id : undefined,
          attachmentIds: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
          scheduledAt,
        })
        .then((response) => ({
          response,
          submitted,
          leadId: selectedLeadId,
          context: draftContext,
        }))
    },
    onSuccess: ({ submitted, leadId, context }) => {
      clearSubmittedDraft(dashboardScope, leadId, submitted)
      // A reply completing after navigation must not clear another lead's editor.
      if (currentDraftContext.current === context) {
        setReplyText('')
        setHtmlBody('')
        setAttachments([])
        setCc('')
        setBcc('')
      }
      toast.success('Email scheduled successfully')
      queryClient.invalidateQueries({ queryKey: ['inbox-thread', leadId] })
      queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
    },
    onError: (error: Error) => toast.error(`Schedule failed: ${error.message}`),
  })

  return (
    <div className="animate-fade-in space-y-3">
      <ChannelHealthStrip health={channelHealth} />
      <div className="flex min-h-[calc(100vh-11rem)] flex-col gap-4 lg:h-[calc(100dvh-9.5rem)] lg:flex-row">
        <div className="glass flex w-full shrink-0 flex-col overflow-hidden rounded-lg border border-border lg:w-80 xl:w-[22rem] lg:min-h-0">
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold tracking-tight">Inbox</h1>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  <span className="tabular-nums">{threadListData?.needsReply ?? 0}</span> need reply
                </p>
              </div>
              <Button
                size="sm"
                disabled={role === 'viewer'}
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
                aria-label="Search conversations"
                className={cn(
                  'h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-[13px] text-text-primary',
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
                  </button>
                )
              })}
            </div>

            <div
              aria-label="Conversation status"
              className="mt-3 flex items-center gap-1 rounded-lg border border-border bg-background p-1"
            >
              {STATE_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setThreadStateFilter(filter.value)}
                  aria-pressed={threadStateFilter === filter.value}
                  className={cn(
                    'min-h-9 flex-1 whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors',
                    threadStateFilter === filter.value
                      ? 'bg-surface-raised font-medium text-text-primary'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center justify-between gap-2 text-xs text-text-muted">
              <span>{threadListData?.total ?? 0} conversations</span>
              <select
                aria-label="Conversation assignment"
                value={assignment}
                onChange={(event) => setAssignment(event.target.value)}
                className="min-h-8 rounded-md bg-surface px-2 text-text-secondary"
              >
                <option value="all">Everyone</option>
                <option value="me">Assigned to me</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </label>
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
                <MessageSquare className="mx-auto h-10 w-10 text-text-muted/50" />
                <p className="mt-4 text-sm font-medium text-text-primary">
                  {deferredSearchQuery
                    ? 'No matching conversations'
                    : threadStateFilter === 'needs_reply'
                      ? 'All caught up'
                      : 'No conversations here'}
                </p>
                <p className="mt-2 text-xs leading-5 text-text-secondary">
                  {deferredSearchQuery
                    ? 'Try a broader keyword or clear the search term to bring more threads back.'
                    : 'Choose All to review history, or change the channel and assignment filters.'}
                </p>
              </div>
            ) : (
              threads.map((thread) => (
                <ThreadListItem
                  key={thread.leadId}
                  thread={thread}
                  selected={thread.leadId === selectedLeadId}
                  onSelect={() => {
                    persistCurrentDraft()
                    startTransition(() => {
                      const draft = loadDraft(dashboardScope, thread.leadId)
                      updateRoute({
                        leadId: String(thread.leadId),
                        channel: draft?.channel ?? thread.channel,
                        accountId: draft?.senderAccountId ? String(draft.senderAccountId) : null,
                        threadKey: thread.threadKey,
                        templateId: null,
                      })
                    })
                  }}
                />
              ))
            )}
          </div>
          {(threadListData?.pages ?? 0) > 1 && (
            <nav
              aria-label="Conversation pages"
              className="flex items-center justify-between gap-2 border-t border-border p-3"
            >
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <span className="text-xs tabular-nums text-text-muted">
                {page} / {threadListData?.pages}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= (threadListData?.pages ?? 1)}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </nav>
          )}
        </div>

        {!isMobileViewport && (
          <div className="hidden min-h-136 min-w-0 flex-1 gap-4 lg:flex lg:min-h-0">
            {!selectedLeadId ? (
              <div className="glass flex flex-1 flex-col items-center justify-center rounded-lg border border-border px-6 text-center text-text-muted sm:px-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-accent-muted text-accent shadow-sm">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <p className="mt-4 text-lg font-semibold text-text-primary">
                  Select a conversation
                </p>
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
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="mb-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-expanded={showContext}
                      onClick={() => setShowContext(!showContext)}
                      leftIcon={<PanelRight className="h-4 w-4" />}
                    >
                      {showContext ? 'Hide details' : 'Lead details'}
                    </Button>
                  </div>
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
                    replyPending={sendMutation.isPending || scheduleSendMutation.isPending}
                    replyError={resolvedReplyError}
                    replyDisabledReason={replyDisabledReason}
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
                </div>
                {/* Third pane: who this is, what is outstanding, what was agreed.
                Hidden below xl, where the conversation needs the width more. */}
                {activeThread &&
                  showContext &&
                  (wideContext ? (
                    <LeadContextPanel key={activeThread.leadId} thread={activeThread} />
                  ) : (
                    <Dialog open onOpenChange={setShowContext}>
                      <DialogContent className="flex max-h-[90dvh] max-w-sm flex-col overflow-hidden p-0">
                        <DialogTitle className="border-b border-border px-4 py-4 text-sm">
                          Lead details
                        </DialogTitle>
                        <LeadContextPanel
                          key={activeThread.leadId}
                          thread={activeThread}
                          className="w-full min-h-0 border-0 rounded-none"
                        />
                      </DialogContent>
                    </Dialog>
                  ))}
              </>
            )}
          </div>
        )}

        {selectedLeadId && isMobileViewport && (
          <DrawerShell
            onClose={() => {
              persistCurrentDraft()
              setSelectedLeadId(null)
            }}
            className="lg:hidden"
          >
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
              replyPending={sendMutation.isPending || scheduleSendMutation.isPending}
              replyError={resolvedReplyError}
              replyDisabledReason={replyDisabledReason}
              drawer
              onClose={() => {
                persistCurrentDraft()
                setSelectedLeadId(null)
              }}
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
  const scope = useAuthStore((state) => state.dashboardScope)
  return (
    <InboxErrorBoundary>
      <InboxInner key={scope} />
    </InboxErrorBoundary>
  )
}
