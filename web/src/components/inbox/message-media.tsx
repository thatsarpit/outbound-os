import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText, Loader2, Mic } from 'lucide-react'
import { apiFetchBlob } from '@/api/client'
import { cn } from '@/lib/utils'

/**
 * The file on a message: a photo inline, a voice note or video with a player,
 * a PDF or document to open. Files sit behind sign-in
 * (GET /api/messages/:id/media), so they are fetched with the session and
 * shown from a blob URL rather than linked directly.
 */
export function MessageMedia({
  messageId,
  mediaType,
  filename,
  className,
}: {
  messageId: number
  mediaType: string | null
  filename: string | null
  className?: string
}) {
  const { data: blob, isLoading, isError } = useQuery({
    queryKey: ['message-media', messageId],
    queryFn: () => apiFetchBlob(`/messages/${messageId}/media`),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
  })
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) return
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  const name = filename || 'Attachment'

  if (isLoading) {
    return (
      <div className={cn('mt-2 flex h-20 w-48 items-center justify-center rounded-md bg-surface', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
      </div>
    )
  }
  if (isError || !url) {
    return <p className={cn('mt-2 text-[11px] text-text-muted', className)}>File unavailable</p>
  }

  if (mediaType === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={cn('mt-2 block', className)}>
        <img src={url} alt={name} className="max-h-72 max-w-full rounded-md border border-border object-contain" />
      </a>
    )
  }
  if (mediaType === 'audio') {
    return (
      <div className={cn('mt-2 flex items-center gap-2', className)}>
        <Mic className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <audio controls src={url} className="h-9 max-w-[260px]" aria-label={name} />
      </div>
    )
  }
  if (mediaType === 'video') {
    return <video controls src={url} className={cn('mt-2 max-h-72 max-w-full rounded-md border border-border', className)} />
  }

  return (
    <a
      href={url}
      download={name}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'mt-2 inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2 text-[12px] text-text-primary transition-colors hover:border-border-strong',
        className,
      )}
    >
      <FileText className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
      <span className="truncate">{name}</span>
      <Download className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
    </a>
  )
}
