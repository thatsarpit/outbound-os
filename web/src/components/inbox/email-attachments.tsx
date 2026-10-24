import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, File, Loader2, Paperclip } from 'lucide-react'
import { api, apiFetchBlob } from '@/api/client'
import { useAuthStore } from '@/stores/auth-store'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { Button } from '@/components/ui/button'

export interface EmailAttachment {
  index: number
  filename: string
  contentType: string
  size: number
}

export function EmailAttachmentFiles({
  items,
  endpoint,
}: {
  items: EmailAttachment[]
  endpoint: string
}) {
  const dashboardScope = useAuthStore((state) => state.dashboardScope)
  const online = useOnlineStatus()
  const [pending, setPending] = useState<number | null>(null)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const urls = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const downloads = urls.current
    return () => {
      request.current?.abort()
      for (const [url, timer] of downloads) {
        clearTimeout(timer)
        URL.revokeObjectURL(url)
      }
      downloads.clear()
    }
  }, [dashboardScope])

  const download = async (item: EmailAttachment) => {
    if (request.current || !online) return
    const controller = new AbortController()
    request.current = controller
    setPending(item.index)
    setError('')
    try {
      const blob = await apiFetchBlob(`${endpoint}/${item.index}`, controller.signal)
      if (controller.signal.aborted || useAuthStore.getState().dashboardScope !== dashboardScope)
        return
      // Never open sender-provided HTML inline. The server forces a download;
      // use an opaque binary Blob here as well, including for legacy browsers.
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download =
        Array.from(item.filename.replace(/[\\/]/g, '_'), (char) =>
          char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? '_' : char,
        ).join('') || 'attachment'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      urls.current.set(
        url,
        setTimeout(() => {
          URL.revokeObjectURL(url)
          urls.current.delete(url)
        }, 60_000),
      )
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : 'Could not download this file. Try again.',
        )
    } finally {
      if (request.current === controller) {
        request.current = null
        setPending(null)
      }
    }
  }

  if (!items.length) return null
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">
        Files are supplied by the sender. Download only files you trust.
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.index}>
            <button
              type="button"
              disabled={!online || pending !== null}
              onClick={() => void download(item)}
              className="flex min-h-11 w-full items-center gap-3 rounded-md border border-border bg-surface p-3 text-left hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
              aria-label={`Download ${item.filename}`}
              aria-busy={pending === item.index}
            >
              <File aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block break-all text-sm">{item.filename}</span>
                <span className="text-xs text-text-muted">
                  {item.size < 1024
                    ? `${item.size} B`
                    : item.size < 1024 * 1024
                      ? `${(item.size / 1024).toFixed(1)} KB`
                      : `${(item.size / (1024 * 1024)).toFixed(1)} MB`}
                </span>
              </span>
              {pending === item.index ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Download aria-hidden="true" className="h-4 w-4 shrink-0" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {!online && (
        <p role="status" className="text-xs text-text-muted">
          Reconnect to download files.
        </p>
      )}
    </div>
  )
}

/** Attachment metadata is loaded on demand, rather than once for every message. */
export function EmailMessageAttachments({ messageId }: { messageId: number }) {
  const dashboardScope = useAuthStore((state) => state.dashboardScope)
  const [open, setOpen] = useState(false)
  const endpoint = `/messages/${messageId}/email-attachments`
  const files = useQuery({
    queryKey: ['email-attachments', dashboardScope, messageId],
    queryFn: () => api.get<{ retained: boolean; items: EmailAttachment[] }>(endpoint),
    enabled: open,
    meta: { silent: true },
    retry: false,
  })
  return (
    <div className="mt-3 space-y-2">
      <Button
        variant="ghost"
        className="min-h-11"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        leftIcon={<Paperclip aria-hidden="true" className="h-4 w-4" />}
      >
        {open ? 'Hide attachments' : 'View attachments'}
      </Button>
      {open &&
        (files.isPending ? (
          <p role="status" className="text-xs text-text-muted">
            Loading files…
          </p>
        ) : files.error ? (
          <p role="status" className="text-xs text-danger">
            Could not load attachments.{' '}
            <button className="min-h-11 underline" onClick={() => void files.refetch()}>
              Try again
            </button>
          </p>
        ) : files.data ? (
          <>
            {!files.data.retained ? (
              <p className="text-xs text-text-muted">
                The original for this older email was not retained. Attachments cannot be recovered
                here.
              </p>
            ) : !files.data.items.length ? (
              <p className="text-xs text-text-muted">This email has no attachments.</p>
            ) : (
              <EmailAttachmentFiles
                key={`${dashboardScope}:${messageId}`}
                endpoint={endpoint}
                items={files.data.items}
              />
            )}
          </>
        ) : null)}
    </div>
  )
}
