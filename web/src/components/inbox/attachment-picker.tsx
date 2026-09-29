import { useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { File, Loader2, Paperclip, X } from 'lucide-react'
import type { MediaFile } from '@/api/types'
import { inboxApi } from '@/api/endpoints/inbox'
import { cn } from '@/lib/utils'

type AttachmentPickerProps = {
  attachments: MediaFile[]
  onAdd: (file: MediaFile) => void
  onRemove: (id: number) => void
  disabled?: boolean
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentPicker({
  attachments,
  onAdd,
  onRemove,
  disabled,
}: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadMutation = useMutation({
    mutationFn: (file: File) => inboxApi.uploadMedia(file),
    onSuccess: (data) => {
      if (data) onAdd(data)
    },
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('File must be under 10 MB')
      return
    }
    uploadMutation.mutate(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-2">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-surface-overlay px-2.5 py-1.5 text-xs text-text-secondary"
            >
              <File className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <span className="max-w-[140px] truncate">{a.originalName}</span>
              <span className="text-text-muted">{formatFileSize(a.size)}</span>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                disabled={disabled}
                className="ml-0.5 rounded p-0.5 text-text-muted transition-colors hover:bg-surface-raised hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.mp4,.3gp,.mp3,.ogg,.aac,.m4a"
        onChange={handleFileSelect}
        className="hidden"
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploadMutation.isPending}
        className={cn(
          'inline-flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
          'text-text-muted hover:bg-surface-raised hover:text-text-secondary',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {uploadMutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Paperclip className="h-3.5 w-3.5" />
        )}
        Attach file
      </button>
    </div>
  )
}
