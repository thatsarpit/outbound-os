import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Reply, X } from 'lucide-react'
import type { InboxMessage } from '@/api/types'
import { inboxApi } from '@/api/endpoints/inbox'
import { useAuthStore } from '@/stores/auth-store'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

const emoji = ['👍', '❤️', '😂', '😮', '😢', '🙏']
export function MessageInteractions({
  message,
  onReply,
  children,
}: {
  message: InboxMessage
  onReply?: (message: InboxMessage) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState(false)
  const [offset, setOffset] = useState(0)
  const [copyError, setCopyError] = useState('')
  const start = useRef<{ x: number; y: number } | null>(null)
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current)
    },
    [],
  )
  const query = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const writable = !!user && user.role !== 'viewer'
  const reply = writable && onReply && message.canReply
  const clearHold = () => {
    if (hold.current) clearTimeout(hold.current)
    hold.current = null
  }
  const react = useMutation({
    mutationFn: (value: string) => inboxApi.react(message.leadId, message.id, value),
    onSuccess: () => {
      setOpen(false)
      void query.invalidateQueries({ queryKey: ['inbox-thread', message.leadId] })
    },
  })
  return (
    <div
      id={`message-${message.id}`}
      className="group relative scroll-mt-20 rounded-xl focus-within:ring-1 focus-within:ring-border"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={(event) => {
        if (
          event.pointerType === 'mouse' ||
          (event.target as HTMLElement).closest('button,a,input,audio,video')
        )
          return
        if (event.clientX < 24) return
        start.current = { x: event.clientX, y: event.clientY }
        hold.current = setTimeout(() => {
          start.current = null
          setOpen(true)
        }, 550)
      }}
      onPointerMove={(event) => {
        if (!start.current) return
        const dx = event.clientX - start.current.x,
          dy = event.clientY - start.current.y
        if (Math.abs(dx) + Math.abs(dy) > 10) clearHold()
        if (Math.abs(dy) > 20 && Math.abs(dy) > Math.abs(dx)) {
          start.current = null
          setOffset(0)
          return
        }
        if (reply && Math.abs(dx) > Math.abs(dy) * 1.5) {
          event.currentTarget.setPointerCapture(event.pointerId)
          setOffset(Math.max(0, Math.min(72, dx)))
        }
      }}
      onPointerCancel={() => {
        clearHold()
        start.current = null
        setOffset(0)
      }}
      onPointerUp={() => {
        clearHold()
        if (offset >= 56 && reply) onReply?.(message)
        start.current = null
        setOffset(0)
      }}
      onContextMenu={(event) => {
        if (!(event.target as HTMLElement).closest('a,audio,video')) {
          event.preventDefault()
          setOpen(true)
        }
      }}
    >
      {offset > 10 && (
        <Reply aria-hidden className="absolute left-1 top-4 h-5 w-5 text-text-secondary" />
      )}
      <div style={{ transform: `translateX(${offset}px)` }}>{children}</div>
      <div
        className={`flex items-center gap-1 ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
      >
        {message.reactions?.map((reaction, index) => (
          <span
            key={`${reaction.emoji}-${index}`}
            aria-label={`${reaction.own ? 'Your' : 'Customer'} reaction ${reaction.emoji}`}
            className={`rounded-full border px-2 py-0.5 text-sm ${reaction.own ? 'border-accent bg-accent-muted' : 'border-border bg-surface'}`}
          >
            {reaction.emoji}
          </span>
        ))}
        <button
          type="button"
          aria-label={`Actions for message ${message.id}`}
          onClick={() => setOpen(true)}
          className={`absolute top-0 ${message.direction === 'outbound' ? 'left-0' : 'right-0'} flex h-11 w-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface-raised md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-auto rounded-2xl p-5">
          <DialogTitle>Message actions</DialogTitle>
          {message.canReact && writable && (
            <div className="my-4 flex flex-wrap gap-1" aria-label="Reactions">
              {emoji.map((value) => (
                <button
                  key={value}
                  disabled={react.isPending}
                  aria-label={`React ${value}`}
                  onClick={() =>
                    react.mutate(
                      message.reactions?.some((r) => r.own && r.emoji === value) ? '' : value,
                    )
                  }
                  className="h-12 w-12 rounded-full bg-surface-raised text-2xl disabled:opacity-40"
                >
                  {value}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 grid gap-1">
            {reply && (
              <button
                className="min-h-11 rounded-lg px-3 text-left hover:bg-surface-raised"
                onClick={() => {
                  onReply?.(message)
                  setOpen(false)
                }}
              >
                Reply to this message
              </button>
            )}
            <button
              className="min-h-11 rounded-lg px-3 text-left hover:bg-surface-raised"
              onClick={() => {
                if (!navigator.clipboard?.writeText) {
                  setCopyError('Select the message text to copy it.')
                  return
                }
                void navigator.clipboard
                  .writeText(message.content)
                  .then(() => setOpen(false))
                  .catch(() => setCopyError('Could not copy. Select the message text to copy it.'))
              }}
            >
              Copy text
            </button>
            <button
              className="min-h-11 rounded-lg px-3 text-left hover:bg-surface-raised"
              onClick={() => {
                setOpen(false)
                setInfo(true)
              }}
            >
              Message info
            </button>
          </div>
          {(react.error || copyError) && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {react.error?.message || copyError}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={info} onOpenChange={setInfo}>
        <DialogContent className="max-h-[85dvh] overflow-auto rounded-2xl p-5">
          <DialogTitle>Message info</DialogTitle>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-text-secondary">Time</dt>
              <dd>{new Date(message.sentAt || message.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Status</dt>
              <dd>{message.status}</dd>
            </div>
            {message.pricingCategory && (
              <div>
                <dt className="text-text-secondary">Pricing category</dt>
                <dd>
                  {message.pricingCategory} ·{' '}
                  {typeof message.billable === 'boolean'
                    ? message.billable
                      ? 'Billable'
                      : 'Not billed'
                    : 'Billing not confirmed'}
                </dd>
              </div>
            )}
            {message.providerErrorMessage && (
              <div>
                <dt className="text-text-secondary">Delivery detail</dt>
                <dd>{message.providerErrorMessage}</dd>
              </div>
            )}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function ReplyPreview({
  message,
  onCancel,
}: {
  message: InboxMessage
  onCancel: () => void
}) {
  return (
    <div className="mb-2 flex min-h-12 items-center gap-2 rounded-xl border-l-2 border-accent bg-surface-raised px-3">
      <Reply className="h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-text-secondary">
          Replying to {message.direction === 'inbound' ? 'customer' : 'your message'}
        </p>
        <p className="truncate text-sm">{message.content}</p>
      </div>
      <button
        className="flex h-11 w-11 items-center justify-center"
        aria-label="Cancel quoted reply"
        onClick={onCancel}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
