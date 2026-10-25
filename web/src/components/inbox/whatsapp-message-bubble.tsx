import type { InboxChannel, InboxMessage } from '@/api/types'
import { cn, formatRelativeTime } from '@/lib/utils'
import { getChannel } from '@/lib/channels'
import { ChannelBadge } from './channel-badge'
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
}: {
  message: InboxMessage
  /** Set when this message switches channel relative to the previous one. */
  showChannel?: boolean
  className?: string
}) {
  const failed = ['failed', 'permanently_failed'].includes(message.status)
  const reason = message.providerStatusReason
  const isInbound = message.direction === 'inbound'
  const unsupported = isInbound && message.channel === 'whatsapp'
    && /^\[(unsupported|Unsupported WhatsApp message)\]$/i.test(message.content.trim())
  const meta = getChannel(message.channel)
  const showPricing =
    !isInbound &&
    message.channel === 'whatsapp' &&
    (Boolean(message.pricingCategory) || typeof message.billable === 'boolean')
  const pricingCategory = message.pricingCategory
    ? message.pricingCategory.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
    : 'WhatsApp'

  return (
    <div className={cn('flex w-full', isInbound ? 'justify-start' : 'justify-end')}>
      <div className={cn('flex max-w-[85%] flex-col gap-1 sm:max-w-[76%]', className)}>
        {showChannel && (
          <ChannelBadge
            channel={message.channel as InboxChannel}
            variant="inline"
            className={cn('px-0.5', isInbound ? 'self-start' : 'self-end')}
          />
        )}

        <div
          className={cn(
            'rounded-md border px-3 py-2 text-[13px] leading-relaxed',
            isInbound
              ? 'rounded-tl-sm border-border bg-surface-raised text-text-primary'
              : cn('rounded-tr-sm text-text-primary', meta.bg, meta.border),
          )}
        >
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
            'px-0.5 text-[10px] tabular-nums text-text-muted',
            isInbound ? 'self-start' : 'self-end',
          )}
        >
          {formatRelativeTime(message.sentAt || message.createdAt)}
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
              ? 'Not delivered: the 24-hour reply window closed. Use an approved template and wait for a customer reply.'
              : message.status === 'unconfirmed' || message.status === 'sending'
                ? 'Delivery is unconfirmed. Check this attempt before sending again; it may already have reached Meta.'
                : `Not delivered${reason ? `: ${reason.replace(/_/g, ' ')}` : '. The provider did not supply a stored reason.'}`}
          </p>
        )}
        {showPricing && (
          <span
            className="self-end px-0.5 text-[10px] text-text-muted"
            title={message.pricingType ? `Meta pricing model: ${message.pricingType}` : undefined}
          >
            {pricingCategory}
            {typeof message.billable === 'boolean'
              ? ` · ${message.billable ? 'billable' : 'free'}`
              : ''}
          </span>
        )}
      </div>
    </div>
  )
}

/** @deprecated Use `MessageBubble` — this handles every channel, not WhatsApp. */
export const WhatsAppMessageBubble = MessageBubble
