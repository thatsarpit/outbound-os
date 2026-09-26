import { AlertCircle, Mail, MessageSquare, Loader2 } from 'lucide-react'
import type { InboxMessage } from '@/api/types'
import { cn } from '@/lib/utils'
import { EmailMessageCard } from './email-message-card'
import { WhatsAppMessageBubble } from './whatsapp-message-bubble'

type TimelineState = 'loading' | 'error' | 'empty' | 'ready'

export interface ConversationTimelineProps {
  messages?: InboxMessage[] | null
  state?: TimelineState
  error?: string | null
  loadingLabel?: string
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}

export function ConversationTimeline({
  messages,
  state = 'ready',
  error,
  loadingLabel = 'Loading conversation…',
  emptyTitle = 'No conversation history yet',
  emptyDescription = 'Start the first reply from the composer below. WhatsApp, email, and iMessage will appear here together.',
  className,
}: ConversationTimelineProps) {
  const hasMessages = Array.isArray(messages) && messages.length > 0
  const effectiveState: TimelineState = state === 'ready' && !hasMessages ? 'empty' : state

  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5', className)}>
      {effectiveState === 'loading' ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-text-muted">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm font-medium text-text-primary">{loadingLabel}</p>
          <p className="max-w-sm text-sm leading-6 text-text-secondary">
            Fetching the latest message history and reply context.
          </p>
        </div>
      ) : effectiveState === 'error' ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-text-muted">
          <AlertCircle className="h-10 w-10 text-danger/80" />
          <p className="mt-4 text-sm font-medium text-danger">Unable to load messages</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">
            {error || 'Refresh the conversation or select another lead.'}
          </p>
        </div>
      ) : effectiveState === 'empty' ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-text-muted">
          <MessageSquare className="h-10 w-10 opacity-40" />
          <p className="mt-4 text-sm font-medium text-text-primary">{emptyTitle}</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">{emptyDescription}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages?.map((message) => (
            <div
              key={message.id}
              className={cn(
                'animate-slide-up',
                message.channel === 'email'
                  ? message.direction === 'outbound'
                    ? 'ml-auto max-w-[92%]'
                    : 'mr-auto max-w-[92%]'
                  : 'max-w-full',
              )}
            >
              {message.channel === 'email' ? (
                <EmailMessageCard message={message} />
              ) : (
                <WhatsAppMessageBubble message={message} />
              )}
            </div>
          ))}
        </div>
      )}

      {effectiveState === 'ready' && hasMessages && (
        <div className="pointer-events-none sticky bottom-0 mt-4 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised/95 px-3 py-1.5 text-[11px] text-text-muted shadow-sm backdrop-blur">
            <Mail className="h-3.5 w-3.5 text-info" />
            <span>Mixed timeline ready</span>
          </div>
        </div>
      )}
    </div>
  )
}
