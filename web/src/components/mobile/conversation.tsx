import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ChevronDown, Info, Send } from 'lucide-react'
import { inboxApi } from '@/api/endpoints/inbox'
import { EMAIL_TEMPLATE_LIST_QUERY_KEY, templatesApi } from '@/api/endpoints/templates'
import type { InboxChannel, InboxThreadDetail, MediaFile } from '@/api/types'
import { EmailEditor } from '@/components/inbox/email-editor'
import { AttachmentPicker } from '@/components/inbox/attachment-picker'
import { MessageMedia } from '@/components/inbox/message-media'
import { MessageBubble } from '@/components/inbox/whatsapp-message-bubble'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { MobileLeadPanel } from './lead-panel'
import { MobileError, mobileInput, mobileButton, mobileDueDate } from './mobile-shared'
import { useWorkspaceTimezone } from '@/hooks/use-workspace-timezone'
import { useAuthStore } from '@/stores/auth-store'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { CHANNELS, CHANNEL_ORDER } from '@/lib/channels'
import { buildReplySubject, getRenderedTemplateText } from '@/lib/email-compose'
import { clearSubmittedDraft, loadDraft, saveDraft, type EmailDraft } from '@/lib/email-drafts'
import { IS_DEMO } from '@/demo/demo-chrome'
import { toast } from '@/stores/toast-store'

