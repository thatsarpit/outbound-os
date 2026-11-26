import type { InboxMessage } from '@/api/types'
import { cn } from '@/lib/utils'
import { getChannel } from '@/lib/channels'
import { ChannelBadge } from './channel-badge'
import { MessageInteractions } from './message-interactions'
import { MessageMedia } from './message-media'

/**
 * A single message in a conversation.
 *
 * Direction is carried by side and fill: outbound sits right and is tinted with
 * the channel's own colour, inbound sits left on a neutral surface. That makes
 * the channel readable from the message body itself, which matters when one
 * lead has been reached on WhatsApp and email in the same day.
 *
 * The channel label only appears when a message is on a different channel from
 * the one before it — repeating it on every bubble was noise, since a thread is
 * almost always one channel throughout.
 */
export function MessageBubble({
  message,
  showChannel = false,
  className,
  onReply,
  quotedMessage,
  showDate = false,
}: {
  message: InboxMessage
  onReply?: (message: InboxMessage) => void
  quotedMessage?: InboxMessage
  showDate?: boolean
  /** Set when this message switches channel relative to the previous one. */
  showChannel?: boolean
  className?: string
}) {
  const failed = ['failed', 'permanently_failed'].includes(message.status)
  const reason = message.providerStatusReason
  const isInbound = message.direction === 'inbound'
  const unsupported =
    isInbound &&
    message.channel === 'whatsapp' &&
    /^\[(unsupported|Unsupported WhatsApp message)\]$/i.test(message.content.trim())
  const meta = getChannel(message.channel)

  return (
    <>
      {showDate && (
        <p className="my-4 text-center text-xs font-medium text-text-secondary">
          {new Date(message.sentAt || message.createdAt).toLocaleDateString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      )}
      <MessageInteractions message={message} onReply={onReply}>
        <div className={cn('flex w-full', isInbound ? 'justify-start' : 'justify-end')}>
          <div className={cn('flex max-w-[85%] flex-col gap-1 sm:max-w-[76%]', className)}>
            {message.websiteLeadLabel && (
              <p className="px-0.5 text-xs font-medium text-accent">
                {message.websiteLeadLabel}{message.websiteSourceName && ` · ${message.websiteSourceName}`}
              </p>
            )}
            {showChannel && (
              <ChannelBadge
                channel={message.channel}
                variant="inline"
                className={cn('px-0.5', isInbound ? 'self-start' : 'self-end')}
              />
            )}

            <div
              className={cn(
                'rounded-2xl border px-3.5 py-2.5 text-[15px] leading-relaxed sm:text-sm',
                isInbound
                  ? 'rounded-tl-md border-border bg-surface-raised text-text-primary'
                  : cn('rounded-tr-md text-text-primary', meta.bg, meta.border),
              )}
            >
              {message.replyToMessageId && (
                <button
                  type="button"
                  className="mb-2 block w-full truncate rounded-lg border-l-2 border-accent bg-background/30 p-2 text-left text-xs text-text-secondary"
                  onClick={() =>
                    document.getElementById(`message-${message.replyToMessageId}`)?.scrollIntoView({
                      block: 'center',
                      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? 'instant'
                        : 'smooth',
                    })
                  }
                >
                  {quotedMessage?.content || 'Original message unavailable'}
                </button>
              )}
              {!(
                message.mediaUrl &&
                /^\[(Photo|Video|Audio|Voice message|Sticker|Image|Document|Pdf)\]/.test(
                  message.content || '',
                )
              ) && (
                <p className="whitespace-pre-wrap break-words">
                  {unsupported
                    ? 'WhatsApp could not provide this message’s content. Ask the customer to resend it as a standard text, photo or file.'
                    : message.content}
                </p>
              )}

              {message.mediaUrl && (
                <MessageMedia
                  messageId={message.id}
                  mediaType={message.mediaType}
                  filename={message.mediaFilename}
                />
              )}
            </div>

            <span
              className={cn(
                'px-0.5 text-xs tabular-nums text-text-secondary',
                isInbound ? 'self-start' : 'self-end',
              )}
            >
              <time
                dateTime={message.sentAt || message.createdAt}
                title={new Date(message.sentAt || message.createdAt).toLocaleString()}
              >
                {new Date(message.sentAt || message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              {!isInbound && message.status
                ? ` · ${message.status === 'sent' && message.channel === 'whatsapp' ? 'Accepted · awaiting delivery' : message.status === 'unconfirmed' ? 'Confirmation unknown' : message.status}`
                : ''}
            </span>
            {(failed || message.status === 'unconfirmed' || message.status === 'sending') && (
              <p
                role="status"
                className="rounded-md bg-warning-muted px-3 py-2 text-xs leading-5 text-warning"
              >
                {reason === 're_engagement_required'
                  ? 'Not delivered. WhatsApp required an approved template for this message.'
                  : reason === 'thread_not_owned'
                    ? 'Not delivered. Your administrator needs to reconnect this conversation. See Message info.'
                    : message.status === 'unconfirmed' && message.channel === 'whatsapp'
                      ? 'WhatsApp may have received this message. Check your provider’s history before sending it again.'
                      : message.status === 'unconfirmed' || message.status === 'sending'
                        ? 'Delivery is unconfirmed. Check this attempt before sending again.'
                        : `Not delivered${reason ? `: ${reason.replace(/_/g, ' ')}` : '. The provider did not supply a stored reason.'}`}
              </p>
            )}
          </div>
        </div>
      </MessageInteractions>
    </>
  )
}

/** @deprecated Use `MessageBubble` — this handles every channel, not WhatsApp. */
export const WhatsAppMessageBubble = MessageBubble
