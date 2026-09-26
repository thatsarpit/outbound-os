import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Building2,
  Check,
  ExternalLink,
  Mail,
  MapPin,
  Package,
  Phone,
  Plus,
  Trash2,
  User,
} from 'lucide-react'
import { leadsApi } from '@/api/endpoints/leads'
import { notesApi, type LeadNoteType } from '@/api/endpoints/notes'
import { tasksApi } from '@/api/endpoints/tasks'
import type { InboxThreadDetail, LeadTier } from '@/api/types'
import { Button } from '@/components/ui/button'
import { toast } from '@/stores/toast-store'
import { cn, formatRelativeTime } from '@/lib/utils'

/**
 * Lead context for the open conversation — the inbox's third pane.
 *
 * Replying well needs to know who this is, what they asked for last time and
 * what was promised. Without this the only way to get that was to leave the
 * inbox for the Leads page and lose the thread.
 *
 * It is also where two fully-built but previously unreachable APIs finally
 * surface: `notesApi` (LeadNote) and `tasksApi` (LeadTask) shipped with the
 * app and were imported by nothing.
 */

const TIER_STYLES: Record<LeadTier, string> = {
  HOT: 'text-hot',
  WARM: 'text-warm',
  COLD: 'text-cold',
}

const NOTE_TYPES: Array<{ value: LeadNoteType; label: string }> = [
  { value: 'note', label: 'Note' },
  { value: 'call', label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'email_manual', label: 'Email' },
]

function Row({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[12px]">
      <Icon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
      <span className="min-w-0 flex-1 break-words text-text-secondary">{children}</span>
    </div>
  )
}

function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
      {children}
      {count !== undefined && count > 0 && <span className="tabular-nums">{count}</span>}
    </p>
  )
}

