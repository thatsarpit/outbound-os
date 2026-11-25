import { ScheduledEmails } from './scheduled-emails'
import { ReplyPreview, MessageInteractions } from './message-interactions'
/**
 * The conversation pane — thread header, timeline and composer for one lead.
 *
 * Extracted from inbox.tsx. Self-contained: it takes everything it needs as
 * props and owns no cross-cutting state, which is why it could be lifted out
 * cleanly while the rest of that file could not.
 */
import { WhatsAppReplyWindow, canSendWhatsAppFreeText } from './whatsapp-reply-window'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useConversationRead } from '@/hooks/use-conversation-read'
import { type EmailTemplate } from '@/api/endpoints/templates'
import type { InboxChannel, InboxThreadDetail, InboxMessage, MediaFile } from '@/api/types'
import { ComposerBar } from '@/components/inbox/composer-bar'
import { EmailMessageCard } from '@/components/inbox/email-message-card'
import { ThreadHeader } from '@/components/inbox/thread-header'
import { MessageBubble } from '@/components/inbox/whatsapp-message-bubble'
import { SkeletonLine } from '@/components/ui'
import { getChannel } from '@/lib/channels'
import { cn } from '@/lib/utils'
import { AlertCircle, Mail } from 'lucide-react'
/**
 * Keeps the timeline on the newest message: when a conversation opens, when a
 * message arrives, and when a photo or file preview finishes loading and
 * pushes the content down. Scrolling up to read history lets go; scrolling
 * back to the bottom, or sending, holds again.
 *
 * Each surface owns this. It used to be one ref shared by the desktop pane and
 * the phone drawer, and the drawer — mounted but hidden on desktop — held it,
 * so the desktop timeline never scrolled.
 */
