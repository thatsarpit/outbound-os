import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ChatMessage = { id: number; direction: 'inbound' | 'outbound'; content: string; createdAt: string }
type Transcript = { messages: ChatMessage[]; nextBefore: number | null; expiresAt: string; resolved: boolean }
type WidgetConfig = { title: string; welcome: string; accent: string }
const guestApi = '/api/guest/browser-chat'
const validToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token)
const defaultConfig = { title: 'Browser chat', welcome: 'How can we help?', accent: '#4257b2' }

function storageFor(widgetKey?: string) {
  return widgetKey
    ? { storage: window.localStorage, key: `outboundos.chat.${widgetKey}` }
    : { storage: window.sessionStorage, key: 'outboundos.browser-chat' }
}

function storeToken(token: string, widgetKey?: string) {
  try {
    const { storage, key } = storageFor(widgetKey)
    if (validToken(token)) storage.setItem(key, token)
    else storage.removeItem(key)
  } catch { /* A return link is available if browser storage is disabled. */ }
}

function restoreToken(fragment: string, widgetKey?: string) {
  if (fragment) return validToken(fragment) ? fragment : ''
  try {
    const { storage, key } = storageFor(widgetKey)
    const value = storage.getItem(key) || ''
    return validToken(value) ? value : ''
  } catch {
    return ''
  }
}

function newGuestToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function mergeMessages(previous: ChatMessage[], next: ChatMessage[]) {
  const byId = new Map(previous.map(message => [message.id, message]))
  for (const message of next) byId.set(message.id, message)
  return [...byId.values()].sort((left, right) => left.id - right.id)
}

