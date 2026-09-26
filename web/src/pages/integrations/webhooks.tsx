import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Button, Input, ConfirmDialog } from '@/components/ui'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Loader2, Plus, Trash2, X, Webhook, Link2 } from 'lucide-react'
import { InfoTile } from '@/components/integrations/integration-helpers'

interface WebhookSource {
  id: number
  name: string
  source: string
  enabled: boolean
  totalReceived: number
  lastReceivedAt: string | null
  createdAt: string
}

export default function WebhooksSection() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<WebhookSource | null>(null)

  const { data: rawSources, isLoading } = useQuery({
    queryKey: ['webhook-sources'],
    queryFn: async () => {
      const res = await api.get<WebhookSource[]>('/webhooks/sources')
      if (!res) throw new Error('Empty response')
      return res
    },
  })

  const sources = Array.isArray(rawSources) ? rawSources : []

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/webhooks/sources/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhook-sources'] }),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 text-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">Webhook intake surface</p>
            <p className="mt-1 text-sm text-text-secondary">
              {sources.length} sources feeding inbound leads into the workspace.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAdd(true)}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Source
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InfoTile
          label="Sources"
          value={`${sources.length}`}
          detail="Inbound integrations configured"
        />
        <InfoTile
          label="Active"
          value={`${sources.filter((source) => source.enabled).length}`}
          detail="Sources currently enabled"
        />
        <InfoTile
          label="Leads Received"
          value={`${sources.reduce((sum, source) => sum + source.totalReceived, 0)}`}
          detail="Cumulative inbound lead count"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sources.map((src) => (
          <div key={src.id} className="card-hover glass overflow-hidden rounded-lg">
            <div className="border-b border-border bg-surface/70 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-muted">
                    <Link2 className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{src.name}</p>
                    <p className="text-text-muted text-xs">{src.totalReceived} leads received</p>
                  </div>
                </div>
                <span
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase',
                    src.enabled
                      ? 'bg-success-muted text-success'
                      : 'bg-surface-raised text-text-muted',
                  )}
                >
                  {src.enabled ? (
                    <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  ) : (
                    <div className="h-1.5 w-1.5 rounded-full bg-text-muted" />
                  )}
                  {src.enabled ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-surface-raised px-2.5 py-1 text-text-muted">
                  {src.source}
                </span>
                <span className="rounded-full bg-surface-raised px-2.5 py-1 text-text-muted">
                  Created {formatRelativeTime(src.createdAt)}
                </span>
                <span className="rounded-full bg-surface-raised px-2.5 py-1 text-text-muted">
                  Last{' '}
                  {src.lastReceivedAt ? formatRelativeTime(src.lastReceivedAt) : 'no activity yet'}
                </span>
              </div>
            </div>
            <div className="p-5">
              <div className="rounded-md border border-border bg-surface-raised p-3">
                <p className="text-[10px] text-text-muted mb-0.5">Webhook URL</p>
                <p className="text-xs font-mono truncate text-accent">{`/api/webhooks/inbound/${src.source}`}</p>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-text-muted">
                  {src.totalReceived} total received
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:text-danger hover:bg-danger-muted"
                  onClick={() => setConfirmDelete(src)}
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {sources.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-surface px-6 py-12 text-center">
          <Webhook className="mx-auto mb-2 h-10 w-10 text-text-muted/40 animate-pulse" />
          <p className="text-text-secondary text-sm">No webhook sources configured</p>
          <p className="text-text-muted text-xs mt-1">
            Add sources to receive leads from external platforms
          </p>
        </div>
      )}

      {showAdd && <AddWebhookModal onClose={() => setShowAdd(false)} />}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
        title="Delete webhook source?"
        description={
          confirmDelete
            ? `"${confirmDelete.name}" will be permanently removed and stop receiving leads.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete.id)
          setConfirmDelete(null)
        }}
      />
    </div>
  )
}

function AddWebhookModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: '', slug: '' })

  const { data: presets } = useQuery({
    queryKey: ['webhook-presets'],
    queryFn: async () => {
      const res = await api.get<Array<{ id: string; name: string; description: string }>>(
        '/webhooks/sources/presets',
      )
      if (!res) throw new Error('Empty response')
      return res
    },
  })

  const presetList = Array.isArray(presets) ? presets : []

  const mutation = useMutation({
    mutationFn: () => api.post('/webhooks/sources', { name: form.name, source: form.slug }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-sources'] })
      onClose()
    },
  })

  const presetMutation = useMutation({
    mutationFn: (presetId: string) => api.post('/webhooks/sources/from-preset', { presetId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-sources'] })
      onClose()
    },
  })

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg w-full max-w-md max-h-[85vh] overflow-y-auto border border-border shadow-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border bg-linear-to-br from-accent-muted/25 via-surface to-surface px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Webhook integration
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight">Add Webhook Source</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Create an inbound source or pick a preset to move faster.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {presetList.length > 0 && (
          <div className="px-6 pt-4 pb-2">
            <p className="text-xs font-medium text-text-secondary mb-2">Quick Add from Presets</p>
            <div className="flex flex-wrap gap-2">
              {presetList.map((p) => (
                <Button
                  key={p.id}
                  variant="secondary"
                  size="sm"
                  onClick={() => presetMutation.mutate(p.id)}
                  disabled={presetMutation.isPending}
                >
                  {p.name}
                </Button>
              ))}
            </div>
            <div className="my-3 border-t border-border-subtle" />
          </div>
        )}

        <div className="px-6 pb-4 space-y-3">
          <p className="text-xs font-medium text-text-secondary">Or create custom</p>
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Justdial Leads"
            required
          />
          <Input
            label="Slug"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="justdial"
            className="font-mono text-xs"
            required
          />
        </div>

        <div className="border-t border-border bg-surface/70 px-6 py-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.name || !form.slug}
            isLoading={mutation.isPending}
          >
            Create
          </Button>
        </div>
      </div>
    </div>
  )
}
