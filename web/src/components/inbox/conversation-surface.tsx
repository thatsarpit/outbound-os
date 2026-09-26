/**
 * The conversation pane — thread header, timeline and composer for one lead.
 *
 * Extracted from inbox.tsx. Self-contained: it takes everything it needs as
 * props and owns no cross-cutting state, which is why it could be lifted out
 * cleanly while the rest of that file could not.
 */
import { type RefObject } from 'react'
import { type EmailTemplate } from '@/api/endpoints/templates'
import type { InboxChannel, InboxThreadDetail, MediaFile } from '@/api/types'
import { ComposerBar } from '@/components/inbox/composer-bar'
import { EmailMessageCard } from '@/components/inbox/email-message-card'
import { SenderHealthCard } from '@/components/inbox/sender-health-card'
import { ThreadHeader } from '@/components/inbox/thread-header'
import { MessageBubble } from '@/components/inbox/whatsapp-message-bubble'
import { SkeletonLine } from '@/components/ui'
import { getChannel } from '@/lib/channels'
import { cn } from '@/lib/utils'
import { AlertCircle, Mail } from 'lucide-react'
export interface ConversationSurfaceProps {
  activeThread?: InboxThreadDetail | null
  threadLoading: boolean
  threadError: Error | null
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
  onSend: () => void
  replyPending: boolean
  replyError: Error | null
  replyDisabledReason: string | null
  messagesEndRef: RefObject<HTMLDivElement | null>
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
  onScheduleSend: (scheduledAt: string) => void
}

export function ConversationSurface({
  activeThread,
  threadLoading,
  threadError,
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
  messagesEndRef,
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
  const availableSenderAccounts = activeThread?.availableSenderAccounts ?? []
  const sendDisabled =
    replyPending ||
    !replyText.trim() ||
    Boolean(replyDisabledReason) ||
    (composerChannel === 'email' && !composerSubject.trim())

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        !drawer && 'glass rounded-lg border border-border',
      )}
    >
      <ThreadHeader
        thread={activeThread}
        activeChannel={composerChannel}
        drawer={drawer}
        onClose={onClose}
        onResolve={onResolve}
        onReopen={onReopen}
        onAssignSelf={onAssignSelf}
        isMutating={threadActionPending}
      />

      {composerChannel === 'email' && (
        <SenderHealthCard
          leadEmail={activeThread?.leadEmail}
          accounts={availableSenderAccounts}
          selectedAccountId={senderAccountId}
          assignedAccountId={activeThread?.assignedEmailAccountId}
          className="mx-4 mt-3 sm:mx-5"
        />
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
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
              Start the first outbound reply from the composer below. WhatsApp, email, iMessage, and
              Telegram are available here.
            </p>
          </div>
        ) : (
          (activeThread.messages ?? []).map((message, index, all) => {
            // Label the channel only where it changes, so a single-channel
            // thread stays clean but a lead reached on two channels reads
            // unambiguously.
            const showChannel = index === 0 || all[index - 1].channel !== message.channel
            return message.channel === 'email' ? (
              <EmailMessageCard
                key={message.id}
                message={message}
                className={cn(
                  message.direction === 'outbound' ? 'ml-auto max-w-[92%]' : 'mr-auto max-w-[92%]',
                )}
              />
            ) : (
              <MessageBubble key={message.id} message={message} showChannel={showChannel} />
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

        <div ref={messagesEndRef} />
      </div>

      <ComposerBar
        channel={composerChannel}
        onChannelChange={setComposerChannel}
        subject={composerSubject}
        onSubjectChange={setComposerSubject}
        text={replyText}
        onTextChange={setReplyText}
        htmlBody={htmlBody}
        onHtmlBodyChange={setHtmlBody}
        onSend={onSend}
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
        onScheduleSend={onScheduleSend}
        helperLabel={
          composerChannel === 'email'
            ? 'Reply in thread from the selected sender'
            : `Enter to send on ${getChannel(composerChannel).label} · Shift+Enter for a new line`
        }
        placeholder={
          composerChannel === 'email'
            ? 'Write the email reply your agent should send…'
            : `Type the ${getChannel(composerChannel).label} reply…`
        }
        sendDisabled={sendDisabled}
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
