import { Mail, Reply, Send } from 'lucide-react'
import type { InboxMessage } from '@/api/types'
import { cn, formatRelativeTime } from '@/lib/utils'
import { MessageMedia } from './message-media'
import { ChannelBadge } from './channel-badge'
import { describeEmailDelivery } from '@/lib/email-delivery'

export function EmailMessageCard({
  message,
  className,
}: {
  message: InboxMessage
  className?: string
}) {
  const isInbound = message.direction === 'inbound'
  const delivery = describeEmailDelivery(message)

  return (
    <article
      className={cn(
        'w-full overflow-hidden rounded-xl border p-4 shadow-sm',
        isInbound ? 'border-border bg-surface' : 'border-border bg-surface-raised',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ChannelBadge channel="email" variant="inline" />
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
                isInbound ? 'bg-info-muted text-info' : 'bg-surface-overlay text-text-secondary',
              )}
            >
              {isInbound ? <Reply className="h-3 w-3" /> : <Send className="h-3 w-3" />}
              {isInbound ? 'Inbound' : 'Outbound'}
            </span>
            {message.status && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px]',
                  delivery.failed
                    ? 'bg-danger-muted text-danger'
                    : delivery.temporary
                      ? 'bg-warning-muted text-warning'
                      : 'bg-surface-overlay text-text-muted',
                )}
              >
                {delivery.label}
              </span>
            )}
          </div>
          <h3 className="mt-3 text-sm font-semibold text-text-primary">
            {/\{\{\s*contact\./i.test(message.subject || '')
              ? 'Campaign email · archived subject'
              : message.subject || 'Email reply'}
          </h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
            <Mail className="h-3.5 w-3.5" />
            {message.senderDisplay || (isInbound ? 'Customer email' : 'Connected sender')}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-text-muted">
          {formatRelativeTime(message.sentAt || message.createdAt)}
        </span>
      </div>

      {delivery.detail && (
        <p
          className={cn(
            'mt-3 text-xs leading-5',
            delivery.failed
              ? 'text-danger'
              : delivery.temporary
                ? 'text-warning'
                : 'text-text-muted',
          )}
        >
          {delivery.detail}
        </p>
      )}

      {message.direction === 'outbound' &&
        /\{\{\s*(?:contact\.|unsubscribe\b)/i.test(message.content || '') && (
          <p className="mt-3 rounded-lg bg-warning-muted px-3 py-2 text-xs leading-5 text-warning">
            This is an archived campaign template. The provider's delivered copy is not stored here.
          </p>
        )}
      <div className="mt-4 rounded-md border border-border bg-background/50 px-4 py-3">
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">
          {message.content || 'No preview available for this email yet.'}
        </p>
        {message.mediaUrl && (
          <MessageMedia
            messageId={message.id}
            mediaType={message.mediaType}
            filename={message.mediaFilename}
          />
        )}
      </div>
    </article>
  )
}
