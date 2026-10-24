import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Circle, ListTodo, Pencil } from 'lucide-react'
import { tasksApi, type TeamTaskRow, type TaskDueFilter } from '@/api/endpoints/tasks'
import { useWorkspaceTimezone } from '@/hooks/use-workspace-timezone'
import { useAuthStore } from '@/stores/auth-store'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { workspaceWallTimeToUtc } from '@/lib/mobile-workspace-time'
import { taskDateInput, taskDueLabel } from '@/lib/task-date'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const DUE_FILTERS: Array<{ value: TaskDueFilter | ''; label: string }> = [
  { value: '', label: 'Any due date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'unscheduled', label: 'No due date' },
]

export default function TasksPage() {
  const scope = useAuthStore((state) => state.dashboardScope)
  const role = useAuthStore((state) => state.user?.role)
  const online = useOnlineStatus()
  const client = useQueryClient()
  const zone = useWorkspaceTimezone()
  const [ownership, setOwnership] = useState<'mine' | 'workspace'>('workspace')
  const [showAll, setShowAll] = useState(false)
  const [due, setDue] = useState<TaskDueFilter | ''>('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<TeamTaskRow | null>(null)
  const [saving, setSaving] = useState(false)
  const canEdit = Boolean(role && role !== 'viewer' && online)
  const result = useQuery({
    queryKey: ['workspace-tasks', scope, page, showAll, due, ownership],
    queryFn: () =>
      tasksApi.listTeamTasks({
        page,
        limit: 25,
        done: showAll,
        due: due || undefined,
        scope: ownership,
      }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    meta: { silent: true },
  })
  const pages = result.data?.pages
  useEffect(() => {
    if (pages !== undefined) setPage((current) => Math.min(current, Math.max(1, pages)))
  }, [pages])
  async function refreshTasks() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['workspace-tasks'] }),
      client.invalidateQueries({ queryKey: ['mobile-tasks'] }),
      client.invalidateQueries({ queryKey: ['lead-tasks'] }),
    ])
  }
  const complete = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: (task: TeamTaskRow) => {
      if (!canEdit) throw new Error('Reconnect before changing a task.')
      return tasksApi.update(task.leadId, task.id, { done: !task.done })
    },
    onSuccess: (_result, task) => {
      void refreshTasks()
      toast.success(task.done ? 'Follow-up reopened' : 'Follow-up completed')
    },
    onError: (error: Error) => toast.error(error.message),
  })
  const rows = result.data?.tasks ?? []
  const total = result.data?.total
  const busy = complete.isPending

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title="Tasks"
        description="Workspace follow-ups, linked to the lead and the next action."
        actions={
          <Button asChild variant="secondary">
            <Link to="/leads">Open leads</Link>
          </Button>
        }
      />
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <label htmlFor="task-ownership">Follow-ups for</label>
        <select
          id="task-ownership"
          value={ownership}
          onChange={(event) => {
            setOwnership(event.target.value as 'mine' | 'workspace')
            setPage(1)
          }}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-text-primary"
        >
          <option value="workspace">Workspace leads</option>
          {role !== 'viewer' && <option value="mine">My assigned leads</option>}
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
        <div className="flex flex-wrap gap-1" aria-label="Task visibility">
          {[false, true].map((all) => (
            <button
              key={String(all)}
              type="button"
              aria-pressed={showAll === all}
              onClick={() => {
                setShowAll(all)
                setDue('')
                setPage(1)
              }}
              className={cn(
                'min-h-10 rounded-md px-3 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                showAll === all
                  ? 'bg-surface-raised text-text-primary'
                  : 'text-text-secondary hover:bg-surface-raised',
              )}
            >
              {all ? 'All follow-ups' : 'Pending'}
            </button>
          ))}
        </div>
        {!showAll && (
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            Due date
            <select
              value={due}
              onChange={(event) => {
                setDue(event.target.value as TaskDueFilter | '')
                setPage(1)
              }}
              className="min-h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-focus"
            >
              {DUE_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        <p>
          {total !== undefined
            ? `${total.toLocaleString()} ${showAll ? 'follow-ups' : 'pending follow-ups'}`
            : result.error
              ? 'Follow-up count unavailable'
              : 'Loading follow-ups…'}
          {result.data?.overdueCount !== undefined && (
            <span className={result.data.overdueCount ? 'ml-3 text-warning' : 'ml-3'}>
              {result.data.overdueCount.toLocaleString()} overdue{' '}
              {ownership === 'mine' ? 'for my leads' : 'across the workspace'}
            </span>
          )}
        </p>
        <p role="status">
          {!online
            ? 'Offline · showing loaded data'
            : result.isFetching
              ? 'Syncing…'
              : result.error
                ? 'Last update failed'
                : 'Updates automatically'}
        </p>
      </div>
      {zone.ready ? (
        <p className="text-xs text-text-muted">
          Dates use the workspace time zone: {zone.timezone}. Tasks are shared; this is not a
          personal assignment queue.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span>
            {zone.pending
              ? 'Loading the workspace time zone…'
              : 'Workspace time zone is unavailable. Displaying UTC; date editing is paused.'}
          </span>
          {!zone.pending && (
            <Button size="sm" variant="ghost" onClick={() => void zone.retry()}>
              Try again
            </Button>
          )}
        </div>
      )}
      {result.isPending ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface p-10 text-center text-sm text-text-muted"
        >
          Loading workspace follow-ups…
        </p>
      ) : result.error ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-surface p-5">
          <p className="text-sm text-text-secondary">
            Follow-ups could not be updated.
            {rows.length ? ' Previously loaded tasks are shown below.' : ''}
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            onClick={() => void result.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {!result.isPending && !result.error && rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center">
          <ListTodo aria-hidden="true" className="mx-auto h-7 w-7 text-text-muted" />
          <h2 className="mt-3 text-sm font-medium">
            {showAll
              ? 'No follow-ups yet'
              : due
                ? 'No follow-ups for this due date'
                : 'No pending follow-ups'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-text-secondary">
            Add a next action from a lead or conversation. It will appear here and on the mobile
            Tasks screen.
          </p>
          <Button asChild className="mt-4" variant="secondary">
            <Link to="/leads">Choose a lead</Link>
          </Button>
        </div>
      ) : null}
      {rows.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {rows.map((task) => (
            <li key={task.id} className="flex items-start gap-3 p-4">
              <button
                type="button"
                role="checkbox"
                aria-checked={task.done}
                aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.title}`}
                disabled={!canEdit || busy}
                onClick={() => complete.mutate(task)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-text-muted hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
              >
                {task.done ? (
                  <Check aria-hidden="true" className="h-4 w-4 text-success" />
                ) : (
                  <Circle aria-hidden="true" className="h-4 w-4" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'break-words text-sm font-medium',
                    task.done && 'text-text-muted line-through',
                  )}
                >
                  {task.title}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <Link
                    to={`/leads?leadId=${task.leadId}`}
                    className="break-words text-text-secondary underline-offset-4 hover:text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    {task.leadName || 'Open lead'}
                  </Link>
                  <span className={task.overdue ? 'text-warning' : 'text-text-muted'}>
                    {task.done ? 'Completed · ' : ''}
                    {taskDueLabel(task.dueAt, zone.timezone)}
                  </span>
                </div>
              </div>
              {role !== 'viewer' && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit || busy || !zone.ready}
                  onClick={() => setEditing(task)}
                  aria-label={`Edit ${task.title}`}
                  leftIcon={<Pencil aria-hidden="true" className="h-3.5 w-3.5" />}
                >
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {(pages ?? 0) > 1 && (
        <nav aria-label="Task result pages" className="flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            disabled={page <= 1 || result.isFetching}
            onClick={() => setPage(page - 1)}
            leftIcon={<ArrowLeft aria-hidden="true" className="h-4 w-4" />}
          >
            Previous
          </Button>
          <p className="text-xs tabular-nums text-text-muted">
            Page {page} of {pages}
          </p>
          <Button
            variant="secondary"
            disabled={page >= (pages ?? 1) || result.isFetching}
            onClick={() => setPage(page + 1)}
            rightIcon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
          >
            Next
          </Button>
        </nav>
      )}
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !saving) setEditing(null)
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Edit follow-up</DialogTitle>
            <DialogDescription>
              Update its next action and due time in {zone.timezone}.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <TaskEditor
              key={editing.id}
              task={editing}
              timezone={zone.timezone}
              canEdit={canEdit && zone.ready}
              onSaving={setSaving}
              onSaved={() => {
                void refreshTasks()
                setEditing(null)
              }}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TaskEditor({
  task,
  timezone,
  canEdit,
  onSaved,
  onSaving,
  onCancel,
}: {
  task: TeamTaskRow
  timezone: string
  canEdit: boolean
  onSaved: () => void
  onSaving: (saving: boolean) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [initialDueAt] = useState(() => taskDateInput(task.dueAt, timezone))
  const [dueAt, setDueAt] = useState(initialDueAt)
  const [error, setError] = useState('')
  const save = useMutation({
    networkMode: 'always',
    retry: false,
    onMutate: () => onSaving(true),
    onSettled: () => onSaving(false),
    mutationFn: () => {
      if (!canEdit) throw new Error('Reconnect before saving this follow-up.')
      return tasksApi.update(task.leadId, task.id, {
        title: title.trim(),
        ...(dueAt === initialDueAt
          ? {}
          : { dueAt: dueAt ? workspaceWallTimeToUtc(dueAt, timezone) : null }),
      })
    },
    onSuccess: () => {
      toast.success('Follow-up updated')
      onSaved()
    },
    onError: (cause: Error) => setError(cause.message),
  })
  function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    save.mutate()
  }
  return (
    <form onSubmit={submit}>
      <DialogBody className="space-y-4">
        <label className="block text-xs font-medium text-text-secondary">
          Next action
          <input
            autoFocus
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary focus:outline-none focus:ring-2 focus:ring-focus sm:text-sm"
            value={title}
            maxLength={500}
            required
            disabled={save.isPending}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-text-secondary">
          Due date and time
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary focus:outline-none focus:ring-2 focus:ring-focus sm:text-sm"
            type="datetime-local"
            value={dueAt}
            disabled={save.isPending}
            onChange={(event) => setDueAt(event.target.value)}
          />
          <span className="mt-1 block text-xs font-normal text-text-muted">
            {timezone}. Clear this field to remove the due date.
          </span>
        </label>
        {error && (
          <p role="alert" className="text-xs leading-5 text-danger">
            {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel} disabled={save.isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          pending={save.isPending}
          pendingLabel="Saving…"
          disabled={!title.trim() || !canEdit}
        >
          Save follow-up
        </Button>
      </DialogFooter>
    </form>
  )
}
