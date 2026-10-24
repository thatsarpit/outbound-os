import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { EmailAccount, Lead } from '@/api/types'
import { useAuthStore } from '@/stores/auth-store'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { EmailAttachmentFiles, type EmailAttachment } from '@/components/inbox/email-attachments'
import { formatRelativeTime } from '@/lib/utils'
import { toast } from '@/stores/toast-store'

interface Receipt {
  id: number
  provider: string
  from: string
  to: string[]
  receivedAt: string
  state: string
  reason: string | null
  canRetry: boolean
  canAssign: boolean
  hasOriginal: boolean
}
interface ReceiptPage {
  items: Receipt[]
  total: number
  page: number
  pages: number
  receiverEnabled: boolean
}

/** Held mail stays visible until an operator resolves its customer association. */
export function EmailReceipts({ accounts }: { accounts: EmailAccount[] }) {
  const { dashboardScope } = useAuthStore()
  const online = useOnlineStatus()
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [state, setState] = useState('attention')
  const [selected, setSelected] = useState<Receipt | null>(null)
  const [preview, setPreview] = useState<Receipt | null>(null)
  const [search, setSearch] = useState('')
  const [leadId, setLeadId] = useState('')
  const [accountId, setAccountId] = useState('')
  const receipts = useQuery({
    queryKey: ['email-receipts', dashboardScope, page, state],
    queryFn: () => api.get<ReceiptPage>(`/email/receipts?page=${page}&state=${state}`),
    refetchInterval: 30_000,
    meta: { silent: true },
  })
  const content = useQuery({
    queryKey: ['email-receipt-content', dashboardScope, preview?.id],
    queryFn: () =>
      api.get<{ subject: string; text: string; items: EmailAttachment[] }>(
        `/email/receipts/${preview!.id}`,
      ),
    enabled: Boolean(preview),
    retry: false,
    meta: { silent: true },
  })
  const candidates = useQuery({
    queryKey: ['receipt-lead-search', dashboardScope, search],
    queryFn: () =>
      api.get<{ leads: Lead[] }>(`/leads?limit=10&search=${encodeURIComponent(search.trim())}`),
    enabled: Boolean(selected && search.trim().length >= 3),
    meta: { silent: true },
  })
  useEffect(() => {
    if (receipts.data)
      setPage((current) => Math.min(current, Math.max(1, receipts.data?.pages || 1)))
  }, [receipts.data])
  const retry = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: ({ receipt, manual }: { receipt: Receipt; manual?: boolean }) => {
      if (!online) throw new Error('Reconnect before reprocessing an email.')
      if (manual && (!leadId || !accountId)) throw new Error('Choose a lead and receiving account.')
      return api.post<{ state: string; reason: string | null }>(
        `/email/receipts/${receipt.id}/retry`,
        manual ? { leadId: Number(leadId), accountId: Number(accountId) } : {},
      )
    },
    onSuccess: (result) => {
      if (!result) return toast.error('The receipt result could not be confirmed.')
      toast.success(
        result.state === 'matched'
          ? 'Email linked to its conversation'
          : `Email retained for review: ${result.reason?.replace(/_/g, ' ') || result.state}`,
      )
      setSelected(null)
      setPreview(null)
      void client.invalidateQueries({ queryKey: ['email-receipts'] })
      void client.invalidateQueries({ queryKey: ['inbox-threads'] })
      void client.invalidateQueries({ queryKey: ['inbox-thread'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })
  const choose = (receipt: Receipt) => {
    setSelected(receipt)
    setSearch(receipt.from)
    setLeadId('')
    setAccountId('')
  }
  const field =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary sm:text-sm'
  return (
    <section
      className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5"
      aria-labelledby="receipt-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="receipt-title" className="text-sm font-semibold">
            Inbound email review
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-text-secondary">
            Review retained mail that could not be linked automatically. Reprocessing never sends a
            customer message.
          </p>
          {receipts.data ? (
            <p className="mt-1 text-xs text-text-muted">
              Direct email receiver{' '}
              {receipts.data.receiverEnabled ? 'enabled on server' : 'disabled'} ·{' '}
              {receipts.data.total} receipts in this view
            </p>
          ) : null}
        </div>
        <select
          aria-label="Receipt status"
          value={state}
          onChange={(event) => {
            setState(event.target.value)
            setPage(1)
            setSelected(null)
          }}
          className={`${field} sm:w-auto`}
        >
          <option value="attention">Needs review</option>
          {['matched', 'unmatched', 'pending', 'partial', 'conflict', 'invalid'].map((value) => (
            <option key={value} value={value}>
              {value === 'matched' ? 'Linked' : value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      </div>
      {receipts.error ? (
        <div role="status" className="text-sm text-text-secondary">
          Could not load email receipts.{' '}
          <button className="min-h-11 underline" onClick={() => void receipts.refetch()}>
            Try again
          </button>
        </div>
      ) : receipts.isPending ? (
        <p role="status" className="text-sm text-text-muted">
          Loading retained mail…
        </p>
      ) : !receipts.data?.items.length ? (
        <p className="rounded-md bg-surface-raised p-4 text-sm text-text-secondary">
          No receipts in this view. This does not prove that an external email route is delivering.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {receipts.data.items.map((receipt) => (
            <li key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1 basis-60">
                <p className="break-all text-sm font-medium">
                  {receipt.from || 'Sender unavailable'}
                </p>
                <p className="mt-1 break-all text-xs text-text-secondary">
                  To {receipt.to.join(', ') || 'unknown recipient'}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {receipt.provider} · {formatRelativeTime(receipt.receivedAt)} · {receipt.state}
                  {receipt.reason ? ` · ${receipt.reason.replace(/_/g, ' ')}` : ''}
                </p>
                {receipt.state === 'partial' && (
                  <p className="mt-1 text-xs text-warning">
                    Waiting for mailbox sync to recover the complete email.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {receipt.hasOriginal && (
                  <Button
                    className="min-h-11"
                    size="sm"
                    variant="secondary"
                    onClick={() => setPreview(receipt)}
                  >
                    Read email
                  </Button>
                )}
                {receipt.canRetry && (
                  <Button
                    size="sm"
                    className="min-h-11"
                    variant="secondary"
                    disabled={!online || retry.isPending}
                    onClick={() => retry.mutate({ receipt })}
                  >
                    Retry matching
                  </Button>
                )}
                {receipt.canAssign && (
                  <Button
                    size="sm"
                    className="min-h-11"
                    variant="secondary"
                    disabled={!online || retry.isPending}
                    onClick={() => choose(receipt)}
                  >
                    Choose lead
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <form
          className="space-y-3 rounded-md border border-border bg-surface-raised p-4"
          onSubmit={(event) => {
            event.preventDefault()
            retry.mutate({ receipt: selected, manual: true })
          }}
        >
          <p className="text-sm font-medium">Associate email from {selected.from}</p>
          <label className="block space-y-1 text-xs text-text-secondary">
            <span>Find a lead by name, email or phone</span>
            <input
              className={field}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setLeadId('')
              }}
            />
          </label>
          <label className="block space-y-1 text-xs text-text-secondary">
            <span>Existing lead</span>
            <select
              required
              className={field}
              value={leadId}
              onChange={(event) => setLeadId(event.target.value)}
            >
              <option value="">
                {candidates.isFetching ? 'Searching…' : 'Choose the matching lead'}
              </option>
              {candidates.data?.leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.name} · {lead.email || lead.mobile}
                </option>
              ))}
            </select>
          </label>
          {candidates.error && (
            <p role="status" className="text-xs text-warning">
              Lead search unavailable. Reconnect and try again.
            </p>
          )}
          <label className="block space-y-1 text-xs text-text-secondary">
            <span>Receiving account</span>
            <select
              required
              className={field}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">Choose the account that received this email</option>
              {accounts
                .filter((account) => account.enabled)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name || account.email} · {account.email}
                  </option>
                ))}
            </select>
          </label>
          <p className="text-xs leading-5 text-text-secondary">
            Confirm the sender and recipient before linking. A human reply stops queued outreach and
            can update the lead’s reply state.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              className="min-h-11"
              pending={retry.isPending}
              pendingLabel="Linking email…"
              disabled={!online || !leadId || !accountId}
            >
              Link and process email
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={retry.isPending}
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {(receipts.data?.pages || 0) > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
          <Button
            variant="secondary"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {receipts.data?.pages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= (receipts.data?.pages || 1)}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      )}
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      >
        <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review received email</DialogTitle>
            <DialogDescription className="break-all">
              From {preview?.from || 'unknown sender'} · To{' '}
              {preview?.to.join(', ') || 'unknown recipient'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-5">
            {content.isPending ? (
              <p role="status" className="text-sm text-text-muted">
                Opening retained email…
              </p>
            ) : content.error ? (
              <p role="alert" className="text-sm text-danger">
                {content.error.message}{' '}
                <button className="min-h-11 underline" onClick={() => void content.refetch()}>
                  Try again
                </button>
              </p>
            ) : content.data ? (
              <>
                <h3 className="break-words text-sm font-semibold">
                  {content.data.subject || '(No subject)'}
                </h3>
                <p className="max-h-[40dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-4 text-sm leading-6">
                  {content.data.text || 'This email has no text body. Check its attachments below.'}
                </p>
                <EmailAttachmentFiles
                  key={`${dashboardScope}:${preview?.id}`}
                  endpoint={`/email/receipts/${preview?.id}/attachments`}
                  items={content.data.items}
                />
                <p className="text-xs leading-5 text-text-muted">
                  Reading does not link this mail or send a reply. Verify the sender and recipient
                  before associating it with a customer.
                </p>
                {preview?.canAssign && (
                  <Button
                    className="min-h-11"
                    onClick={() => {
                      choose(preview)
                      setPreview(null)
                    }}
                  >
                    Choose matching lead
                  </Button>
                )}
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
