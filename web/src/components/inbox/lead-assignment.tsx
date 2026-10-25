import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { workspaceMembersApi } from '@/api/endpoints/workspace-members'
import { inboxApi } from '@/api/endpoints/inbox'
import { useAuthStore } from '@/stores/auth-store'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { toast } from '@/stores/toast-store'

/** The same ownership control is used in desktop context and mobile lead details. */
export function LeadAssignment({
  leadId,
  member,
  legacyId,
  legacyName,
}: {
  leadId: number
  member?: { key: string; name: string } | null
  legacyId?: number | null
  legacyName?: string | null
}) {
  const { user, dashboardScope } = useAuthStore()
  const online = useOnlineStatus()
  const client = useQueryClient()
  const canManage = user?.role === 'admin' || user?.role === 'manager'
  const canAssignSelf = Boolean(user && user.role !== 'viewer')
  const currentKey = member?.key || (legacyId ? `local:local:${legacyId}` : '')
  const currentName =
    member?.name || legacyName || (currentKey ? 'Assigned teammate' : 'Unassigned')
  const members = useQuery({
    queryKey: ['workspace-members', dashboardScope],
    queryFn: workspaceMembersApi.list,
    enabled: canManage && online,
    staleTime: 30_000,
    retry: false,
    meta: { silent: true },
  })
  const assignment = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (key: string | null | undefined) => {
      if (!online || !canAssignSelf)
        throw new Error('Reconnect and sign in with a sales account before changing an assignment.')
      const result =
        key === undefined
          ? await inboxApi.assignSelf(leadId)
          : await workspaceMembersApi.assign(leadId, key)
      if (!result) throw new Error('The assignment could not be confirmed. Try again.')
      return result
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['lead', leadId] }),
        client.invalidateQueries({ queryKey: ['lead-detail', leadId] }),
        client.invalidateQueries({ queryKey: ['leads'] }),
        client.invalidateQueries({ queryKey: ['inbox-thread', leadId] }),
        client.invalidateQueries({ queryKey: ['inbox-threads'] }),
        client.invalidateQueries({ queryKey: ['mobile-tasks'] }),
        client.invalidateQueries({ queryKey: ['workspace-tasks'] }),
      ])
      toast.success('Assignment saved')
    },
    onError: (error: Error) => toast.error(error.message),
  })
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-text-muted">Assigned teammate</p>
      {canManage ? (
        <>
          <select
            aria-label="Assign lead to a teammate"
            value={currentKey}
            disabled={!online || assignment.isPending || members.isPending || members.isError}
            onChange={(event) => assignment.mutate(event.target.value || null)}
            className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text-primary focus:outline-none focus:ring-2 focus:ring-focus disabled:opacity-50 sm:min-h-9 sm:text-xs"
          >
            <option value="">Unassigned</option>
            {currentKey && !members.data?.some((item) => item.key === currentKey) && (
              <option value={currentKey} disabled>
                {currentName} · saved assignment
              </option>
            )}
            {members.data?.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name}
                {item.email ? ` · ${item.email}` : ''}
              </option>
            ))}
          </select>
          {members.isError && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span>Team list unavailable.</span>
              <button
                type="button"
                disabled={!online}
                onClick={() => void members.refetch()}
                className="min-h-9 underline underline-offset-4 disabled:opacity-50"
              >
                Try again
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-text-secondary">{currentName}</p>
      )}
      {canAssignSelf && !currentKey && (
        <button
          type="button"
          disabled={!online || assignment.isPending}
          onClick={() => assignment.mutate(undefined)}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-xs text-text-secondary hover:bg-surface-raised disabled:opacity-50"
        >
          <UserPlus aria-hidden="true" className="h-4 w-4" /> Assign to me
        </button>
      )}
      {assignment.isPending && (
        <p role="status" className="text-xs text-text-muted">
          Saving assignment…
        </p>
      )}
      {!online && <p className="text-xs text-text-muted">Connect to change the assignment.</p>}
    </div>
  )
}