// visualViewport follows Safari's keyboard and browser chrome. The timeline
// takes the remaining height while the composer stays inside the visible area.
function useConversationViewport() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => {
      if (!ref.current) return
      ref.current.style.height = `${viewport?.height ?? window.innerHeight}px`
      ref.current.style.setProperty(
        '--conversation-height',
        `${viewport?.height ?? window.innerHeight}px`,
      )
      ref.current.style.top = `${viewport?.offsetTop ?? 0}px`
      document.documentElement.style.setProperty(
        '--mobile-viewport-height',
        `${viewport?.height ?? window.innerHeight}px`,
      )
      document.documentElement.style.setProperty(
        '--mobile-viewport-top',
        `${viewport?.offsetTop ?? 0}px`,
      )
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
  initialChannel,
  onClose,
  onChannelNavigate,
}: {
  leadId: number
  initialChannel: string | null
  onClose: () => void
  onChannelNavigate: (channel: InboxChannel) => void
}) {
  const { dashboardScope } = useAuthStore()
  const { timezone } = useWorkspaceTimezone()
  const frame = useConversationViewport()
  const timeline = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [showLatest, setShowLatest] = useState(false)
  const [details, setDetails] = useState(false)
  const [channelChoice, setChannel] = useState<InboxChannel | null>(
    CHANNEL_ORDER.includes(initialChannel as InboxChannel)
      ? (initialChannel as InboxChannel)
      : (loadDraft(dashboardScope, leadId)?.channel ?? null),
  )
  const [accountChoice, setAccount] = useState<number | null>(
    () => loadDraft(dashboardScope, leadId)?.senderAccountId ?? null,
  )
  const result = useQuery({
    refetchOnWindowFocus: true,
    queryKey: ['inbox-thread', leadId, dashboardScope],
    queryFn: () => inboxApi.getThread(leadId),
    refetchInterval: 10_000,
  })
  const thread = result.data
  const channel =
    channelChoice ??
    (thread?.messages.length
      ? thread.channel
      : thread?.leadEmail
        ? 'email'
        : thread?.leadTelegramPeer
          ? 'telegram'
          : 'whatsapp')
  const accounts = thread?.availableSenderAccounts ?? []
  const accountId =
    accounts.find((account) => account.id === accountChoice)?.id ??
    accounts.find((account) => account.id === thread?.assignedEmailAccountId)?.id ??
    accounts[0]?.id ??
    null
  const hasThread = Boolean(thread)
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
          disabled={!thread}
        >
          <span className="block truncate text-base font-semibold">
            {thread?.leadName || thread?.name || 'Conversation'}
          </span>
          <span className="block truncate text-xs text-text-muted">
            {CHANNELS[channel].label}
            {IS_DEMO ? ' · Sample data' : ''}
            {thread?.replyNeeded ? ' · Needs reply' : ''}
          </span>
        </button>
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center text-text-secondary"
          aria-label="Lead details and follow-ups"
          onClick={() => setDetails(true)}
          disabled={!thread}
        >
          <Info className="h-5 w-5" />
        </button>
      </header>
      <div
        ref={timeline}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
        onScroll={() => {
          const node = timeline.current
          if (node) {
            stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64
            setShowLatest(!stick.current)
          }
        }}
      >
        <div ref={content} className="space-y-3">
          {result.isPending ? (
            <p role="status" className="py-8 text-center text-sm text-text-muted">
              Loading conversation…
            </p>
          ) : result.error || !thread ? (
            <MobileError
              message="Could not load this conversation."
              retry={() => result.refetch()}
            />
          ) : !thread.messages.length ? (
            <p className="py-8 text-center text-sm text-text-muted">
              No messages yet. Start the conversation below.
            </p>
          ) : (
            thread.messages.map((message, index, all) =>
              message.channel === 'email' ? (
                <article
                  key={message.id}
                  className={`max-w-[95%] rounded-xl border border-border p-3 ${message.direction === 'inbound' ? 'mr-auto bg-surface' : 'ml-auto bg-surface-raised'}`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
                    <span>
                      {message.direction === 'inbound' ? 'Received email' : 'Sent email'} ·{' '}
                      {message.status}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm font-medium">
                    {message.subject || 'Email reply'}
                  </p>
                  <p className="mt-1 break-all text-xs text-text-muted">{message.senderDisplay}</p>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                    {message.content}
                  </p>
                  {message.mediaUrl && (
                    <MessageMedia
                      messageId={message.id}
                      mediaType={message.mediaType}
                      filename={message.mediaFilename}
                      className="min-h-11"
                    />
                  )}
                  <p className="mt-3 text-[11px] text-text-muted">
                    {mobileDueDate(message.sentAt || message.createdAt, timezone)}
                  </p>
                </article>
              ) : (
                <MessageBubble
                  key={message.id}
                  message={message}
                  showChannel={index === 0 || all[index - 1].channel !== message.channel}
                />
              ),
            )
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
          }}
        >
          <ArrowDown className="h-4 w-4" />
          Latest messages
        </button>
      )}
      {!!thread && (
        <MobileReplyComposer
          key={`${channel}:${channel === 'email' ? accountId : 'default'}`}
          thread={thread}
          channel={channel}
          accountId={channel === 'email' ? accountId : null}
          onChannelChange={(next) => {
            setChannel(next)
            onChannelNavigate(next)
          }}
          onAccountChange={setAccount}
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
  channel,
  accountId,
  onChannelChange,
  onAccountChange,
  onSent,
}: {
  thread: InboxThreadDetail
  channel: InboxChannel
  accountId: number | null
  onChannelChange: (channel: InboxChannel) => void
  onAccountChange: (id: number | null) => void
  onSent: () => void
}) {
  const { dashboardScope, user } = useAuthStore()
  const online = useOnlineStatus()
  const client = useQueryClient()
  const latestEmail = [...thread.messages].reverse().find((message) => message.channel === 'email')
  const empty = (): Omit<EmailDraft, 'savedAt'> => ({
    subject: buildReplySubject(latestEmail?.subject || thread.subject),
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
  const [options, setOptions] = useState(false)
  const [storageFailed, setStorageFailed] = useState(false)
  const [attachments, setAttachments] = useState<MediaFile[]>([])
  const [templateId, setTemplateId] = useState('')
  const [uploading, setUploading] = useState(false)
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
  const sender = thread.availableSenderAccounts?.find((account) => account.id === accountId)
  const disabledReason = !online
    ? 'Offline. Your text draft stays here; reconnect to send.'
    : user?.role === 'viewer'
      ? 'Read-only access. Ask your administrator for reply access.'
      : channel === 'email'
        ? !thread.leadEmail
          ? 'This lead has no email address.'
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
      const submitted = loadDraft(dashboardScope, thread.leadId, channel, accountId)
      return inboxApi
        .send({
          leadId: thread.leadId,
          channel,
          text: draft.plainBody.trim(),
          ...(channel === 'email'
            ? {
                body: draft.plainBody.trim(),
                htmlBody: draft.htmlBody || undefined,
                subject: draft.subject.trim(),
                accountId,
                replyToMessageId: latestEmail?.id,
                cc: draft.cc.trim() || undefined,
                bcc: draft.bcc.trim() || undefined,
              }
            : {}),
          attachmentIds: attachments.length ? attachments.map((file) => file.id) : undefined,
        })
        .then((response) => ({ response, submitted }))
    },
    onSuccess: ({ submitted }) => {
      clearSubmittedDraft(dashboardScope, thread.leadId, submitted)
      setDraft(empty())
      setAttachments([])
      client.invalidateQueries({ queryKey: ['inbox-thread', thread.leadId] })
      client.invalidateQueries({ queryKey: ['inbox-threads'] })
      toast.success('Reply submitted')
      onSent()
    },
    onError: (err: Error) => toast.error(err.message),
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
    !send.isPending &&
    !apply.isPending &&
    !uploading &&
    (draft.plainBody.trim() || (channel === 'whatsapp' && attachments.length)) &&
    (channel !== 'email' || draft.subject.trim())
  return (
    <section
      aria-label="Reply composer"
      className="max-h-[calc(var(--conversation-height,100dvh)-4rem-env(safe-area-inset-top))] shrink-0 overflow-y-auto border-t border-border bg-surface px-3 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))]"
    >
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
        <button
          type="button"
          aria-expanded={options}
          disabled={uploading}
          onClick={() => setOptions(!options)}
          className={`${mobileButton} min-w-0 border-0 text-text-secondary`}
        >
          <span className="truncate">
            {channel === 'email'
              ? sender?.senderName || sender?.name || 'Email options'
              : 'Options'}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </button>
      </div>
      {options && (
        <div className="mb-3 max-h-[min(35dvh,max(3rem,calc(var(--conversation-height,100dvh)-16rem)))] space-y-3 overflow-y-auto rounded-lg border border-border p-3">
          {channel === 'email' && (
            <>
              <p className="break-all text-xs text-text-muted">
                To: {thread.leadEmail || 'No email address'}
              </p>
              <label className="block text-xs text-text-secondary">
                From
                <select
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
              </label>
              <label className="block text-xs text-text-secondary">
                Subject
                <input
                  className={`${mobileInput} mt-1`}
                  value={draft.subject}
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
            </>
          )}
          {(channel === 'email' || channel === 'whatsapp') && (
            <AttachmentPicker
              attachments={attachments}
              onUploadingChange={setUploading}
              onAdd={(file) => setAttachments((previous) => [...previous, file])}
              onRemove={(id) =>
                setAttachments((previous) => previous.filter((file) => file.id !== id))
              }
              disabled={send.isPending || !!disabledReason}
            />
          )}
          <p className="text-xs leading-5 text-text-muted">
            Text drafts are saved on this device, separately for each channel and sender. Reattach
            files after reopening a conversation.
          </p>
        </div>
      )}
      <div className="flex items-end gap-2">
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
              onChange={(event) => updateDraft({ plainBody: event.target.value })}
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
  )
}
