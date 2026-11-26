import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Image, Paperclip, X } from 'lucide-react'
import type { BrowserChatAttachment } from '@/api/types'
import { Button } from '@/components/ui/button'

const accept = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,.txt'

export function BrowserChatFilePicker({ file, onChange, disabled }: {
  file: File | null
  onChange: (file: File | null) => void
  disabled: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  return (
    <div className="space-y-1">
      <input ref={input} type="file" hidden accept={accept} disabled={disabled} onChange={event => {
        const selected = event.target.files?.[0]
        event.target.value = ''
        if (!selected) return
        const issue = selected.size === 0 ? 'Choose a non-empty file.' : selected.size >= 5 * 1024 * 1024
          ? 'Choose a file under 5 MB.' : !/\.(jpe?g|png|webp|txt)$/i.test(selected.name)
            ? 'Choose a JPEG, PNG, WebP or .txt file.' : ''
        setError(issue)
        if (!issue) onChange(selected)
      }} />
      {file ? (
        <div className="flex min-w-0 items-center gap-2 rounded-xl bg-surface-raised pl-3 text-sm">
          <Paperclip aria-hidden="true" className="size-4 shrink-0 text-webchat" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <Button variant="ghost" className="size-11 shrink-0" aria-label="Remove attachment" disabled={disabled} onClick={() => {
            setError('')
            onChange(null)
          }}><X aria-hidden="true" className="size-4" /></Button>
        </div>
      ) : (
        <Button variant="ghost" className="min-h-11 px-2.5 text-text-secondary" disabled={disabled}
          leftIcon={<Paperclip aria-hidden="true" className="size-4" />} onClick={() => input.current?.click()} title="JPEG, PNG, WebP or .txt under 5 MB">
          Attach file
        </Button>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  )
}

export function browserChatMessageBody(fields: Record<string, string>, file: File | null) {
  if (!file) return JSON.stringify(fields)
  const form = new FormData()
  Object.entries(fields).forEach(([name, value]) => form.set(name, value))
  form.set('file', file)
  return form
}

export function BrowserChatFile({ attachment, load }: {
  attachment: BrowserChatAttachment
  load: (signal: AbortSignal) => Promise<Blob>
}) {
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const photo = attachment.contentType === 'image/webp'
  const expires = Date.parse(attachment.expiresAt)
  const expired = !Number.isFinite(expires) || expires <= Date.now()
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  async function action(showPreview: boolean) {
    if (controller.current) return
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    setError('')
    try {
      const blob = await load(request.signal)
      if (request.signal.aborted) return
      const expectedType = photo ? 'image/webp' : 'application/octet-stream'
      if (blob.type !== expectedType || blob.size !== attachment.size) throw new Error('Invalid download')
      const url = URL.createObjectURL(blob)
      if (showPreview) {
        setPreview(url)
      } else {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = attachment.filename
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      if (!request.signal.aborted) setError('Could not open this file. Try again.')
    } finally {
      controller.current = null
      if (!request.signal.aborted) setBusy(false)
    }
  }

  const Icon = photo ? Image : FileText
  return (
    <div className="my-1 min-w-0 max-w-xs space-y-1.5 rounded-xl border border-border bg-background/60 px-2.5 py-1.5">
      <p className="flex min-w-0 items-center gap-2 text-xs font-medium">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-webchat" />
        <span className="truncate" title={attachment.filename}>{attachment.filename}</span>
      </p>
      {expired ? <p className="text-xs text-text-muted">Attachment expired</p> : (
        <>
          {preview && <img src={preview} alt="Attached photo" className="max-h-64 w-full rounded-lg object-contain" />}
          <div className="flex flex-wrap gap-x-2">
            {photo && !preview && <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-8" disabled={busy} onClick={() => void action(true)}>View photo</Button>}
            <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-8" disabled={busy}
              leftIcon={<Download aria-hidden="true" className="size-3.5" />} onClick={() => void action(false)}>
              {busy ? 'Opening…' : 'Download'}
            </Button>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  )
}
