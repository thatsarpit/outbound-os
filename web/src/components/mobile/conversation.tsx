import { ScheduledEmails } from '@/components/inbox/scheduled-emails'
import { VoiceRecorder } from '@/components/inbox/voice-recorder'
import { ReplyPreview, MessageInteractions } from '@/components/inbox/message-interactions'
import { ApiClientError } from '@/api/client'
import {
  WhatsAppReplyWindow,
  canSendWhatsAppFreeText,
} from '@/components/inbox/whatsapp-reply-window'
import { useEffect, useId, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ChevronDown, Info, Send, Search } from 'lucide-react'
import { inboxApi } from '@/api/endpoints/inbox'
import { EMAIL_TEMPLATE_LIST_QUERY_KEY, templatesApi } from '@/api/endpoints/templates'
import type { InboxChannel, InboxThreadDetail, InboxMessage, MediaFile } from '@/api/types'
import { EmailMessageCard } from '@/components/inbox/email-message-card'
import { EmailEditor } from '@/components/inbox/email-editor'
import { AttachmentPicker } from '@/components/inbox/attachment-picker'
import { MessageBubble } from '@/components/inbox/whatsapp-message-bubble'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { LeadCallLink } from '@/components/leads/lead-call-link'
import { leadPhoneHref } from '../../../../shared/leadPhone.js'
import { MobileLeadPanel } from './lead-panel'
import { MobileError, mobileInput, mobileButton } from './mobile-shared'
import { useAuthStore } from '@/stores/auth-store'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { CHANNELS, CHANNEL_ORDER } from '@/lib/channels'
import { buildReplySubject, getRenderedTemplateText } from '@/lib/email-compose'
import { clearSubmittedDraft, loadDraft, saveDraft, type EmailDraft } from '@/lib/email-drafts'
import { inboxEmailContext, isReplyableEmail } from '@/lib/email-delivery'
import { IS_DEMO } from '@/demo/demo-chrome'
import { useConversationRead } from '@/hooks/use-conversation-read'
import { toast } from '@/stores/toast-store'

// visualViewport follows Safari's keyboard and browser chrome. The timeline
// takes the remaining height while the composer stays inside the visible area.
function useConversationViewport() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => {
      if (!ref.current) return
      // At normal scale, follow the keyboard. At zoomed scales, keep the
      // layout stable so the browser can pan across it without reflowing it.
      const atLayoutScale = !viewport || Math.abs(viewport.scale - 1) < 0.01
      const height = atLayoutScale ? viewport?.height ?? window.innerHeight : window.innerHeight
      const top = atLayoutScale ? viewport?.offsetTop ?? 0 : 0
      ref.current.style.height = `${height}px`
      ref.current.style.setProperty('--conversation-height', `${height}px`)
      ref.current.style.top = `${top}px`
      document.documentElement.style.setProperty('--mobile-viewport-height', `${height}px`)
      document.documentElement.style.setProperty('--mobile-viewport-top', `${top}px`)
    }
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      document.body.style.overflow = previous
      document.documentElement.style.removeProperty('--mobile-viewport-height')
      document.documentElement.style.removeProperty('--mobile-viewport-top')
    }
  }, [])
  return ref
}