export default function BrowserChatPage({ fragment, widgetKey }: { fragment: string; widgetKey?: string }) {
  const base = widgetKey ? `${guestApi}/widgets/${widgetKey}` : guestApi
  const endpoint = `${base}/messages`
  const [widget, setWidget] = useState<WidgetConfig | null>(widgetKey ? null : defaultConfig)
  const [widgetError, setWidgetError] = useState(false)
  const [token, setToken] = useState(() => restoreToken(fragment, widgetKey))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [expired, setExpired] = useState(false)
  const [connected, setConnected] = useState(false)
  const [connectionError, setConnectionError] = useState(false)
  const [sendError, setSendError] = useState('')
  const [nextBefore, setNextBefore] = useState<number | null>(null)
  const [expiresAt, setExpiresAt] = useState('')
  const [resolved, setResolved] = useState(false)
  const attempt = useRef<{ key: string; content: string; token: string; name: string } | null>(null)
  const timeline = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  const haveHistory = useRef(false)

  useEffect(() => {
    if (fragment) storeToken(validToken(fragment) ? fragment : '', widgetKey)
  }, [fragment, widgetKey])

  useEffect(() => {
    if (!widgetKey) return
    const controller = new AbortController()
    void fetch(base, { credentials: 'omit', cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Chat unavailable')
      const config = await response.json() as WidgetConfig
      setWidget(config)
    }).catch(() => { if (!controller.signal.aborted) setWidgetError(true) })
    return () => controller.abort()
  }, [base, widgetKey])

  useEffect(() => {
    if (expired || !token) return
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
        if (response.status === 404) {
          setExpired(true)
          setMessages([])
          storeToken('', widgetKey)
          return
        }
        if (!response.ok) throw new Error('Chat unavailable')
        const data = await response.json() as Transcript
        if (!active) return
        setMessages(previous => mergeMessages(previous, data.messages))
        if (!haveHistory.current) {
          haveHistory.current = true
          setNextBefore(data.nextBefore)
        }
        setExpiresAt(data.expiresAt)
        setResolved(data.resolved)
        setConnected(true)
        setConnectionError(false)
      } catch {
        if (active) setConnectionError(true)
      } finally {
        loading = false
      }
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 5000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false
      controller.abort()
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [endpoint, expired, token, widgetKey])

  useEffect(() => {
    if (followLatest.current && timeline.current) timeline.current.scrollTop = timeline.current.scrollHeight
  }, [messages])

  async function loadEarlier() {
    if (!nextBefore || loadingOlder) return
    followLatest.current = false
    setLoadingOlder(true)
    setSendError('')
    try {
      const response = await fetch(`${endpoint}?before=${nextBefore}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', credentials: 'omit',
      })
      if (!response.ok) throw new Error('History unavailable')
      const data = await response.json() as Transcript
      setMessages(previous => mergeMessages(previous, data.messages))
      setNextBefore(data.nextBefore)
    } catch {
      setSendError('Could not load earlier messages. Try again.')
    } finally {
      setLoadingOlder(false)
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault()
    const content = draft.trim()
    const startsChat = Boolean(widgetKey && !token)
    if (pending || expired || !content || (!startsChat && !connected) || (startsChat && !name.trim())) return
    if (attempt.current?.content !== content || attempt.current.name !== name.trim()) {
      attempt.current = { key: crypto.randomUUID(), content, token: token || attempt.current?.token || newGuestToken(), name: name.trim() }
    }
    const submission = attempt.current
    setPending(true)
    setSendError('')
    try {
      const response = await fetch(startsChat ? `${base}/start` : endpoint, {
        method: 'POST', credentials: 'omit', cache: 'no-store',
        headers: { Authorization: `Bearer ${submission.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: submission.name, content, clientMessageId: submission.key }),
      })
      if (response.status === 404 && !startsChat) {
        setExpired(true)
        setMessages([])
        storeToken('', widgetKey)
        return
      }
      if (!response.ok) throw new Error('Send failed')
      const { message } = await response.json() as { message: ChatMessage }
      followLatest.current = true
      if (startsChat) {
        storeToken(submission.token, widgetKey)
        setToken(submission.token)
      }
      setMessages(previous => mergeMessages(previous, [message]))
      setResolved(false)
      setDraft('')
      attempt.current = null
    } catch {
      setSendError('Could not send your message. Try again.')
    } finally {
      setPending(false)
    }
  }

  const style = widget || defaultConfig
  const unavailable = expired || (!widgetKey && !token) || widgetError
  const startsChat = Boolean(widgetKey && !token)
  const returnLink = widgetKey && token ? `${window.location.origin}/chat/widget/${widgetKey}#${token}` : ''

  return (
    <main className="mx-auto flex h-dvh w-full max-w-2xl flex-col bg-surface text-text-primary sm:border-x sm:border-border">
      <header className="flex shrink-0 items-center gap-3 border-b border-border border-t-4 px-4 py-3" style={{ borderTopColor: style.accent }}>
        <MessageSquare aria-hidden="true" className="size-6" style={{ color: style.accent }} />
        <div>
          <h1 className="text-base font-semibold">{style.title}</h1>
          <p className="text-xs text-text-muted">Powered by Outbound OS</p>
        </div>
      </header>
      {unavailable ? (
        <div className="mx-auto my-auto max-w-sm space-y-3 p-6 text-center">
          <h2 className="text-lg font-semibold">{widgetError ? 'Chat is unavailable' : 'This chat link is unavailable'}</h2>
          {!widgetKey && <p className="text-sm text-text-muted">Ask the person who invited you for a fresh link.</p>}
          {widgetKey && !widgetError && <Button onClick={() => {
            haveHistory.current = false
            attempt.current = null
            setToken('')
            setExpired(false)
            setConnected(false)
            setNextBefore(null)
            setSendError('')
          }}>Start a new conversation</Button>}
        </div>
      ) : !widget ? (
        <p role="status" className="p-4 text-sm text-text-muted">Opening chat…</p>
      ) : (
        <>
          <div ref={timeline} role="log" aria-label="Chat messages" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
            onScroll={event => { const list = event.currentTarget; followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 64 }}>
            {nextBefore && <Button variant="secondary" size="sm" disabled={loadingOlder} onClick={() => void loadEarlier()}>
              {loadingOlder ? 'Loading…' : 'Load earlier messages'}
            </Button>}
            {!messages.length && <p className="my-5 text-center text-sm text-text-muted">
              {startsChat ? style.welcome : connected ? 'Send a message to start the conversation.' : 'Connecting to chat…'}
            </p>}
            {messages.map(message => (
              <div key={message.id} className={`max-w-[88%] break-words rounded-lg px-3 py-2 ${message.direction === 'inbound' ? 'ml-auto bg-accent-muted' : 'mr-auto bg-surface-raised'}`}>
                <p className="text-xs font-medium text-text-muted">{message.direction === 'inbound' ? 'You' : widgetKey ? style.title : 'Sales team'}</p>
                <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{message.content}</p>
                <time dateTime={message.createdAt} className="text-xs text-text-muted">
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </time>
              </div>
            ))}
          </div>
          {returnLink && connected && (
            <details className="shrink-0 border-t border-border px-4 py-2 text-xs text-text-muted">
              <summary className="cursor-pointer">Save your return link</summary>
              <p className="mt-1">Anyone with this link can read the chat. It expires {expiresAt ? new Date(expiresAt).toLocaleDateString() : 'after 90 days'}.</p>
              <input aria-label="Private return link" className="mt-2 w-full rounded border border-border bg-background p-2 text-base text-text-primary"
                readOnly value={returnLink} onFocus={event => event.target.select()} />
            </details>
          )}
          <form onSubmit={send} className="shrink-0 space-y-2 border-t border-border p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
            {widgetKey && resolved && connected && <p role="status" className="text-xs text-text-muted">Resolved. Send a message to reopen this conversation.</p>}
            {connectionError && <p role="status" className="text-sm text-text-muted">Connection interrupted. Reconnecting…</p>}
            {sendError && <p role="alert" className="text-sm text-danger">{sendError}</p>}
            {startsChat && <label className="block text-sm text-text-secondary">Your name
              <input type="text" autoComplete="name" maxLength={80} required value={name} disabled={pending}
                onChange={event => setName(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background p-2 text-base" />
            </label>}
            <div className="flex items-end gap-2">
              <textarea aria-label="Your message" value={draft} maxLength={4000} rows={2} disabled={pending}
                onChange={event => setDraft(event.target.value)} placeholder="Write a message"
                className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-background p-3 text-base" />
              <Button type="submit" className="min-h-11" disabled={pending || !draft.trim() || (startsChat ? !name.trim() : !connected)} leftIcon={<Send className="size-4" />}>
                {pending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </form>
        </>
      )}
    </main>
  )
}
