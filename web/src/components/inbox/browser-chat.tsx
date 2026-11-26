import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Mail, MessagesSquare, Phone } from 'lucide-react'
import { api, apiFetch } from '@/api/client'
import { BrowserChatFilePicker, browserChatMessageBody } from './browser-chat-file'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useAuthStore } from '@/stores/auth-store'

type Invitation = { id: number; widgetKey?: string | null; visitorEmail?: string | null; visitorPhone?: string | null; createdAt: string; expiresAt: string; revokedAt: string | null }

export function BrowserChat({ leadId }: { leadId: number }) {
  const scope = useAuthStore(state => state.dashboardScope)
  const [open, setOpen] = useState(false)
  const [inviteLink, setInviteLink] = useState<{ id: number; url: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const queryClient = useQueryClient()
  const path = `/browser-chats/${leadId}`
  const queryKey = ['browser-chats', scope, leadId]
  const invitations = useQuery({
    queryKey, queryFn: () => api.get<{ chats: Invitation[] }>(path),
    enabled: open, refetchInterval: 15_000,
  })
  const current = invitations.data?.chats.find(chat => !chat.revokedAt && Date.parse(chat.expiresAt) > Date.now())
  const link = inviteLink?.id === current?.id ? inviteLink?.url : undefined
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
  const busy = revise.isPending

  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="min-h-11 shrink-0 text-webchat sm:min-h-8" leftIcon={<MessagesSquare className="size-4" />}>
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
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => revise.mutate(current.id)}>{current.widgetKey ? 'Revoke visitor access' : 'Revoke link'}</Button>
              </div>
              {link && <div className="flex min-w-0 gap-2">
                <input aria-label="Invite link" readOnly value={link} onFocus={event => event.target.select()}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-base" />
                <Button variant="secondary" leftIcon={<Copy className="size-4" />} onClick={() => {
                  void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false))
                }}>{copied ? 'Copied' : 'Copy'}</Button>
              </div>}
              {!current.widgetKey && <ChatReply key={current.id} leadId={leadId} chatId={current.id} disabled={busy} />}
            </>
          )}
          {revise.error && <p role="alert" className="text-sm text-danger">{revise.error.message}</p>}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}


function ChatReply({ leadId, chatId, disabled = false }: { leadId: number; chatId: number; disabled?: boolean }) {
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const attempt = useRef<{ key: string; content: string; file: File | null } | null>(null)
  const queryClient = useQueryClient()
  const send = useMutation({
    mutationFn: (content: string) => {
      if (attempt.current?.content !== content || attempt.current.file !== file) {
        attempt.current = { key: crypto.randomUUID(), content, file }
      }
      return apiFetch(`/browser-chats/${leadId}/${chatId}/messages`, {
        method: 'POST', body: browserChatMessageBody({ content, clientMessageId: attempt.current.key }, file),
      })
    },
    onSuccess: () => {
      attempt.current = null
      setBody('')
      setFile(null)
      void queryClient.invalidateQueries({ queryKey: ['inbox-thread', leadId] })
      void queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
    },
  })
  const busy = disabled || send.isPending
  return (
    <form className="space-y-2" onSubmit={event => {
      event.preventDefault()
      if ((body.trim() || file) && !busy) send.mutate(body.trim())
    }}>
      <textarea aria-label="Browser chat reply" disabled={busy} value={body} maxLength={4000} rows={2}
        onChange={event => setBody(event.target.value)} placeholder="Write a Browser chat reply"
        className="w-full resize-none rounded-lg border border-border bg-background p-3 text-base" />
      <div className="flex items-start justify-between gap-2">
        <BrowserChatFilePicker file={file} onChange={setFile} disabled={busy} />
        <Button type="submit" className="min-h-11 shrink-0" disabled={busy || (!body.trim() && !file)}>
          {send.isPending ? 'Sending…' : 'Send reply'}
        </Button>
      </div>
      {send.error && <p role="alert" className="text-sm text-danger">{send.error.message}</p>}
    </form>
  )
}

export function WebsiteChatReply({ leadId }: { leadId: number }) {
  const scope = useAuthStore(state => state.dashboardScope)
  const query = useQuery({
    queryKey: ['browser-chats', scope, leadId],
    queryFn: () => api.get<{ chats: Invitation[] }>(`/browser-chats/${leadId}`),
    refetchInterval: 15_000,
  })
  const chat = query.data?.chats.find(item => item.widgetKey && !item.revokedAt && Date.parse(item.expiresAt) > Date.now())
  return (
    <section aria-label="Website chat reply" className="shrink-0 border-t border-border bg-surface p-3">
      {query.isPending ? <p role="status" className="text-sm text-text-muted">Loading chat…</p> :
        query.isError ? <Button variant="secondary" onClick={() => void query.refetch()}>Retry loading chat</Button> :
          chat ? <>
            {(chat.visitorEmail || chat.visitorPhone) && (
              <div className="mb-2 rounded-xl border border-border bg-surface-raised px-3 py-2">
                <p className="text-xs font-medium text-text-secondary">Visitor supplied · unverified</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 break-all text-sm">
                  {chat.visitorEmail && <span className="inline-flex items-center gap-1.5"><Mail aria-hidden="true" className="size-3.5 shrink-0 text-webchat" />{chat.visitorEmail}</span>}
                  {chat.visitorPhone && <span className="inline-flex items-center gap-1.5"><Phone aria-hidden="true" className="size-3.5 shrink-0 text-webchat" />{chat.visitorPhone}</span>}
                </div>
              </div>
            )}
            <ChatReply key={chat.id} leadId={leadId} chatId={chat.id} />
          </> :
            <p className="text-sm text-text-muted">The visitor’s chat session is closed.</p>}
    </section>
  )
}
