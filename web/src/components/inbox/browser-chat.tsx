import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, MessagesSquare } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useAuthStore } from '@/stores/auth-store'

type Invitation = { id: number; createdAt: string; expiresAt: string; revokedAt: string | null }

export function BrowserChat({ leadId }: { leadId: number }) {
  const scope = useAuthStore(state => state.dashboardScope)
  const [open, setOpen] = useState(false)
  const [inviteLink, setInviteLink] = useState<{ id: number; url: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [draft, setDraft] = useState<{ id: number; content: string } | null>(null)
  const attempt = useRef<{ key: string; content: string; chatId: number } | null>(null)
  const queryClient = useQueryClient()
  const path = `/browser-chats/${leadId}`
  const queryKey = ['browser-chats', scope, leadId]
  const invitations = useQuery({
    queryKey, queryFn: () => api.get<{ chats: Invitation[] }>(path),
    enabled: open, refetchInterval: 15_000,
  })
  const current = invitations.data?.chats.find(chat => !chat.revokedAt && Date.parse(chat.expiresAt) > Date.now())
  const link = inviteLink?.id === current?.id ? inviteLink?.url : undefined
  const body = draft?.id === current?.id ? draft?.content || '' : ''
  const revise = useMutation({
    mutationFn: (chatId: number | null) => chatId
      ? api.delete<unknown>(`${path}/${chatId}`).then(() => null)
      : api.post<{ chat: Invitation; token: string }>(path),
    onSuccess: (result) => {
      setInviteLink(result ? { id: result.chat.id, url: `${window.location.origin}/chat#${result.token}` } : null)
      setCopied(false)
      void queryClient.invalidateQueries({ queryKey })
    },
  })
  const send = useMutation({
    mutationFn: ({ chatId, content }: { chatId: number; content: string }) => {
      if (attempt.current?.content !== content || attempt.current.chatId !== chatId) {
        attempt.current = { key: crypto.randomUUID(), content, chatId }
      }
      return api.post(`${path}/${chatId}/messages`, { content, clientMessageId: attempt.current.key })
    },
    onSuccess: () => {
      attempt.current = null
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: ['inbox-thread', leadId] })
      void queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
    },
    onError: () => { void queryClient.invalidateQueries({ queryKey }) },
  })
  const busy = revise.isPending || send.isPending

  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="min-h-11 shrink-0 sm:min-h-8" leftIcon={<MessagesSquare className="size-4" />}>
          Browser chat
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Browser chat</DialogTitle>
          <DialogDescription>Messages appear in this lead’s timeline. Guests see only their own Browser chat.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {invitations.isPending && <p role="status" className="text-sm text-text-muted">Checking invite…</p>}
          {invitations.isError && <Button variant="secondary" onClick={() => void invitations.refetch()}>Retry loading invite</Button>}
          {invitations.isSuccess && !current && (
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">Anyone with the link can join until it expires in 24 hours.</p>
              <Button disabled={busy} onClick={() => revise.mutate(null)}>Create invite link</Button>
            </div>
          )}
          {current && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-text-secondary">Expires {new Date(current.expiresAt).toLocaleString()}</p>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => revise.mutate(current.id)}>Revoke link</Button>
              </div>
              {link && <div className="flex min-w-0 gap-2">
                <input aria-label="Invite link" readOnly value={link} onFocus={event => event.target.select()}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-base" />
                <Button variant="secondary" leftIcon={<Copy className="size-4" />} onClick={() => {
                  void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false))
                }}>{copied ? 'Copied' : 'Copy'}</Button>
              </div>}
              <form className="space-y-2" onSubmit={event => {
                event.preventDefault()
                if (body.trim() && !busy) send.mutate({ chatId: current.id, content: body.trim() })
              }}>
                <textarea aria-label="Browser chat reply" disabled={busy} value={body} maxLength={4000} rows={3}
                  onChange={event => setDraft({ id: current.id, content: event.target.value })} placeholder="Write a Browser chat reply"
                  className="w-full rounded-lg border border-border bg-background p-3 text-base" />
                <Button type="submit" disabled={busy || !body.trim()}>Send to Browser chat</Button>
              </form>
            </>
          )}
          {(revise.error || send.error) && <p role="alert" className="text-sm text-danger">{(revise.error || send.error)?.message}</p>}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