export function MobileConversation({
  leadId,
  selectedChannel,
  selectedEmailAccountId,
  selectedEmailReplyId,
  onClose,
  onReplyContextChange,
}: {
  leadId: number
  selectedChannel: string | null
  selectedEmailAccountId: number | null
  selectedEmailReplyId: number | null
  onClose: () => void
  onReplyContextChange: (context: { channel: InboxChannel; accountId?: number | null; replyMessageId?: number }) => void
}) {
  const { dashboardScope } = useAuthStore()
  const frame = useConversationViewport()
  const timeline = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const lastInteraction = useRef(0)
  const [showLatest, setShowLatest] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [messageSearch, setMessageSearch] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus()
  }, [searchOpen])
  const [details, setDetails] = useState(false)
  const [localReply, setLocalReply] = useState<InboxMessage | null>(null)
  const [emailOptions, setEmailOptions] = useState(false)
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const resolve = useMutation({
    mutationFn: () =>
      thread?.threadState === 'resolved'
        ? inboxApi.reopenThread(leadId)
        : inboxApi.resolveThread(leadId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox-thread', leadId] })
      void queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })
  const result = useQuery({
    refetchOnWindowFocus: true,
    queryKey: ['inbox-thread', leadId, dashboardScope],
    queryFn: () => inboxApi.getThread(leadId),
    refetchInterval: 10_000,
  })
  const thread = result.data
  const markRead = useConversationRead(thread || null)
  const channel = CHANNEL_ORDER.includes(selectedChannel as InboxChannel)
    ? selectedChannel as InboxChannel
    : thread?.messages.length
      ? thread.channel
      : thread?.leadEmail
        ? 'email'
        : thread?.leadTelegramPeer
          ? 'telegram'
          : 'whatsapp'
  const emailContext = inboxEmailContext(thread || null, selectedEmailAccountId)
  const replyTarget = channel === 'email'
    ? thread?.messages.find(message => message.id === selectedEmailReplyId && isReplyableEmail(message)) ?? null
    : localReply?.channel === channel ? localReply : null
  const quotedEmailUnavailable = channel === 'email' && selectedEmailReplyId !== null &&
    (!replyTarget?.emailMessageId || replyTarget.emailAccountId !== emailContext.accountId)

  function clearReply() {
    setLocalReply(null)
    if (channel === 'email') onReplyContextChange({ channel })
  }
  const searchTerm = messageSearch.trim().toLocaleLowerCase()
  const searchMatches = searchOpen && searchTerm
    ? thread?.messages.filter(message => message.content.toLocaleLowerCase().includes(searchTerm)) ?? []
    : []
  const hasThread = Boolean(thread)
  useEffect(() => {
    const readVisible = () => {
      if (stick.current) markRead()
    }
    readVisible()
    document.addEventListener('visibilitychange', readVisible)
    return () => document.removeEventListener('visibilitychange', readVisible)
  }, [markRead])
  useEffect(() => {
    const node = timeline.current
    if (!node || !content.current) return
    const observer = new ResizeObserver(() => {
      if (stick.current) node.scrollTop = node.scrollHeight
    })
    observer.observe(node)
    observer.observe(content.current)
    return () => observer.disconnect()
  }, [hasThread])
  return (
    <div
      ref={frame}
      className="mobile-sales fixed inset-x-0 top-0 z-40 mx-auto flex h-dvh max-w-2xl flex-col overflow-hidden bg-background"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-border bg-surface px-2 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          className="flex h-14 w-11 shrink-0 items-center justify-center"
          aria-label="Back to inbox"
          onClick={onClose}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          className="min-h-14 min-w-0 flex-1 py-2 text-left"
          onClick={() => setDetails(true)}
          aria-label={thread ? `Lead details for ${thread.leadName || thread.name || 'this conversation'}` : undefined}
          disabled={!thread}
        >
          <span className="block truncate text-base font-semibold">
            {thread?.leadName || thread?.name || 'Conversation'}
          </span>
          <span className="block truncate text-xs text-text-muted">
            Reply via {CHANNELS[channel].label}
            {IS_DEMO ? ' · Sample data' : ''}
            {thread?.replyNeeded ? ' · Needs reply' : ''}
          </span>
        </button>
        <button
          type="button"
          aria-label="Search conversation"
          aria-expanded={searchOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center"
          onClick={() => setSearchOpen(!searchOpen)}
        >
          <Search className="h-5 w-5" />
        </button>
        {leadPhoneHref(thread?.leadMobile) ? (
          <LeadCallLink phone={thread?.leadMobile} iconOnly />
        ) : (
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center text-text-secondary"
            aria-label="Lead details and follow-ups"
            onClick={() => setDetails(true)}
            disabled={!thread}
          >
            <Info className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="min-h-11 shrink-0 rounded-md px-2 text-xs text-text-secondary disabled:opacity-40"
          disabled={!thread || resolve.isPending || user?.role === 'viewer'}
          onClick={() => resolve.mutate()}
        >
          {thread?.threadState === 'resolved' ? 'Reopen' : 'Resolve'}
        </button>
      </header>
      {searchOpen && (
        <div className="shrink-0 border-b border-border bg-surface p-3">
          <input
            type="search"
            ref={searchInput}
            aria-label="Search message text"
            placeholder="Find in this conversation"
            value={messageSearch}
            onChange={(event) => setMessageSearch(event.target.value)}
            className={mobileInput}
          />
          {messageSearch.trim() && (
            <div className="max-h-36 overflow-auto">
              <p role="status" className="py-1 text-xs text-text-muted">
                {searchMatches.length ? `${searchMatches.length} matches` : 'No matching messages'}
              </p>
              {searchMatches.map(message => (
                <button
                  type="button"
                  key={message.id}
                  className="block min-h-11 w-full truncate text-left text-sm"
                  onClick={() => {
                    stick.current = false
                    document.getElementById(`message-${message.id}`)?.scrollIntoView({ block: 'center' })
                  }}
                >
                  {message.content}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {channel === 'whatsapp' && !!thread && <WhatsAppReplyWindow key={`${leadId}:${thread.whatsappSession?.accountId}`} thread={thread} />}
      <ScheduledEmails emails={thread?.scheduledEmails} leadId={leadId} />
      <div
        ref={timeline}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
        onTouchMove={() => {
          lastInteraction.current = Date.now()
        }}
        onWheel={() => {
          lastInteraction.current = Date.now()
        }}
        onPointerDown={() => {
          lastInteraction.current = Date.now()
        }}
        onScroll={() => {
          const node = timeline.current
          if (node) {
            const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 64
            if (atBottom) {
              stick.current = true
              markRead()
            } else if (Date.now() - lastInteraction.current < 400) stick.current = false
            setShowLatest(!stick.current)
          }
        }}
      >
        {result.isRefetchError && Boolean(thread) && (
          <MobileError message="Refresh failed. Showing the last loaded conversation." retry={() => result.refetch()} />
        )}
        <div ref={content} className="space-y-3">
          {result.isPending ? (
            <p role="status" className="py-8 text-center text-sm text-text-muted">
              Loading conversation…
            </p>
          ) : !thread ? (
            <MobileError
              message="Could not load this conversation."
              retry={() => result.refetch()}
            />
          ) : !thread.messages.length ? (
            <p className="py-8 text-center text-sm text-text-muted">
              No messages yet. Start the conversation below.
            </p>
          ) : (
            thread.messages.map((message, index, all) => {
              return message.channel === 'email' ? (
                <MessageInteractions
                  key={message.id}
                  message={message}
                  onReply={(m) => {
                    onReplyContextChange({ channel: 'email', accountId: m.emailAccountId, replyMessageId: m.id })
                    requestAnimationFrame(() =>
                      document.querySelector<HTMLElement>('[aria-label="Email message"]')?.focus(),
                    )
                  }}
                >
                  <EmailMessageCard
                    message={message}
                    className={`max-w-[95%] p-3 ${message.direction === 'inbound' ? 'mr-auto' : 'ml-auto'}`}
                  />
                </MessageInteractions>
              ) : (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onReply={(m) => {
                    setLocalReply(m)
                    onReplyContextChange({ channel: m.channel })
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLTextAreaElement>('textarea[aria-label="Reply message"]')
                        ?.focus(),
                    )
                  }}
                  quotedMessage={all.find((m) => m.id === message.replyToMessageId)}
                  showDate={
                    index === 0 ||
                    new Date(all[index - 1].sentAt || all[index - 1].createdAt).toDateString() !==
                      new Date(message.sentAt || message.createdAt).toDateString()
                  }
                  showChannel={index === 0 || all[index - 1].channel !== message.channel}
                />
              )
            })
          )}
        </div>
      </div>
      {showLatest && (
        <button
          type="button"
          className={`${mobileButton} mx-auto mb-2 shrink-0 rounded-full shadow-sm`}
          onClick={() => {
            stick.current = true
            if (timeline.current) timeline.current.scrollTop = timeline.current.scrollHeight
            setShowLatest(false)
            markRead()
          }}
        >
          <ArrowDown className="h-4 w-4" />
          Latest messages
        </button>
      )}
      {!!thread && (
        <MobileReplyComposer
          key={`${channel}:${channel === 'email' ? emailContext.accountId : 'default'}`}
          thread={thread}
          stale={result.isRefetchError}
          replyTarget={replyTarget}
          clearReply={clearReply}
          channel={channel}
          emailContext={emailContext}
          quotedEmailUnavailable={quotedEmailUnavailable}
          options={emailOptions}
          setOptions={setEmailOptions}
          onChannelChange={(next) => {
            setLocalReply(null)
            setEmailOptions(false)
            onReplyContextChange({ channel: next })
          }}
          onAccountChange={accountId => onReplyContextChange({ channel: 'email', accountId })}
          onSent={() => {
            stick.current = true
          }}
        />
      )}
      <Dialog open={details} onOpenChange={setDetails}>
        <DialogContent
          showClose={false}
          className="mobile-sales flex max-h-[calc(var(--mobile-viewport-height,100dvh)*.9)] top-[calc(var(--mobile-viewport-top,0px)+var(--mobile-viewport-height,100dvh)/2)] flex-col overflow-hidden rounded-xl"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
            <div>
              <DialogTitle>Lead details</DialogTitle>
              <DialogDescription>Contact, notes and follow-ups</DialogDescription>
            </div>
            <DialogClose className={mobileButton}>Done</DialogClose>
          </div>
          <div className="overflow-y-auto p-3">
            <MobileLeadPanel key={leadId} leadId={leadId} showConversation={false} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MobileReplyComposer({
  thread,
  stale,
  channel,
  emailContext,
  quotedEmailUnavailable,
  options,
  setOptions,
  onChannelChange,
  onAccountChange,
  onSent,
  replyTarget,
  clearReply,
}: {
  thread: InboxThreadDetail
  stale: boolean
  channel: InboxChannel
  emailContext: ReturnType<typeof inboxEmailContext>
  quotedEmailUnavailable: boolean
  options: boolean
  setOptions: (open: boolean) => void
  onChannelChange: (channel: InboxChannel) => void
  onAccountChange: (id: number | null) => void
  onSent: () => void
  replyTarget: InboxMessage | null
  clearReply: () => void
}) {
  const { dashboardScope, user } = useAuthStore()
  const online = useOnlineStatus()
  const client = useQueryClient()
  const fromId = useId()
  const { sender, latestEmail, unavailableSender } = emailContext
  const accountId = channel === 'email' ? emailContext.accountId : null
  const suggestedSubject = buildReplySubject(replyTarget?.subject || latestEmail?.subject)
  const empty = (): Omit<EmailDraft, 'savedAt'> => ({
    subject: '',
    plainBody: '',
    htmlBody: '',
    channel,
    senderAccountId: accountId,
    cc: '',
    bcc: '',
  })
  const [draft, setDraft] = useState<Omit<EmailDraft, 'savedAt'>>(
    () => loadDraft(dashboardScope, thread.leadId, channel, accountId) ?? empty(),
  )
  const [storageFailed, setStorageFailed] = useState(false)
  const [attachments, setAttachments] = useState<MediaFile[]>([])
  const [templateId, setTemplateId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [recordingBusy, setRecordingBusy] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const requestIds = useRef(new Map<string, string>())
  const pendingFingerprint = useRef('')
  const updateDraft = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    // Persist on each edit, including just before iOS backgrounds this tab.
    // No delayed callback can save one conversation's text into another.
    setStorageFailed(!saveDraft(dashboardScope, thread.leadId, next))
  }
  const health = useQuery({
    refetchOnWindowFocus: true,
    queryKey: ['inbox-channel-health', dashboardScope],
    queryFn: inboxApi.channelHealth,
    refetchInterval: 30_000,
  })
  const templates = useQuery({
    refetchOnWindowFocus: true,
    queryKey: EMAIL_TEMPLATE_LIST_QUERY_KEY,
    queryFn: templatesApi.list,
    enabled: channel === 'email' && options,
  })
  const disabledReason = !online
    ? 'Offline. Your text draft stays here; reconnect to send.'
    : user?.role === 'viewer'
      ? 'Read-only access. Ask your administrator for reply access.'
      : stale
        ? 'Refresh the conversation before sending. Your draft stays here.'
      : channel === 'email'
        ? !thread.leadEmail
          ? 'This lead has no email address.'
          : unavailableSender
            ? 'The original sender is unavailable. Choose a sender to continue.'
            : quotedEmailUnavailable
              ? 'This reply target is unavailable. Clear the quote to start a new email.'
              : !sender
                ? 'No permitted sender is available.'
                : null
        : channel === 'telegram'
          ? !thread.leadTelegramPeer
            ? 'This lead has no Telegram contact.'
            : health.data?.telegram.status !== 'ready'
              ? 'Telegram is not connected.'
              : null
          : !(
                (thread.leadMobile && /^\+?[\d\s()-]{7,20}$/.test(thread.leadMobile)) ||
                (channel === 'whatsapp' &&
                  /^[A-Z]{2}(?:\.ENT)?\.[A-Za-z0-9]{1,128}$/.test(thread.waUserId || ''))
              )
            ? 'This lead has no valid phone number.'
            : health.data?.[channel]?.status !== 'ready'
              ? `${CHANNELS[channel].label} is not connected.`
              : null
  const send = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: () => {
      if (disabledReason) throw new Error(disabledReason)
      const fingerprint = JSON.stringify([
        thread.leadId,
        channel,
        accountId,
        draft,
        replyTarget?.id,
        attachments.map((file) => file.id),
      ])
      pendingFingerprint.current = fingerprint
      const requestId = requestIds.current.get(fingerprint) || crypto.randomUUID()
      requestIds.current.set(fingerprint, requestId)
      const submitted = loadDraft(dashboardScope, thread.leadId, channel, accountId)
      return inboxApi
        .send({
          leadId: thread.leadId,
          channel,
          clientMessageId: requestId,
          replyToMessageId: replyTarget?.id,
          text: draft.plainBody.trim(),
          ...(channel === 'email'
            ? {
                body: draft.plainBody.trim(),
                htmlBody: draft.htmlBody || undefined,
                subject: draft.subject.trim() || suggestedSubject,
                accountId,
                replyToMessageId:
                  replyTarget?.id || (latestEmail?.emailMessageId ? latestEmail.id : undefined),
                cc: draft.cc.trim() || undefined,
                bcc: draft.bcc.trim() || undefined,
              }
            : {}),
          attachmentIds: attachments.length ? attachments.map((file) => file.id) : undefined,
        })
        .then((response) => ({ response, submitted, fingerprint }))
    },
    onSuccess: ({ submitted, fingerprint }) => {
      requestIds.current.delete(fingerprint)
      clearSubmittedDraft(dashboardScope, thread.leadId, submitted)
      setDraft(empty())
      setAttachments([])
      client.invalidateQueries({ queryKey: ['inbox-thread', thread.leadId] })
      client.invalidateQueries({ queryKey: ['inbox-threads'] })
      clearReply()
      onSent()
    },
    onError: (err: Error) => {
      if (err instanceof ApiClientError && err.code === 'manual_send_failed')
        requestIds.current.delete(pendingFingerprint.current)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['inbox-thread', thread.leadId] })
      void client.invalidateQueries({ queryKey: ['inbox-threads'] })
    },
  })
  const apply = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: () =>
      templatesApi.render(Number(templateId), {
        leadId: thread.leadId,
        context: {
          name: thread.leadName,
          company: thread.leadCompany || '',
          email: thread.leadEmail || '',
          senderName: sender?.senderName || sender?.name || '',
          senderEmail: sender?.email || '',
        },
      }),
    onSuccess: (rendered) => {
      if (!rendered) return
      updateDraft({
        subject: rendered.subject || draft.subject,
        htmlBody: rendered.htmlBody || '',
        plainBody: getRenderedTemplateText(rendered),
      })
      setOptions(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })
  const canSend =
    !disabledReason &&
    !(channel === 'whatsapp' && !canSendWhatsAppFreeText(thread)) &&
    !send.isPending &&
    !apply.isPending &&
    !uploading &&
    !recordingBusy &&
    !(replyTarget && attachments.length) &&
    (draft.plainBody.trim() || (channel === 'whatsapp' && attachments.length)) &&
    (channel !== 'email' || draft.subject.trim() || suggestedSubject)
  return (
    <Dialog open={channel === 'email' && options} onOpenChange={setOptions}>
      <section
        aria-label="Reply composer"
        className="flex min-h-0 max-h-[max(min(7.5rem,50dvh),calc(var(--conversation-height,100dvh)-10rem-env(safe-area-inset-top)))] flex-col overflow-hidden border-t border-border bg-surface px-3 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="min-w-0">
              <span className="sr-only">Reply channel</span>
              <select
                value={channel}
                disabled={send.isPending || uploading || apply.isPending}
                className="h-11 max-w-full rounded-lg bg-surface-raised px-2 text-base"
                onChange={(event) => onChannelChange(event.target.value as InboxChannel)}
              >
                {CHANNEL_ORDER.map((id) => (
                  <option key={id} value={id}>
                    {CHANNELS[id].label}
                  </option>
                ))}
              </select>
            </label>
            {channel === 'email' && (
              <DialogTrigger asChild>
                <button type="button" disabled={uploading} className={`${mobileButton} min-w-0 text-text-secondary`}>
                  <span className="truncate">Email options</span>
                  <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              </DialogTrigger>
            )}
          </div>
          {channel === 'email' && sender && (
            <p className="mb-2 truncate text-xs text-text-muted" title={sender.email || sender.name}>
              From {sender.email || sender.name}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1">
            {channel === 'whatsapp' && (
              <VoiceRecorder
                disabled={send.isPending || !!disabledReason || !!replyTarget}
                onBusy={setRecordingBusy}
                onAdd={(file) => setAttachments((previous) => [...previous, file])}
              />
            )}
            {channel !== 'email' && (
              <div>
                <button
                  type="button"
                  aria-expanded={emojiOpen}
                  className="min-h-11 rounded-xl px-3 text-sm text-text-secondary"
                  onClick={() => setEmojiOpen(!emojiOpen)}
                >
                  Emoji
                </button>
                {emojiOpen && (
                  <div className="flex flex-wrap gap-1">
                    {['😀', '😊', '👍', '❤️', '🙏', '✅', '👋', '🎉'].map((value) => (
                      <button
                        type="button"
                        key={value}
                        className="h-11 w-11 text-2xl"
                        aria-label={`Insert ${value}`}
                        disabled={send.isPending}
                        onClick={() => updateDraft({ plainBody: draft.plainBody + value })}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {replyTarget && attachments.length > 0 && (
              <p role="status" className="text-sm text-warning">
                Remove the quote or attachments before sending.
              </p>
            )}
            {replyTarget && <ReplyPreview message={replyTarget} onCancel={clearReply} />}
            {!replyTarget && quotedEmailUnavailable && (
              <button type="button" className={mobileButton} onClick={clearReply}>Clear quote</button>
            )}
            {(channel === 'email' || channel === 'whatsapp') && (
              <AttachmentPicker
                attachments={attachments}
                onUploadingChange={setUploading}
                onAdd={(file) => setAttachments((previous) => [...previous, file])}
                onRemove={(id) =>
                  setAttachments((previous) => previous.filter((file) => file.id !== id))
                }
                disabled={send.isPending || !!disabledReason || !!replyTarget}
              />
            )}
          </div>
          {channel === 'email' && (
            <DialogContent className="max-h-[85dvh] overflow-y-auto space-y-3 p-4" size="sm">
              <DialogTitle>Email options</DialogTitle>
              <DialogDescription className="break-all">
                To: {thread.leadEmail || 'No email address'}
              </DialogDescription>
              <div>
                <label htmlFor={fromId} className="block text-xs text-text-secondary">From</label>
                <select id={fromId}
                  className={`${mobileInput} mt-1`}
                  value={accountId ?? ''}
                  disabled={send.isPending || uploading || apply.isPending}
                  onChange={(event) => onAccountChange(Number(event.target.value) || null)}
                >
                  {!sender && <option value="">No sender available</option>}
                  {thread.availableSenderAccounts?.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.senderName || account.name} · {account.email}
                    </option>
                  ))}
                </select>
              </div>
              <label className="block text-xs text-text-secondary">
                Subject
                <input
                  className={`${mobileInput} mt-1`}
                  value={draft.subject}
                  placeholder={suggestedSubject}
                  disabled={send.isPending || uploading || apply.isPending}
                  onChange={(event) => updateDraft({ subject: event.target.value })}
                />
              </label>
              <label className="block text-xs text-text-secondary">
                CC
                <input
                  className={`${mobileInput} mt-1`}
                  inputMode="email"
                  value={draft.cc}
                  disabled={send.isPending || uploading || apply.isPending}
                  onChange={(event) => updateDraft({ cc: event.target.value })}
                />
              </label>
              <label className="block text-xs text-text-secondary">
                BCC
                <input
                  className={`${mobileInput} mt-1`}
                  inputMode="email"
                  value={draft.bcc}
                  disabled={send.isPending || uploading || apply.isPending}
                  onChange={(event) => updateDraft({ bcc: event.target.value })}
                />
              </label>
              <label className="block text-xs text-text-secondary">
                Template
                <select
                  className={`${mobileInput} mt-1`}
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                >
                  <option value="">
                    {templates.isPending ? 'Loading templates…' : 'Choose template'}
                  </option>
                  {Array.isArray(templates.data) &&
                    templates.data.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className={`${mobileButton} w-full`}
                disabled={
                  !templateId || send.isPending || uploading || apply.isPending || !!disabledReason
                }
                onClick={() => apply.mutate()}
              >
                {apply.isPending ? 'Applying…' : 'Apply template'}
              </button>
              <p className="text-xs text-text-muted">Drafts are saved separately for each sender.</p>
              <DialogClose className={mobileButton}>Done</DialogClose>
            </DialogContent>
          )}
          {send.isPending && (
            <p
              role="status"
              className="mb-3 ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-accent-muted p-3 text-sm"
            >
              {draft.plainBody}
              <span className="mt-1 block text-xs text-text-secondary">Submitting…</span>
            </p>
          )}
        </div>
        <div className="mt-1 flex shrink-0 items-end gap-2">
          <div className="min-w-0 flex-1">
            {channel === 'email' ? (
              <EmailEditor
                compact
                content={draft.htmlBody}
                onContentChange={(htmlBody, plainBody) => updateDraft({ htmlBody, plainBody })}
                disabled={send.isPending || user?.role === 'viewer'}
                placeholder="Write your reply…"
              />
            ) : (
              <textarea
                aria-label="Reply message"
                className={`${mobileInput} max-h-36 resize-none`}
                rows={2}
                value={draft.plainBody}
                onChange={(event) => {
                  event.target.style.height = 'auto'
                  event.target.style.height = `${Math.min(event.target.scrollHeight, 144)}px`
                  updateDraft({ plainBody: event.target.value })
                }}
                disabled={send.isPending || user?.role === 'viewer'}
                placeholder="Write your reply…"
              />
            )}
          </div>
          <button
            type="button"
            aria-label="Send reply"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg disabled:opacity-40"
            disabled={!canSend}
            onClick={() => send.mutate()}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        {uploading && (
          <p role="status" className="mt-2 text-xs text-text-muted">
            Uploading attachment…
          </p>
        )}
        {(disabledReason || send.error || storageFailed) && (
          <p role="status" className="mt-2 max-h-16 overflow-y-auto text-xs leading-5 text-warning">
            {send.error?.message ||
              disabledReason ||
              'Device storage is unavailable. Keep this conversation open to retain your draft.'}
          </p>
        )}
      </section>
    </Dialog>
  )
}
