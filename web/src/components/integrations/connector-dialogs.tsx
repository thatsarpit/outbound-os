import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { ConnectorReceiptPage, ReceiptState, WebhookSource } from '@/api/endpoints/connectors'
import { salesApi } from '@/api/endpoints/sales'
import { Button, Input } from '@/components/ui'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/stores/toast-store'
import { useWorkspaceTimezone } from '@/hooks/use-workspace-timezone'

const selectClass =
  'w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40'

export function ConnectorSourceDialog({
  source,
  onClose,
}: {
  source: WebhookSource
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [supplierId, setSupplierId] = useState(String(source.importSupplierId || ''))
  const [tags, setTags] = useState(source.importTags || '')
  const suppliers = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const response = await salesApi.listSuppliers()
      if (!response) throw new Error('Could not load suppliers.')
      return response
    },
  })
  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/connector-sources/${source.id}`, {
        supplierId: Number(supplierId),
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['webhook-sources'] })
      toast.success('Import attribution saved')
      onClose()
    },
  })
  const available = (suppliers.data?.data || []).filter((supplier) => supplier.enabled)
  const validSupplier = available.some((supplier) => String(supplier.id) === supplierId)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent size="lg" className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure historical imports</DialogTitle>
          <DialogDescription>
            {source.name} · Choose the partner who supplied these leads.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (validSupplier) mutation.mutate()
          }}
        >
          <DialogBody className="space-y-4">
            <p className="rounded-md bg-accent-muted p-3 text-sm text-text-secondary">
              New contacts stay paused. Imports do not grant marketing consent or queue outreach.
            </p>
            {suppliers.isPending ? (
              <p role="status">Loading suppliers…</p>
            ) : suppliers.isError ? (
              <div role="alert" className="space-y-2 text-sm text-danger">
                <p>{suppliers.error.message}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void suppliers.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <label className="block space-y-1.5 text-sm font-medium">
                <span>Lead origin supplier</span>
                <select
                  className={selectClass}
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                  required
                >
                  <option value="">Choose a supplier</option>
                  {available.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {suppliers.isSuccess && available.length === 0 && (
              <p className="text-sm text-text-muted">
                Create an enabled supplier under Settings → Payments &amp; suppliers first.
              </p>
            )}
            <Input
              label="Additional tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="partner-import, historical"
              description="Comma-separated. The supplier’s matching tag is also added automatically."
            />
            <p className="text-xs text-text-muted">
              Changes apply to future imports. Existing contacts, order origins and import receipts
              keep their recorded attribution. Use the historical import URL shown on the source
              card after saving.
            </p>
            {mutation.isError && (
              <p role="alert" className="text-sm text-danger">
                {mutation.error.message}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!validSupplier || mutation.isPending}
              isLoading={mutation.isPending}
            >
              Save attribution
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Retained source text is displayed as escaped text, including malformed old records.
function receiptFields(recordJson: string): Array<[string, string]> {
  try {
    const record: unknown = JSON.parse(recordJson)
    if (!record || typeof record !== 'object' || Array.isArray(record)) return []
    const labels: Record<string, string> = {
      name: 'Name',
      company: 'Company',
      mobile: 'Phone',
      email: 'Email',
      country: 'Country',
      product: 'Enquiry',
      quantity: 'Quantity',
      acquiredAt: 'Acquired',
      notes: 'Notes',
    }
    return Object.entries(labels).flatMap(([key, label]) => {
      const value = (record as Record<string, unknown>)[key]
      return typeof value === 'string' && value ? [[label, value] as [string, string]] : []
    })
  } catch {
    return []
  }
}

export function ConnectorReceiptsDialog({
  source,
  onClose,
}: {
  source: WebhookSource
  onClose: () => void
}) {
  const { timezone } = useWorkspaceTimezone()
  const [state, setState] = useState<ReceiptState | ''>('conflict')
  const [page, setPage] = useState(1)
  const receipts = useQuery({
    queryKey: ['connector-receipts', source.id, state, page],
    queryFn: async () => {
      const response = await api.get<ConnectorReceiptPage>(
        `/connector-receipts?sourceId=${source.id}&state=${state}&page=${page}`,
      )
      if (!response) throw new Error('Could not load import records.')
      return response
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent size="2xl" className="flex max-h-[90dvh] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Import records</DialogTitle>
          <DialogDescription>
            {source.name} · Conflicts are held for review and do not change contacts.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="min-h-0 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-40 flex-1 space-y-1 text-sm font-medium">
              <span>Record status</span>
              <select
                className={selectClass}
                value={state}
                onChange={(event) => {
                  setState(event.target.value as ReceiptState | '')
                  setPage(1)
                }}
              >
                <option value="conflict">Conflicts</option>
                <option value="created">New contacts</option>
                <option value="matched">Matched contacts</option>
                <option value="">All records</option>
              </select>
            </label>
            <Button
              variant="secondary"
              isLoading={receipts.isFetching}
              onClick={() => void receipts.refetch()}
            >
              Refresh
            </Button>
          </div>
          {receipts.isPending ? (
            <p role="status" className="py-6 text-sm text-text-muted">
              Loading import records…
            </p>
          ) : receipts.isError ? (
            <p role="alert" className="text-sm text-danger">
              {receipts.error.message} Use Refresh to try again.
            </p>
          ) : receipts.data.records.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-6 text-sm text-text-muted">
              No {state === 'conflict' ? 'conflicts' : 'records'} found for this filter.
            </p>
          ) : (
            receipts.data.records.map((receipt) => (
              <article
                key={receipt.id}
                className="space-y-3 rounded-md border border-border p-4 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-all font-mono text-xs">{receipt.externalId}</p>
                  <span className={receipt.state === 'conflict' ? 'text-danger' : 'text-success'}>
                    {receipt.state === 'created'
                      ? 'New contact'
                      : receipt.state === 'matched'
                        ? 'Matched contact'
                        : 'Conflict'}
                  </span>
                </div>
                {receipt.reason && <p className="text-danger">{receipt.reason}</p>}
                {receipt.leadId != null && (
                  <p className="text-text-muted">Lead #{receipt.leadId}</p>
                )}
                <dl className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
                  {receiptFields(receipt.recordJson).map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-xs text-text-muted">{label}</dt>
                      <dd className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-text-muted">
                  Recorded{' '}
                  {new Date(receipt.createdAt).toLocaleString(undefined, {
                    timeZone: timezone,
                    timeZoneName: 'short',
                  })}
                </p>
              </article>
            ))
          )}
          <p className="text-xs text-text-muted">
            This view does not approve merges or rewrite supplier ownership. Replaying a conflict
            keeps it held for review.
          </p>
        </DialogBody>
        <DialogFooter className="flex-row flex-wrap items-center justify-between sm:justify-between">
          <span className="text-xs text-text-muted">
            {receipts.data
              ? `${receipts.data.total} records · Page ${page} of ${Math.max(1, receipts.data.pages)}`
              : 'Import history'}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || receipts.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!receipts.data || page >= receipts.data.pages || receipts.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
