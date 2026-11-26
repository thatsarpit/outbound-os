import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ChatMessage = { id: number; direction: 'inbound' | 'outbound'; content: string; createdAt: string }
const endpoint = '/api/guest/browser-chat/messages'
const sessionKey = 'outboundos.browser-chat'
const validToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token)

export function loadGuestToken(fragment: string) {
  try {
    if (fragment) {
      sessionStorage.removeItem(sessionKey)
      if (validToken(fragment)) sessionStorage.setItem(sessionKey, fragment)
    }
    const token = sessionStorage.getItem(sessionKey) || ''
    return validToken(token) ? token : ''
  } catch {
    return validToken(fragment) ? fragment : ''
  }
}

export default function BrowserChatPage({ token }: { token: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(!token)
  const [connected, setConnected] = useState(false)
  const [connectionError, setConnectionError] = useState(false)
  const [sendError, setSendError] = useState('')
  const attempt = useRef<{ key: string; content: string } | null>(null)
  const timeline = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)

  function closeChat() {
    setUnavailable(true)
    setMessages([])
    try { sessionStorage.removeItem(sessionKey) } catch { /* Storage can be disabled. */ }
  }

  useEffect(() => {
    if (unavailable) return
    let active = true
    let loading = false
    const controller = new AbortController()
    async function refresh() {
      if (loading || document.visibilityState === 'hidden') return
      loading = true
      try {
        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'omit', cache: 'no-store', signal: controller.signal,
        })
        if (!active) return
        if (response.status === 404) { closeChat(); return }
        if (!response.ok) throw new Error('Chat unavailable')
        const data = await response.json() as { messages: ChatMessage[] }
        if (!active) return
        setMessages(previous => {
          // A read may finish after a successful send. Retain the then-newest row.
          const latest = data.messages[data.messages.length - 1]?.id || 0
          return [...data.messages, ...previous.filter(message => message.id > latest)].slice(-100)
        })
        setConnected(true)
        setConnectionError(false)
      } catch {
        if (active) setConnectionError(true)
      } finally {
        loading = false
      }
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 8000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false
      controller.abort()
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [token, unavailable])

  useEffect(() => {
    if (followLatest.current && timeline.current) timeline.current.scrollTop = timeline.current.scrollHeight
  }, [messages])

  async function send(event: FormEvent) {
    event.preventDefault()
    const content = draft.trim()
    if (pending || !connected || unavailable || !content) return
    if (attempt.current?.content !== content) attempt.current = { key: crypto.randomUUID(), content }
    setPending(true)
    setSendError('')
    try {
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'omit', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, clientMessageId: attempt.current.key }),
      })
      if (response.status === 404) { closeChat(); return }
      if (!response.ok) throw new Error('Send failed')
      const { message } = await response.json() as { message: ChatMessage }
      followLatest.current = true
      setMessages(previous => previous.some(item => item.id === message.id) ? previous : [...previous, message].slice(-100))
      setDraft('')
      attempt.current = null
    } catch {
      setSendError('Could not send your message. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-2xl flex-col bg-surface text-text-primary sm:border-x sm:border-border">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-4">
        <MessageSquare aria-hidden="true" className="size-6 text-accent" />
        <div>
          <h1 className="text-base font-semibold">Browser chat</h1>
          <p className="text-xs text-text-muted">Powered by Outbound OS</p>
        </div>
      </header>
      {unavailable ? (
        <div className="mx-auto my-auto max-w-sm space-y-2 p-6 text-center">
          <h2 className="text-lg font-semibold">This chat link is unavailable</h2>
          <p className="text-sm text-text-muted">Ask the person who invited you for a fresh link.</p>
        </div>
      ) : (
        <>
          <div ref={timeline} role="log" aria-label="Chat messages" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
            onScroll={event => { const list = event.currentTarget; followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 64 }}>
            {!messages.length && <p className="my-8 text-center text-sm text-text-muted">
              {connected ? 'Send a message to start the conversation.' : 'Connecting to chat…'}
            </p>}
            {messages.map(message => (
              <div key={message.id} className={`max-w-[88%] break-words rounded-lg px-3 py-2 ${message.direction === 'inbound' ? 'ml-auto bg-accent-muted' : 'mr-auto bg-surface-raised'}`}>
                <p className="text-xs font-medium text-text-muted">{message.direction === 'inbound' ? 'You' : 'Sales team'}</p>
                <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{message.content}</p>
                <time dateTime={message.createdAt} className="text-xs text-text-muted">
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </time>
              </div>
            ))}
          </div>
          <form onSubmit={send} className="shrink-0 space-y-2 border-t border-border p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
            {connectionError && <p role="status" className="text-sm text-text-muted">Connection interrupted. Reconnecting…</p>}
            {sendError && <p role="alert" className="text-sm text-danger">{sendError}</p>}
            <div className="flex items-end gap-2">
              <textarea aria-label="Your message" value={draft} maxLength={4000} rows={2} disabled={pending}
                onChange={event => setDraft(event.target.value)} placeholder="Write a message"
                className="min-w-0 flex-1 resize-y rounded-lg border border-border bg-background p-3 text-base" />
              <Button type="submit" className="min-h-11" disabled={pending || !connected || !draft.trim()} leftIcon={<Send className="size-4" />}>
                {pending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </form>
        </>
      )}
    </main>
  )
}
