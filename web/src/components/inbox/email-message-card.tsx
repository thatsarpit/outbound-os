import { ExternalLink, Mail, Reply, Send } from 'lucide-react'
import type { InboxMessage } from '@/api/types'
import { cn, formatRelativeTime } from '@/lib/utils'
import { ChannelBadge } from './channel-badge'

export function EmailMessageCard({
  message,
  className,
}: {
  message: InboxMessage
  className?: string
}) {
  const isInbound = message.direction === 'inbound'

  return (
    <article
      className={cn(
        'w-full rounded-[24px] border p-4 shadow-sm animate-slide-up',
        isInbound
          ? 'border-info/15 bg-[linear-gradient(180deg,rgba(59,130,246,0.08),rgba(18,18,20,0.92))]'
          : 'border-border bg-[linear-gradient(180deg,rgba(26,26,30,0.98),rgba(12,12,14,0.94))]',
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
              <span className="rounded-full bg-surface-overlay px-2 py-0.5 text-[10px] text-text-muted">
                {message.status}
              </span>
            )}
          </div>
          <h3 className="mt-3 text-sm font-semibold text-text-primary">
            {message.subject || 'Email reply'}
          </h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
            <Mail className="h-3.5 w-3.5" />
            {message.senderDisplay || 'Connected sender'}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-text-muted">
          {formatRelativeTime(message.sentAt || message.createdAt)}
        </span>
      </div>

      <div className="mt-4 rounded-md border border-border bg-black/10 px-4 py-3">
        <p className="whitespace-pre-wrap text-sm leading-6 text-text-primary">
          {message.content || 'No preview available for this email yet.'}
        </p>
        {message.mediaUrl && (
          <a
            href={message.mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs text-info transition-colors hover:text-blue-300"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View attachment
          </a>
        )}
      </div>
    </article>
  )
}