export function LeadContextPanel({
  thread,
  className,
}: {
  thread: InboxThreadDetail
  className?: string
}) {
  const leadId = thread.leadId
  const queryClient = useQueryClient()
  const [noteDraft, setNoteDraft] = useState('')
  const [noteType, setNoteType] = useState<LeadNoteType>('note')
  const [taskDraft, setTaskDraft] = useState('')

  const { data: lead } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => leadsApi.getLead(leadId),
    staleTime: 60_000,
  })

  const { data: notes = [] } = useQuery({
    queryKey: ['lead-notes', leadId],
    queryFn: async () => {
      const res = await notesApi.list(leadId)
      return Array.isArray(res) ? res : []
    },
  })

  const { data: tasks = [] } = useQuery({
    queryKey: ['lead-tasks', leadId],
    queryFn: async () => {
      const res = await tasksApi.list(leadId)
      return Array.isArray(res) ? res : []
    },
  })

  const invalidate = (key: string) => queryClient.invalidateQueries({ queryKey: [key, leadId] })

  const addNote = useMutation({
    mutationFn: () => notesApi.create(leadId, { content: noteDraft.trim(), type: noteType }),
    onSuccess: () => {
      setNoteDraft('')
      invalidate('lead-notes')
    },
  })

  const removeNote = useMutation({
    mutationFn: (id: number) => notesApi.remove(leadId, id),
    onSuccess: () => invalidate('lead-notes'),
  })

  const addTask = useMutation({
    mutationFn: () => tasksApi.create(leadId, { title: taskDraft.trim() }),
    onSuccess: () => {
      setTaskDraft('')
      invalidate('lead-tasks')
    },
  })

  const toggleTask = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      tasksApi.update(leadId, id, { done }),
    onSuccess: () => invalidate('lead-tasks'),
  })

  const openTasks = tasks.filter((t) => !t.done)
  const doneTasks = tasks.filter((t) => t.done)
  const tier = lead?.leadTier ?? null

  return (
    <aside
      className={cn(
        // Appears from 1400px, not xl (1280). At 1280 three panes leave the
        // conversation about 330px and the composer starts wrapping; the
        // conversation needs the width more than the context does.
        'hidden w-72 shrink-0 flex-col overflow-y-auto rounded-lg border border-border bg-surface min-[1400px]:flex',
        className,
      )}
    >
      {/* Identity */}
      <div className="border-b border-border px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">
              {thread.leadName || thread.name}
            </p>
            {thread.leadCompany && (
              <p className="mt-0.5 truncate text-[12px] text-text-secondary">
                {thread.leadCompany}
              </p>
            )}
          </div>
          <Link
            to={`/leads?leadId=${leadId}`}
            title="Open in Leads"
            className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {tier && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px] font-medium',
                TIER_STYLES[tier],
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {tier.charAt(0) + tier.slice(1).toLowerCase()}
            </span>
          )}
          {lead?.status && (
            <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] capitalize text-text-secondary">
              {lead.status.replace(/_/g, ' ')}
            </span>
          )}
          {typeof lead?.score === 'number' && (
            <span className="text-[11px] tabular-nums text-text-muted">Score {lead.score}</span>
          )}
        </div>
      </div>

      {/* Contact + commercial detail */}
      <div className="space-y-2 border-b border-border px-4 py-3.5">
        {thread.leadMobile && (
          <Row icon={Phone}>
            <a href={`tel:${thread.leadMobile}`} className="hover:text-text-primary">
              {thread.leadMobile}
            </a>
          </Row>
        )}
        {thread.leadEmail && (
          <Row icon={Mail}>
            <a href={`mailto:${thread.leadEmail}`} className="hover:text-text-primary">
              {thread.leadEmail}
            </a>
          </Row>
        )}
        {lead?.country && <Row icon={MapPin}>{lead.country}</Row>}
        {lead?.product && (
          <Row icon={Package}>
            {lead.product}
            {lead.quantity ? ` · ${lead.quantity}` : ''}
          </Row>
        )}
        {lead?.company && !thread.leadCompany && <Row icon={Building2}>{lead.company}</Row>}
        <Row icon={User}>{lead?.assignedTo?.name || 'Unassigned'}</Row>
      </div>

      {/* Tasks */}
      <div className="space-y-2 border-b border-border px-4 py-3.5">
        <SectionLabel count={openTasks.length}>Tasks</SectionLabel>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!taskDraft.trim() || addTask.isPending) return
            addTask.mutate()
          }}
          className="flex items-center gap-1"
        >
          <input
            value={taskDraft}
            onChange={(e) => setTaskDraft(e.target.value)}
            placeholder="Add a follow-up"
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-[12px] placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted"
          />
          <button
            type="submit"
            aria-label="Add task"
            disabled={!taskDraft.trim() || addTask.isPending}
            className="shrink-0 rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </form>

        {tasks.length === 0 ? (
          <p className="text-[11px] text-text-muted">Nothing scheduled.</p>
        ) : (
          <ul className="space-y-1">
            {[...openTasks, ...doneTasks].map((task) => (
              <li key={task.id} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => toggleTask.mutate({ id: task.id, done: !task.done })}
                  aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
                  className={cn(
                    'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors',
                    task.done
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-border-strong hover:border-accent',
                  )}
                >
                  {task.done && <Check className="h-2.5 w-2.5" />}
                </button>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block break-words text-[12px]',
                      task.done ? 'text-text-muted line-through' : 'text-text-secondary',
                    )}
                  >
                    {task.title}
                  </span>
                  {task.dueAt && (
                    <span className="text-[10px] text-text-muted">
                      Due {formatRelativeTime(task.dueAt)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-2 px-4 py-3.5">
        <SectionLabel count={notes.length}>Notes</SectionLabel>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!noteDraft.trim() || addNote.isPending) return
            addNote.mutate()
          }}
          className="space-y-1.5"
        >
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            placeholder="What was agreed?"
            className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted"
          />
          <div className="flex items-center gap-1">
            <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-hide">
              {NOTE_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setNoteType(t.value)}
                  aria-pressed={noteType === t.value}
                  className={cn(
                    'shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] transition-colors',
                    noteType === t.value
                      ? 'bg-surface-raised font-medium text-text-primary'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={!noteDraft.trim()}
              pending={addNote.isPending}
              className="h-7 shrink-0 px-2 text-[11px]"
            >
              Save
            </Button>
          </div>
        </form>

        {notes.length === 0 ? (
          <p className="text-[11px] text-text-muted">No notes yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {notes.map((note) => (
              <li key={note.id} className="group">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    {note.type.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {formatRelativeTime(note.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (removeNote.isPending) return
                      removeNote.mutate(note.id, {
                        onError: () => toast.error('Could not delete note'),
                      })
                    }}
                    aria-label="Delete note"
                    className="ml-auto rounded-sm p-0.5 text-text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-5 text-text-secondary">
                  {note.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
