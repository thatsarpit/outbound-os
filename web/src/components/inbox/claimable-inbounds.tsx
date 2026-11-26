import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { api } from '@/api/client'
import { inboxApi } from '@/api/endpoints/inbox'
import { Button } from '@/components/ui'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { formatRelativeTime } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

interface AvailableInbound {
  id: number
  source: string
  createdAt: string
}

export function ClaimableInbounds({ onClaim }: { onClaim: (leadId: number) => void }) {
  const [open, setOpen] = useState(false)
  const dashboardScope = useAuthStore(state => state.dashboardScope)
  const queryClient = useQueryClient()
  const queryKey = ['inbox-claimable', dashboardScope]
  const available = useQuery({
    queryKey,
    queryFn: () => api.get<{ leads: AvailableInbound[] }>('/inbox/claimable'),
    refetchInterval: 15_000,
  })
  const claim = useMutation({
    mutationFn: (leadId: number) => inboxApi.assignSelf(leadId),
    onSuccess: (_result, leadId) => {
      setOpen(false)
      for (const key of ['inbox-claimable', 'inbox-threads', 'mobile-leads', 'leads']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      void queryClient.invalidateQueries({ queryKey: ['inbox-thread', leadId] })
      onClaim(leadId)
    },
    onError: () => { void queryClient.invalidateQueries({ queryKey }) },
  })

  return (
    <Dialog open={open} onOpenChange={value => { setOpen(value); if (value) claim.reset() }}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-8" leftIcon={<UserPlus className="size-4" />}>
          Unclaimed inbounds{available.data?.leads.length ? ` (${available.data.leads.length})` : ''}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Unclaimed inbounds</DialogTitle>
          <DialogDescription>Claim a new inbound to open its conversation and reply.</DialogDescription>
        </DialogHeader>
        <DialogBody className="min-h-0 space-y-2 overflow-y-auto">
          {available.isPending && <p role="status" className="text-sm text-text-muted">Checking for inbounds…</p>}
          {available.isError && <Button variant="secondary" onClick={() => void available.refetch()}>Retry loading inbounds</Button>}
          {claim.error && <p role="alert" className="text-sm text-danger">{claim.error.message}</p>}
          {available.isSuccess && !available.data?.leads.length && <p className="text-sm text-text-muted">No unclaimed inbounds.</p>}
          {available.data?.leads.map(lead => (
            <div key={lead.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{lead.source === 'browser_chat_widget' ? 'Website chat' : 'WhatsApp'}</p>
                <p className="text-xs text-text-muted">{formatRelativeTime(lead.createdAt)}</p>
              </div>
              <Button size="sm" className="min-h-11 shrink-0" disabled={claim.isPending} onClick={() => claim.mutate(lead.id)}>
                Assign to me
              </Button>
            </div>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
