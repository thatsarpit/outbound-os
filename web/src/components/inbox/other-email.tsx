import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { EmailAccount } from '@/api/types'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Mail } from 'lucide-react'
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="min-h-11 lg:min-h-8" leftIcon={<Mail aria-hidden="true" className="size-4" />}>
          Other email{receipts.data ? ` (${receipts.data.total})` : ''}
        </Button>
      </DialogTrigger>
      <DialogContent size="2xl" className="flex max-h-[90dvh] flex-col">
        <DialogHeader className="shrink-0 pr-12">
          <DialogTitle>Other email</DialogTitle>
          <DialogDescription>Account notices and mail without a linked sales conversation.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
          <EmailReceipts accounts={accounts.data || []} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