function useStickToBottom(conversationKey: unknown, sending: boolean, onRead: () => void) {
  const onReadRef = useRef(onRead)
  useEffect(() => {
    onReadRef.current = onRead
  }, [onRead])
  const timelineRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const toBottom = () => {
    const el = timelineRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  useLayoutEffect(() => {
    stick.current = true
    toBottom()
  }, [conversationKey, sending])

  useEffect(() => {
    const timeline = timelineRef.current
    const content = contentRef.current
    if (!timeline || !content || typeof ResizeObserver === 'undefined') return
    // The content grows as previews load; the pane itself shrinks when the
    // composer grows. Either one moves the bottom out of view.
    const observer = new ResizeObserver(() => {
      if (stick.current) toBottom()
    })
    observer.observe(timeline)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const readVisible = () => {
      if (stick.current) onRead()
    }
    readVisible()
    document.addEventListener('visibilitychange', readVisible)
    return () => document.removeEventListener('visibilitychange', readVisible)
  }, [onRead])

  // Only a person scrolling can let go. The browser scrolls too — it keeps
  // the view steady while previews load above it — and those events would
  // otherwise look like someone scrolling up.
  const lastTouch = useRef(0)
  const touched = () => {
    lastTouch.current = Date.now()
  }
  const onTimelineScroll = () => {
    const el = timelineRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (atBottom) {
      stick.current = true
      onReadRef.current()
    } else if (Date.now() - lastTouch.current < 400) stick.current = false
  }
  const timelineProps = {
    onScroll: onTimelineScroll,
    onWheel: touched,
    onTouchMove: touched,
    onPointerDown: touched,
    onKeyDown: touched,
  }

  return { timelineRef, contentRef, timelineProps }
}

export interface ConversationSurfaceProps {
  activeThread?: InboxThreadDetail | null
  threadLoading: boolean
  threadError: Error | null
  headerActions?: ReactNode
  replyText: string
  setReplyText: (value: string) => void
  htmlBody: string
  setHtmlBody: (value: string) => void
  composerChannel: InboxChannel
  setComposerChannel: (value: InboxChannel) => void
  composerSubject: string
  setComposerSubject: (value: string) => void
  senderAccountId: number | null
  setSenderAccountId: (value: number | null) => void
  templates: EmailTemplate[]
  selectedTemplateId: number | null
  setSelectedTemplateId: (value: number | null) => void
  onApplyTemplate: () => void
  templatesLoading: boolean
  templateApplyPending: boolean
  onSend: (messageId?: number) => Promise<unknown>
  replyPending: boolean
  replyError: Error | null
  replyDisabledReason: string | null
  drawer?: boolean
  onClose?: () => void
  onResolve?: () => void
  onReopen?: () => void
  onAssignSelf?: () => void
  threadActionPending?: boolean
  attachments: MediaFile[]
  onAddAttachment: (file: MediaFile) => void
  onRemoveAttachment: (id: number) => void
  cc: string
  onCcChange: (value: string) => void
  bcc: string
  onBccChange: (value: string) => void
  onScheduleSend: (scheduledAt: string) => Promise<void>
}

export function ConversationSurface({
  activeThread,
  threadLoading,
  threadError,
  headerActions,
  replyText,
  setReplyText,
  htmlBody,
  setHtmlBody,
  composerChannel,
  setComposerChannel,
  composerSubject,
  setComposerSubject,
  senderAccountId,
  setSenderAccountId,
  templates,
  selectedTemplateId,
  setSelectedTemplateId,
  onApplyTemplate,
  templatesLoading,
  templateApplyPending,
  onSend,
  replyPending,
  replyError,
  replyDisabledReason,
  drawer = false,
  onClose,
  onResolve,
  onReopen,
  onAssignSelf,
  threadActionPending = false,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  cc,
  onCcChange,
  bcc,
  onBccChange,
  onScheduleSend,
}: ConversationSurfaceProps) {
  const [selectedReply, setSelectedReply] = useState<InboxMessage | null>(null)
  const replyTarget =
    selectedReply?.leadId === activeThread?.leadId && selectedReply?.channel === composerChannel
      ? selectedReply
      : null

  const markRead = useConversationRead(activeThread)
  const { timelineRef, contentRef, timelineProps } = useStickToBottom(
    activeThread?.leadId,
    replyPending,
    markRead,
  )
  const availableSenderAccounts = activeThread?.availableSenderAccounts ?? []
  const sendDisabled =
    replyPending ||
    (composerChannel === 'whatsapp' && !canSendWhatsAppFreeText(activeThread)) ||
    // On WhatsApp, files alone are a message; the text becomes their caption.
    (!replyText.trim() && !(composerChannel === 'whatsapp' && attachments.length > 0)) ||
    Boolean(replyDisabledReason) ||
    (composerChannel === 'email' && !composerSubject.trim())

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        !drawer && 'glass rounded-lg border border-border',
      )}
    >
      <ThreadHeader
        thread={activeThread}
        activeChannel={composerChannel}
        actions={headerActions}
        drawer={drawer}
        onClose={onClose}
        onResolve={onResolve}
        onReopen={onReopen}
        onAssignSelf={onAssignSelf}
        isMutating={threadActionPending}
      />

      {composerChannel === 'whatsapp' && activeThread && (
        <WhatsAppReplyWindow key={`${activeThread.leadId}:${activeThread.whatsappSession?.accountId}`} thread={activeThread} />
      )}
      <ScheduledEmails emails={activeThread?.scheduledEmails} leadId={activeThread?.leadId} />
      <div
        ref={timelineRef}
        {...timelineProps}
        className="min-h-24 flex-1 overflow-y-auto px-4 py-4 sm:px-5"
      >
        <div ref={contentRef} className="space-y-3">
          {threadLoading ? (
            <div className="flex flex-col gap-4 py-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonLine
                  key={index}
                  className={cn(
                    'h-20 w-4/5 rounded-md',
                    index % 2 === 0 ? 'self-end bg-surface-raised' : 'self-start bg-info-muted/40',
                  )}
                />
              ))}
            </div>
          ) : threadError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-text-muted">
              <AlertCircle className="h-10 w-10 text-danger/80" />
              <p className="mt-4 text-sm font-medium text-danger">Unable to load messages</p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">
                {threadError.message || 'Refresh the conversation or try another lead.'}
              </p>
            </div>
          ) : !activeThread?.messages?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-text-muted">
              <Mail className="h-10 w-10 opacity-40" />
              <p className="mt-4 text-sm font-medium text-text-primary">
                No conversation history yet
              </p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">
                Start the first outbound reply from the composer below. WhatsApp, email, iMessage,
                and Telegram are available here.
              </p>
            </div>
          ) : (
            (activeThread.messages ?? []).map((message, index, all) => {
              // Label the channel only where it changes, so a single-channel
              // thread stays clean but a lead reached on two channels reads
              // unambiguously.
              const showChannel = index === 0 || all[index - 1].channel !== message.channel
              return message.channel === 'email' ? (
                <MessageInteractions
                  key={message.id}
                  message={message}
                  onReply={(m) => {
                    setSelectedReply({ ...m })
                    setComposerChannel(m.channel)
                  }}
                >
                  <EmailMessageCard
                    message={message}
                    className={cn(
                      message.direction === 'outbound'
                        ? 'ml-auto max-w-[92%]'
                        : 'mr-auto max-w-[92%]',
                    )}
                  />
                </MessageInteractions>
              ) : (
                <MessageBubble
                  key={message.id}
                  message={message}
                  showChannel={showChannel}
                  onReply={(m) => {
                    setSelectedReply({ ...m })
                    setComposerChannel(m.channel)
                  }}
                  quotedMessage={all.find((m) => m.id === message.replyToMessageId)}
                  showDate={
                    index === 0 ||
                    new Date(all[index - 1].sentAt || all[index - 1].createdAt).toDateString() !==
                      new Date(message.sentAt || message.createdAt).toDateString()
                  }
                />
              )
            })
          )}

          {replyPending && (
            <div className="ml-auto flex max-w-[88%] items-center gap-1 rounded-md rounded-br-md border border-border bg-surface-raised px-4 py-3 animate-fade-in sm:max-w-[75%]">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted" />
            </div>
          )}
        </div>
      </div>

      {replyTarget && (
        <div className="px-4 pt-2">
          <ReplyPreview message={replyTarget} onCancel={() => setSelectedReply(null)} />
        </div>
      )}
      <ComposerBar
        key={`${activeThread?.leadId ?? 'none'}:${composerChannel}:${senderAccountId ?? 'default'}`}
        channel={composerChannel}
        onChannelChange={(channel) => {
          setSelectedReply(null)
          setComposerChannel(channel)
        }}
        subject={composerSubject}
        onSubjectChange={setComposerSubject}
        text={replyText}
        onTextChange={setReplyText}
        htmlBody={htmlBody}
        onHtmlBodyChange={setHtmlBody}
        onSend={() => {
          void onSend(replyTarget?.id)
            .then(() => setSelectedReply((current) => (current === replyTarget ? null : current)))
            .catch(() => {})
        }}
        sendPending={replyPending}
        senderAccounts={availableSenderAccounts}
        senderAccountId={senderAccountId}
        onSenderAccountChange={setSenderAccountId}
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onTemplateChange={setSelectedTemplateId}
        onApplyTemplate={onApplyTemplate}
        templatesLoading={templatesLoading}
        templateApplyPending={templateApplyPending}
        templateDisabled={!activeThread?.leadEmail}
        templateLabel="Email template"
        templateDescription="Apply a rendered template directly into this reply composer."
        attachments={attachments}
        onAddAttachment={onAddAttachment}
        onRemoveAttachment={onRemoveAttachment}
        cc={cc}
        onCcChange={onCcChange}
        bcc={bcc}
        onBccChange={onBccChange}
        onScheduleSend={replyTarget ? undefined : onScheduleSend}
        helperLabel={
          composerChannel === 'email'
            ? 'Ctrl / ⌘ + Enter to send'
            : `Enter to send on ${getChannel(composerChannel).label} · Shift+Enter for a new line`
        }
        placeholder={
          composerChannel === 'email'
            ? 'Write your reply…'
            : `Type the ${getChannel(composerChannel).label} reply…`
        }
        sendDisabled={sendDisabled}
        disabled={replyPending || replyDisabledReason?.startsWith('Read-only')}
      />

      {(replyError || replyDisabledReason) && (
        <div
          className={cn(
            'mx-4 mb-3 flex items-center gap-2 rounded-lg p-2.5 text-xs animate-slide-up sm:mx-5',
            replyError ? 'bg-danger-muted text-danger' : 'bg-warning-muted text-warning',
          )}
        >
          <AlertCircle className="h-3.5 w-3.5" />
          {replyError?.message || replyDisabledReason}
        </div>
      )}
    </div>
  )
}
