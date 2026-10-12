import type { Lead, LeadNote, LeadTask } from '@/api/types'

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
  leads: Pick<Lead, 'id' | 'name'>[],
): Response | null {
  const path = new URL(url, location.origin)
  const method = (init?.method || 'GET').toUpperCase()
  const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {}
  if (path.pathname === '/api/tasks') {
    const pending = tasks.filter((task) => !task.done)
    const selected = path.searchParams.get('done') === 'true' ? tasks : pending
    const page = Math.max(1, Number(path.searchParams.get('page')) || 1)
    const limit = Math.max(1, Number(path.searchParams.get('limit')) || 50)
    return json({
      tasks: selected.slice((page - 1) * limit, page * limit).map((task) => ({
        ...task,
        leadName: leads.find((lead) => lead.id === task.leadId)?.name || 'Sample lead',
        overdue: !task.done && !!task.dueAt && new Date(task.dueAt).getTime() < Date.now(),
      })),
      total: selected.length,
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
