import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { systemApi } from '@/api/endpoints/system'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'

export function OutreachPause() {
  const scope = useAuthStore((state) => state.dashboardScope)
  const queryClient = useQueryClient()
  const key = ['outreach-status', scope]
  const [requested, setRequested] = useState<boolean | null>(null)
  const status = useQuery({
    queryKey: key,
    queryFn: async () => (await systemApi.getOutreach()) ?? null,
    refetchInterval: 30_000,
    retry: false,
    meta: { silent: true },
  })
  const change = useMutation({
    mutationFn: systemApi.setOutreachPaused,
    onSuccess: (result) => {
      queryClient.setQueryData(key, result)
      setRequested(null)
      toast.success(result?.sendingPaused ? 'Workspace outreach paused' : 'Workspace outreach resumed')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
    meta: { silent: true },
  })
  const active = status.isError ? undefined : status.data?.sendingPaused
  return (
    <section aria-labelledby="outreach-status-heading" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 id="outreach-status-heading" className="text-sm font-semibold text-text-primary">Workspace outreach</h2>
        <p role="status" className="mt-1 text-sm text-text-secondary">
          {active === undefined
            ? status.isPending ? 'Checking outreach status…' : 'Outreach status is unavailable.'
            : active
              ? 'Paused. Inbound messages and manual replies are available.'
              : 'Active. Campaigns and due outbound messages can send.'}
        </p>
      </div>
      {active !== undefined && (
        <Button variant="secondary" onClick={() => { change.reset(); setRequested(!active) }}>
          {active ? 'Resume outreach' : 'Pause outreach'}
        </Button>
      )}
      <ConfirmDialog
        open={requested !== null}
        onOpenChange={(open) => { if (!open && !change.isPending) setRequested(null) }}
        title={requested ? 'Pause workspace outreach?' : 'Resume workspace outreach?'}
        description={requested
          ? 'New automated submissions will be held. Submissions already in progress may finish.'
          : 'Due queues can send again. Review any campaign that stopped while running before restarting it.'}
        confirmLabel={requested ? 'Pause outreach' : 'Resume outreach'}
        destructive={requested === true}
        isLoading={change.isPending}
        onConfirm={() => { if (requested !== null) change.mutate(requested) }}
      >
        {change.error && <p role="alert" className="text-sm text-danger">{change.error.message}</p>}
      </ConfirmDialog>
    </section>
  )
}
