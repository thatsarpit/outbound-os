import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { tasksApi } from '@/api/endpoints/tasks'
import { useWorkspaceTimezone } from '@/hooks/use-workspace-timezone'
import { useAuthStore } from '@/stores/auth-store'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { toast } from '@/stores/toast-store'
import {
  MobileError,
  MobilePagination,
  MobileRefresh,
  mobileButton,
  mobileDueDate,
} from '@/components/mobile/mobile-shared'

export default function MobileTasksPage() {
  const { dashboardScope, user } = useAuthStore()
  const online = useOnlineStatus()
  const { timezone } = useWorkspaceTimezone()
  const client = useQueryClient()
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(1)
  const result = useQuery({
    refetchOnWindowFocus: true,
    queryKey: ['mobile-tasks', dashboardScope, page, showAll],
    queryFn: () => tasksApi.listTeamTasks({ page, limit: 25, done: showAll }),
    refetchInterval: 30_000,
  })
  useEffect(() => {
    if (result.data) setPage((current) => Math.min(current, Math.max(1, result.data?.pages ?? 1)))
  }, [result.data])

  const complete = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: ({ leadId, id, done }: { leadId: number; id: number; done: boolean }) =>
      tasksApi.update(leadId, id, { done: !done }),
    onSuccess: (_, task) => {
      client.invalidateQueries({ queryKey: ['mobile-tasks'] })
      client.invalidateQueries({ queryKey: ['lead-tasks'] })
      toast.success(task.done ? 'Follow-up reopened' : 'Follow-up completed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
  const rows = Array.isArray(result.data?.tasks) ? result.data.tasks : []
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Workspace follow-ups. Open a lead to add or review its tasks.
      </p>
      <div className="flex rounded-lg border border-border bg-surface p-1">
        {[false, true].map((all) => (
          <button
            type="button"
            key={String(all)}
            aria-pressed={showAll === all}
            onClick={() => {
              setShowAll(all)
              setPage(1)
            }}
            className={`min-h-11 flex-1 rounded-md text-sm ${showAll === all ? 'bg-accent-muted font-medium text-accent' : 'text-text-muted'}`}
          >
            {all ? 'All follow-ups' : 'Pending'}
          </button>
        ))}
      </div>
      <MobileRefresh
        updatedAt={result.dataUpdatedAt}
        refreshing={result.isFetching}
        onRefresh={() => void result.refetch()}
      />
      {result.isPending ? (
        <p role="status" className="py-10 text-center text-sm text-text-muted">
          Loading follow-ups…
        </p>
      ) : result.error ? (
        <MobileError message="Could not load follow-ups." retry={() => result.refetch()} />
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>
              {result.data?.total ?? rows.length} {showAll ? 'follow-ups' : 'pending'}
            </span>
            <span className={result.data?.overdueCount ? 'text-warning' : ''}>
              {result.data?.overdueCount ?? 0} overdue
            </span>
          </div>
          {rows.length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {rows.map((task) => (
                <li key={task.id} className="flex items-start gap-2 p-3">
                  <button
                    type="button"
                    aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.title}`}
                    className={`${mobileButton} w-11 shrink-0 px-0 ${task.done ? 'text-accent' : 'text-text-muted'}`}
                    disabled={!online || user?.role === 'viewer' || complete.isPending}
                    onClick={() => complete.mutate(task)}
                  >
                    <Check className="h-5 w-5" />
                  </button>
                  <Link
                    to={`/m/leads?leadId=${task.leadId}`}
                    className="flex min-h-14 min-w-0 flex-1 items-center gap-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block break-words text-sm font-medium ${task.done ? 'line-through text-text-muted' : ''}`}
                      >
                        {task.title}
                      </span>
                      <span className="mt-1 block truncate text-xs text-text-secondary">
                        {task.leadName || 'Open lead'}
                      </span>
                      <span
                        className={`mt-1 block text-xs ${task.overdue ? 'text-warning' : 'text-text-muted'}`}
                      >
                        {task.done ? 'Completed · ' : ''}
                        {mobileDueDate(task.dueAt, timezone)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-border bg-surface p-8 text-center">
              <Check className="mx-auto h-8 w-8 text-accent" />
              <p className="mt-3 font-medium">
                {showAll ? 'No follow-ups yet' : 'No pending follow-ups'}
              </p>
              <p className="mt-2 text-sm text-text-muted">
                Add the next action from any lead or conversation.
              </p>
              <Link to="/m/leads" className={`${mobileButton} mt-4`}>
                Open leads
              </Link>
            </div>
          )}
          <MobilePagination page={page} pages={result.data?.pages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  )
}
