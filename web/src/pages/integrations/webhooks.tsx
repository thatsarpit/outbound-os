import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { WebhookSource } from '@/api/endpoints/connectors'
import { salesApi } from '@/api/endpoints/sales'
import { Button, Input, ConfirmDialog } from '@/components/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Loader2, Plus, Trash2, Webhook, Link2 } from 'lucide-react'
import { InfoTile } from '@/components/integrations/integration-helpers'
import {
  ConnectorSourceDialog,
  ConnectorReceiptsDialog,
} from '@/components/integrations/connector-dialogs'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'

export default function WebhooksSection() {
  const queryClient = useQueryClient()
  const canEdit = useAuthStore((state) => state.user?.role === 'admin')
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<WebhookSource | null>(null)
  const [configureSource, setConfigureSource] = useState<WebhookSource | null>(null)
  const [reviewSource, setReviewSource] = useState<WebhookSource | null>(null)
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: salesApi.listSuppliers })

  const {
    data: rawSources,
    isLoading,
    error,
    refetch,
  } = useQuery({
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
    onSuccess: () => {
      setConfirmDelete(null)
      void queryClient.invalidateQueries({ queryKey: ['webhook-sources'] })
    },
    onError: (error) => toast.error(error.message),
  })
  const toggleMutation = useMutation({
    mutationFn: (source: WebhookSource) =>
      api.patch(`/webhooks/sources/${source.id}`, { enabled: !source.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhook-sources'] }),
    onError: (error) => toast.error(error.message),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 text-accent animate-spin" />
      </div>
    )
  }

  if (error)
    return (
      <div role="alert" className="space-y-3 rounded-md border border-danger/30 p-5 text-sm">
        <p>{error.message}</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Retry loading sources
        </Button>
      </div>
    )

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">Lead sources</p>
            <p className="mt-1 text-sm text-text-secondary">
              {sources.length} sources feeding inbound leads into the workspace.
            </p>
          </div>
          {canEdit && (
            <Button
              size="sm"
              onClick={() => setShowAdd(true)}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Add Source
            </Button>
          )}
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
          <article
            key={src.id}
            aria-label={src.name}
            className="card-hover glass overflow-hidden rounded-lg"
          >
            <div className="border-b border-border bg-surface/70 p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-muted">
                    <Link2 className="w-4 h-4 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <p className="break-words [overflow-wrap:anywhere] text-sm font-semibold">
                      {src.name}
                    </p>
                    <p className="text-text-muted text-xs">{src.totalReceived} leads received</p>
                  </div>
                </div>
                <span
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase',
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
                <span className="break-all rounded-full bg-surface-raised px-2.5 py-1 text-text-muted">
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
                <p className="text-xs text-text-muted mb-1">
                  {src.importSupplierId
                    ? 'Historical import URL · no outreach queued'
                    : 'Live inbound URL · outreach rules apply'}
                </p>
                <p className="break-all text-xs font-mono text-accent">{`/api/webhooks/${src.importSupplierId ? 'connector' : 'inbound'}/${src.source}`}</p>
              </div>
              {src.importSupplierId && (
                <p className="mt-2 break-words [overflow-wrap:anywhere] text-xs text-text-muted">
                  Origin supplier:{' '}
                  {suppliers?.data.find((supplier) => supplier.id === src.importSupplierId)?.name ||
                    `#${src.importSupplierId}`}
                  {src.importTags ? ` · ${src.importTags}` : ''}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {canEdit && (
                  <Button variant="secondary" size="sm" onClick={() => setConfigureSource(src)}>
                    {src.importSupplierId ? 'Edit attribution' : 'Configure imports'}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setReviewSource(src)}>
                  Import records
                </Button>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={toggleMutation.isPending}
                    onClick={() => toggleMutation.mutate(src)}
                  >
                    {src.enabled ? 'Disable' : 'Enable'}
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:text-danger hover:bg-danger-muted"
                    onClick={() => setConfirmDelete(src)}
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </article>
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

      {showAdd && (
        <AddWebhookModal
          onClose={() => setShowAdd(false)}
          onConfigure={(source) => {
            setShowAdd(false)
            setConfigureSource(source)
          }}
        />
      )}
      {configureSource && (
        <ConnectorSourceDialog source={configureSource} onClose={() => setConfigureSource(null)} />
      )}
      {reviewSource && (
        <ConnectorReceiptsDialog source={reviewSource} onClose={() => setReviewSource(null)} />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
        title="Delete webhook source?"
        description={
          confirmDelete
            ? `"${confirmDelete.name}" will be permanently removed. Sources with import records must be disabled instead so their history is preserved.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete.id)
        }}
      />
    </div>
  )
}

function AddWebhookModal({
  onClose,
  onConfigure,
}: {
  onClose: () => void
  onConfigure: (source: WebhookSource) => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: '', slug: '' })
  const [created, setCreated] = useState<{ source: WebhookSource; apiKey: string } | null>(null)
  const [showKey, setShowKey] = useState(false)
  const presets = useQuery({
    queryKey: ['webhook-presets'],
    queryFn: async () => {
      const response = await api.get<Array<{ id: string; name: string; description: string }>>(
        '/webhooks/sources/presets',
      )
      if (!response) throw new Error('Could not load presets.')
      return response
    },
  })
  const mutation = useMutation({
    mutationFn: async (presetId?: string) => {
      const response = presetId
        ? await api.post<WebhookSource & { apiKey: string }>('/webhooks/sources/from-preset', {
            presetId,
          })
        : await api.post<WebhookSource & { apiKey: string }>('/webhooks/sources', {
            name: form.name.trim(),
            source: form.slug.trim(),
          })
      if (!response?.apiKey)
        throw new Error(
          'The server did not return a source key. Reload sources before trying again.',
        )
      return response
    },
    onSuccess: (response) => {
      const { apiKey, ...source } = response
      setCreated({ source, apiKey })
      // The full key stays in this dialog only; the query cache receives masked keys.
      void queryClient.invalidateQueries({ queryKey: ['webhook-sources'] })
    },
    gcTime: 0,
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose()
      }}
    >
      <DialogContent
        size="lg"
        showClose={!mutation.isPending}
        className="max-h-[90dvh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{created ? 'Save your source key' : 'Add webhook source'}</DialogTitle>
          <DialogDescription>
            {created
              ? 'This key is shown only once. Store it privately before closing this dialog.'
              : 'Connect a website form or an external lead source.'}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <>
            <DialogBody className="space-y-4">
              <p className="text-sm font-medium">{created.source.name}</p>
              <Input
                label="Source API key"
                type={showKey ? 'text' : 'password'}
                readOnly
                value={created.apiKey}
                autoComplete="off"
                className="font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowKey(!showKey)}>
                  {showKey ? 'Hide key' : 'Show key'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(created.apiKey)
                      .then(() => toast.success('Source key copied'))
                      .catch(() =>
                        toast.error('Could not copy. Use Show key and copy it manually.'),
                      )
                  }}
                >
                  Copy key
                </Button>
              </div>
              <p className="text-sm text-text-secondary">
                For historical imports, configure the origin supplier next. Use the historical
                import URL after configuration. Live intake follows your workspace outreach rules.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Done
              </Button>
              <Button onClick={() => onConfigure(created.source)}>Configure imports</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              mutation.mutate(undefined)
            }}
          >
            <DialogBody className="space-y-4">
              {presets.isError && (
                <p role="alert" className="text-sm text-danger">
                  Presets could not be loaded. You can still create a custom source.
                </p>
              )}
              {!!presets.data?.length && (
                <div className="flex flex-wrap gap-2">
                  {presets.data.map((preset) => (
                    <Button
                      key={preset.id}
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate(preset.id)}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
              )}
              <Input
                label="Name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Partner enquiries"
                required
              />
              <Input
                label="Slug"
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: event.target.value })}
                placeholder="partner-enquiries"
                description="A short name used in this source’s webhook URL."
                required
              />
              {mutation.isError && (
                <p role="alert" className="text-sm text-danger">
                  {mutation.error.message}
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!form.name.trim() || !form.slug.trim() || mutation.isPending}
                isLoading={mutation.isPending}
              >
                Create source
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
