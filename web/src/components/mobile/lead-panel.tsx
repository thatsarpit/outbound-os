import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, Mail, MessageSquare, Phone, Plus } from 'lucide-react'
import { leadsApi } from '@/api/endpoints/leads'
import { notesApi } from '@/api/endpoints/notes'
import { tasksApi } from '@/api/endpoints/tasks'
import { workspaceWallTimeToUtc } from '@/lib/mobile-workspace-time'
import { useWorkspaceTimezone } from '@/hooks/use-workspace-timezone'
import { useAuthStore } from '@/stores/auth-store'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { toast } from '@/stores/toast-store'
import { LeadAssignment } from '@/components/inbox/lead-assignment'
import { MobileError, mobileButton, mobileInput, mobileDueDate } from './mobile-shared'

export function MobileLeadPanel({
  leadId,
  showConversation = true,
}: {
  leadId: number
  showConversation?: boolean
}) {
  const client = useQueryClient()
  const { dashboardScope, user } = useAuthStore()
  const online = useOnlineStatus()
  const {
    timezone,
    ready: timezoneReady,
    pending: timezonePending,
    retry: retryTimezone,
  } = useWorkspaceTimezone()
  const canEdit = user?.role !== 'viewer' && online
  const [note, setNote] = useState('')
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const lead = useQuery({
    refetchOnWindowFocus: true,
    queryKey: ['lead', leadId, dashboardScope],
    queryFn: () => leadsApi.getLead(leadId),
  })
  const notes = useQuery({
    refetchOnWindowFocus: true,
    queryKey: ['lead-notes', leadId, dashboardScope],
    queryFn: () => notesApi.list(leadId),
  })
  const tasks = useQuery({
    refetchOnWindowFocus: true,
    queryKey: ['lead-tasks', leadId, dashboardScope],
    queryFn: () => tasksApi.list(leadId),
  })
  const error = (err: Error) => toast.error(err.message)
  const addNote = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: () => notesApi.create(leadId, { content: note.trim(), type: 'note' }),
    onSuccess: () => {
      setNote('')
      client.invalidateQueries({ queryKey: ['lead-notes', leadId] })
      toast.success('Note saved')
    },
    onError: error,
  })
  const addTask = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: (data: { title: string; dueAt: string | null }) =>
      tasksApi.create(leadId, {
        ...data,
        dueAt: data.dueAt ? workspaceWallTimeToUtc(data.dueAt, timezone) : null,
      }),
    onSuccess: () => {
      setTitle('')
      setDueAt('')
      client.invalidateQueries({ queryKey: ['lead-tasks', leadId] })
      client.invalidateQueries({ queryKey: ['mobile-tasks'] })
      toast.success('Follow-up added')
    },
    onError: error,
  })
  const toggle = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      tasksApi.update(leadId, id, { done }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['lead-tasks', leadId] })
      client.invalidateQueries({ queryKey: ['mobile-tasks'] })
    },
    onError: error,
  })
  if (lead.isPending)
    return (
      <p role="status" className="p-4 text-sm text-text-muted">
        Loading lead…
      </p>
    )
  if (lead.error || !lead.data)
    return <MobileError message="Could not load this lead." retry={() => lead.refetch()} />
  const data = lead.data
  const phone = data.mobile && /^\+?[\d\s()-]{7,20}$/.test(data.mobile) ? data.mobile : null
  const taskRows = Array.isArray(tasks.data) ? tasks.data : []
  const noteRows = Array.isArray(notes.data) ? notes.data : []
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">{data.name || 'Unnamed lead'}</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {[data.company, data.country].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-2 text-xs capitalize text-text-muted">
          {data.status.replace(/_/g, ' ')}
          {data.leadTier ? ` · ${data.leadTier.toLowerCase()}` : ''}
        </p>
        {data.product && (
          <p className="mt-3 text-sm text-text-secondary">
            {data.product}
            {data.quantity ? ` · ${data.quantity}` : ''}
          </p>
        )}
        {data.email && <p className="mt-3 break-all text-sm text-text-secondary">{data.email}</p>}
        {phone && <p className="mt-1 text-sm text-text-secondary">{phone}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {showConversation && (
            <Link to={`/m/inbox?leadId=${leadId}`} className={mobileButton}>
              <MessageSquare className="h-4 w-4" />
              Conversation
            </Link>
          )}
          {phone && (
            <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={mobileButton}>
              <Phone className="h-4 w-4" />
              Call
            </a>
          )}
          {data.email && (
            <a href={`mailto:${data.email}`} className={mobileButton}>
              <Mail className="h-4 w-4" />
              Mail app
            </a>
          )}
        </div>
      </section>
      <section className="rounded-xl border border-border bg-surface p-4">
        <LeadAssignment
          leadId={leadId}
          member={data.assignedMember}
          legacyId={data.assignedToId}
          legacyName={data.assignedTo?.name}
        />
      </section>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="font-semibold">Follow-ups</h3>
        {tasks.isPending ? (
          <p className="mt-3 text-sm text-text-muted">Loading follow-ups…</p>
        ) : tasks.error ? (
          <MobileError message="Could not load follow-ups." retry={() => tasks.refetch()} />
        ) : taskRows.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">No follow-ups yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {taskRows.map((task) => (
              <li key={task.id} className="flex items-start gap-2 py-2">
                <button
                  type="button"
                  aria-label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`}
                  disabled={!canEdit || toggle.isPending}
                  onClick={() => toggle.mutate({ id: task.id, done: !task.done })}
                  className={`${mobileButton} w-11 shrink-0 px-0 ${task.done ? 'text-accent' : 'text-text-muted'}`}
                >
                  <Check className="h-5 w-5" />
                </button>
                <div className="min-w-0 py-1">
                  <p
                    className={`break-words text-sm ${task.done ? 'line-through text-text-muted' : ''}`}
                  >
                    {task.title}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {mobileDueDate(task.dueAt, timezone)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {user?.role !== 'viewer' && (
          <form
            className="mt-4 space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              const taskTitle = String(form.get('title') || '').trim()
              const due = String(form.get('dueAt') || '')
              if (taskTitle && canEdit)
                addTask.mutate({
                  title: taskTitle,
                  dueAt: due || null,
                })
            }}
          >
            <label className="block text-xs text-text-secondary" htmlFor="followup-title">
              New follow-up
            </label>
            <input
              id="followup-title"
              name="title"
              className={mobileInput}
              value={title}
              maxLength={500}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs to happen?"
              disabled={addTask.isPending || !timezoneReady}
              required
            />
            <label className="block text-xs text-text-secondary" htmlFor="followup-date">
              Due date ·{' '}
              {timezoneReady
                ? timezone
                : timezonePending
                  ? 'loading workspace time zone…'
                  : 'workspace time zone unavailable'}
            </label>
            {!timezoneReady && !timezonePending && (
              <button type="button" className={mobileButton} onClick={() => retryTimezone()}>
                Reload workspace time zone
              </button>
            )}
            <input
              id="followup-date"
              name="dueAt"
              type="datetime-local"
              className={mobileInput}
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              disabled={addTask.isPending || !timezoneReady}
            />
            <button
              className={`${mobileButton} w-full`}
              disabled={!canEdit || !title.trim() || addTask.isPending || !timezoneReady}
            >
              <Plus className="h-4 w-4" />
              {addTask.isPending ? 'Adding…' : 'Add follow-up'}
            </button>
          </form>
        )}
      </section>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="font-semibold">Notes</h3>
        {notes.isPending ? (
          <p className="mt-3 text-sm text-text-muted">Loading notes…</p>
        ) : notes.error ? (
          <MobileError message="Could not load notes." retry={() => notes.refetch()} />
        ) : noteRows.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">No notes yet.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {noteRows.map((item) => (
              <li key={item.id}>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.content}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {item.type.replace(/_/g, ' ')} · {mobileDueDate(item.createdAt, timezone)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {user?.role !== 'viewer' && (
          <form
            className="mt-4 space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (note.trim() && canEdit) addNote.mutate()
            }}
          >
            <label className="block text-xs text-text-secondary" htmlFor="lead-note">
              Add a note
            </label>
            <textarea
              id="lead-note"
              rows={3}
              className={mobileInput}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What was agreed?"
              disabled={addNote.isPending}
              required
            />
            <button
              className={`${mobileButton} w-full`}
              disabled={!canEdit || !note.trim() || addNote.isPending}
            >
              {addNote.isPending ? 'Saving…' : 'Save note'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
