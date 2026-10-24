import type { Lead, LeadNote, LeadTask } from '@/api/types'
import { taskDateInput } from '@/lib/task-date'

// Interactive preview data stays in memory and never contacts a CRM server.
const tasks: LeadTask[] = [
  {
    id: 9101,
    leadId: 1,
    title: 'Send updated quotation',
    dueAt: new Date(Date.now() - 3_600_000).toISOString(),
    done: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 9102,
    leadId: 2,
    title: 'Confirm delivery requirements',
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    done: false,
    createdAt: new Date().toISOString(),
  },
]
const notes: LeadNote[] = [
  {
    id: 9201,
    leadId: 1,
    type: 'call',
    content: 'Asked for a quotation and delivery options. Follow up after the proposal.',
    createdAt: new Date().toISOString(),
  },
]
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
let nextId = 9300

export function handleMobileSalesRequest(
  url: string,
  init: RequestInit | undefined,
  leads: Array<
    Pick<Lead, 'id' | 'name'> & Partial<Pick<Lead, 'assignedToId' | 'assignedMemberKey'>>
  >,
): Response | null {
  const path = new URL(url, location.origin)
  const method = (init?.method || 'GET').toUpperCase()
  const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {}
  if (path.pathname === '/api/tasks') {
    const scoped =
      path.searchParams.get('scope') === 'mine'
        ? tasks.filter((task) => {
            const lead = leads.find((row) => row.id === task.leadId)
            return (
              lead?.assignedMemberKey === 'local:local:1' ||
              (!lead?.assignedMemberKey && lead?.assignedToId === 1)
            )
          })
        : tasks
    const pending = scoped.filter((task) => !task.done)
    const due = path.searchParams.get('due')
    const now = new Date()
    const today = taskDateInput(now.toISOString(), 'Europe/London').slice(0, 10)
    const selected = (path.searchParams.get('done') === 'true' ? scoped : pending)
      .filter((task) => {
        if (!due) return true
        if (due === 'unscheduled') return !task.dueAt
        if (!task.dueAt) return false
        if (due === 'overdue') return !task.done && new Date(task.dueAt) < now
        const day = taskDateInput(task.dueAt, 'Europe/London').slice(0, 10)
        return due === 'today' ? day === today : due === 'upcoming' ? day > today : false
      })
      .sort(
        (a, b) =>
          (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) -
            (b.dueAt ? new Date(b.dueAt).getTime() : Infinity) || a.id - b.id,
      )
    const page = Math.max(1, Number(path.searchParams.get('page')) || 1)
    const limit = Math.max(1, Number(path.searchParams.get('limit')) || 50)
    return json({
      tasks: selected.slice((page - 1) * limit, page * limit).map((task) => ({
        ...task,
        leadName: leads.find((lead) => lead.id === task.leadId)?.name || 'Sample lead',
        overdue: !task.done && !!task.dueAt && new Date(task.dueAt).getTime() < Date.now(),
      })),
      total: selected.length,
      pendingCount: pending.length,
      page,
      pages: Math.ceil(selected.length / limit),
      overdueCount: pending.filter(
        (task) => task.dueAt && new Date(task.dueAt).getTime() < Date.now(),
      ).length,
    })
  }
  const match = path.pathname.match(/^\/api\/leads\/(\d+)\/(tasks|notes)(?:\/(\d+))?$/)
  if (!match) return null
  const leadId = Number(match[1])
  const id = Number(match[3])
  if (match[2] === 'notes') {
    if (method === 'GET') return json(notes.filter((note) => note.leadId === leadId))
    if (method === 'POST') {
      const note: LeadNote = {
        id: nextId++,
        leadId,
        type: body.type || 'note',
        content: String(body.content || ''),
        createdAt: new Date().toISOString(),
      }
      notes.unshift(note)
      return json(note)
    }
    return json({ error: 'Use the dashboard to manage this sample note.' }, 403)
  }
  if (method === 'GET') return json(tasks.filter((task) => task.leadId === leadId))
  if (method === 'POST') {
    const task: LeadTask = {
      id: nextId++,
      leadId,
      title: String(body.title || ''),
      dueAt: body.dueAt || null,
      done: false,
      createdAt: new Date().toISOString(),
    }
    tasks.push(task)
    return json(task)
  }
  if (method === 'PATCH') {
    const task = tasks.find((task) => task.id === id && task.leadId === leadId)
    if (!task) return json({ error: 'Task not found' }, 404)
    Object.assign(task, body)
    return json(task)
  }
  return json({ error: 'Unsupported preview action' }, 403)
}
