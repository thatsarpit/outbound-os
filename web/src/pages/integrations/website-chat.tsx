import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Copy } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { CHANNELS } from '@/lib/channels'

type Widget = { key: string; title: string; welcome: string; accent: string; origins: string[] }
const ChatIcon = CHANNELS.webchat.icon

export default function WebsiteChatIntegration() {
  const [copied, setCopied] = useState('')
  const query = useQuery({
    queryKey: ['website-chat-config'],
    queryFn: async () => {
      const settings = await api.get<{ enabled: boolean; widgets: Widget[] }>('/integrations/website-chat')
      if (!settings) throw new Error('Website chat settings unavailable')
      return settings
    },
  })
  return (
    <section className="space-y-5">
      <header className="flex items-center gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="rounded-xl bg-webchat-muted p-3 text-webchat"><ChatIcon aria-hidden="true" className="size-5" /></div>
        <div><h2 className="text-lg font-semibold">Website chat</h2><p className="text-sm text-text-secondary">Send customer support and website enquiries to your Inbox.</p></div>
      </header>
      {query.isPending && <p role="status" className="text-sm text-text-secondary">Loading website chat…</p>}
      {query.isError && <Button variant="secondary" onClick={() => void query.refetch()}>Retry loading configuration</Button>}
      {query.data && (
        <>
          {!query.data.enabled && <p className="rounded-lg border border-border p-4 text-sm">Set <code>OUTBOUNDOS_BROWSER_CHAT=true</code> on the server to enable Website chat and personal links.</p>}
          {query.data.enabled && query.data.widgets.length === 0 && <p className="rounded-lg border border-border p-4 text-sm">Add a widget to <code>OUTBOUNDOS_CHAT_WIDGETS</code> on the server to accept new website conversations. Personal links are available in Inbox.</p>}
          {query.data.widgets.map(widget => {
            const url = `${window.location.origin}/chat/widget/${widget.key}`
            const code = `<a href="${url}" data-outbound-chat aria-haspopup="dialog" aria-expanded="false">Chat with us</a>\n<script defer src="${window.location.origin}/outbound-chat.js"></script>`
            return (
              <article key={widget.key} className="space-y-4 rounded-xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="text-base font-semibold">{widget.title}</h3><p className="mt-1 text-sm text-text-secondary">{widget.welcome}</p></div>
                  <Button variant="secondary" asChild><a href={url} target="_blank" rel="noopener noreferrer">Open hosted chat <ArrowUpRight aria-hidden="true" className="size-4" /></a></Button>
                </div>
                {widget.origins.length > 0 ? (
                  <div className="space-y-2">
                    <p className="break-words text-xs text-text-muted">Allowed on {widget.origins.join(', ')}</p>
                    <textarea aria-label={`Embed code for ${widget.title}`} className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs" rows={3} readOnly value={code} />
                    <Button size="sm" variant="secondary" onClick={() => {
                      void navigator.clipboard.writeText(code).then(() => setCopied(widget.key)).catch(() => setCopied(''))
                    }}><Copy aria-hidden="true" className="size-4" />{copied === widget.key ? 'Copied' : 'Copy embed code'}</Button>
                  </div>
                ) : <p className="text-xs text-text-muted">Hosted link only. Add exact website origins in the server configuration to allow embeds.</p>}
              </article>
            )
          })}
        </>
      )}
    </section>
  )
}
