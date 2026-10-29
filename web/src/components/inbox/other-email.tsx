import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { EmailAccount } from '@/api/types'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui'
import { EmailReceipts } from '@/components/integrations/email-receipts'

/** Unlinked mail belongs in the inbox too, without creating sales contacts. */
export function OtherEmail() {
  const { user, dashboardScope } = useAuthStore()
  const [open, setOpen] = useState(false)
  // Raw business mail retains the same admin boundary as email integration review.
  const allowed = user?.role === 'admin'
  const receipts = useQuery({
    queryKey: ['email-receipts', dashboardScope, 1, 'attention'],
    queryFn: () => api.get<{ total: number }>('/email/receipts?page=1&state=attention'),
    enabled: allowed,
    refetchInterval: 30_000,
    meta: { silent: true },
  })
  const accounts = useQuery({
    queryKey: ['email-accounts', dashboardScope],
    queryFn: () => api.get<EmailAccount[]>('/email/accounts'),
    enabled: allowed && open,
    meta: { silent: true },
  })
  if (!allowed) return null
  return (
    <section className="space-y-3" aria-label="Other received email">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <div>
          <p className="text-sm font-medium">Other email{receipts.data ? ` (${receipts.data.total})` : ''}</p>
          <p className="mt-1 text-xs text-text-muted">
            Received mail without a sales conversation, including account notices and unmatched senders.
          </p>
          {receipts.isError && <p role="status" className="mt-1 text-xs text-warning">Could not check other mail. Open it to retry.</p>}
        </div>
        <Button variant="secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>
          {open ? 'Hide other email' : 'Open other email'}
        </Button>
      </div>
      {open && <div className="max-h-[70dvh] overflow-y-auto">
        <EmailReceipts accounts={accounts.data || []} />
      </div>}
    </section>
  )
}
