import { Router } from 'express';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';
import { memberAssignmentWhere } from '../utils/workspaceMember.js';
import { taskQueueWhere } from '../utils/taskQueue.js';

const router = Router();
const positiveId = (value) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
for (const name of ['id', 'taskId', 'noteId']) {
  router.param(name, (req, res, next, value) => {
    if (!positiveId(value)) return res.status(400).json({ error: `Valid ${name} required` });
    next();
  });
}
const handleError = (res, error) => {
  if (error.code === 'P2025' || error.code === 'P2003') return res.status(404).json({ error: 'Item not found for this lead' });
  res.status(500).json({ error: 'Could not complete the lead follow-up request' });
};

// ======================== NOTES ========================
router.get('/leads/:id/notes', async (req, res) => {
  try {
    const notes = await prisma.leadNote.findMany({
      where: { leadId: parseInt(req.params.id) },
      orderBy: { createdAt: 'desc' },
    });
    res.json(notes);
  } catch (e) { handleError(res, e); }
});

router.post('/leads/:id/notes', requireRole('agent'), async (req, res) => {
  try {
    const { content, type = 'note' } = req.body;
    if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'content required' });
    if (!['note', 'call', 'meeting', 'email_manual'].includes(type)) return res.status(400).json({ error: 'Valid note type required' });
    if (content.length > 10000) return res.status(400).json({ error: 'Notes can contain at most 10000 characters' });
    const note = await prisma.leadNote.create({
      data: { leadId: parseInt(req.params.id), content: content.trim(), type },
    });
    res.json(note);
  } catch (e) { handleError(res, e); }
});

router.delete('/leads/:id/notes/:noteId', requireRole('agent'), async (req, res) => {
  try {
    await prisma.leadNote.delete({ where: { id: parseInt(req.params.noteId), leadId: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { handleError(res, e); }
});

// ======================== TASKS ========================
router.get('/leads/:id/tasks', async (req, res) => {
  try {
    const tasks = await prisma.leadTask.findMany({
      where: { leadId: parseInt(req.params.id) },
      orderBy: [{ done: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    res.json(tasks);
  } catch (e) { handleError(res, e); }
});

router.post('/leads/:id/tasks', requireRole('agent'), async (req, res) => {
  try {
    const { title, dueAt } = req.body;
    if (typeof title !== 'string' || !title.trim() || title.length > 500) return res.status(400).json({ error: 'A title of 1–500 characters is required' });
    if (dueAt != null && (typeof dueAt !== 'string' || !dueAt.trim() || Number.isNaN(new Date(dueAt).getTime()))) return res.status(400).json({ error: 'Valid due date required' });
    const task = await prisma.leadTask.create({
      data: { leadId: parseInt(req.params.id), title: title.trim(), dueAt: dueAt ? new Date(dueAt) : null },
    });
    res.json(task);
  } catch (e) { handleError(res, e); }
});

router.patch('/leads/:id/tasks/:taskId', requireRole('agent'), async (req, res) => {
  try {
    const { done, title, dueAt } = req.body;
    const data = {};
    if (done !== undefined && typeof done !== 'boolean') return res.status(400).json({ error: 'done must be a boolean' });
    if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 500)) return res.status(400).json({ error: 'A title of 1–500 characters is required' });
    if (dueAt != null && (typeof dueAt !== 'string' || !dueAt.trim() || Number.isNaN(new Date(dueAt).getTime()))) return res.status(400).json({ error: 'Valid due date required' });
    if (done !== undefined) data.done = done;
    if (title !== undefined) data.title = title.trim();
    if (dueAt !== undefined) data.dueAt = dueAt ? new Date(dueAt) : null;
    const task = await prisma.leadTask.update({ where: { id: parseInt(req.params.taskId), leadId: parseInt(req.params.id) }, data });
    res.json(task);
  } catch (e) { handleError(res, e); }
});

router.delete('/leads/:id/tasks/:taskId', requireRole('agent'), async (req, res) => {
  try {
    await prisma.leadTask.delete({ where: { id: parseInt(req.params.taskId), leadId: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { handleError(res, e); }
});

// Global task list (overdue + upcoming) for sidebar badge
router.get('/tasks', async (req, res) => {
  try {
    const now = new Date();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const showDone = req.query.done === 'true';
    if (req.query.scope && !['mine', 'workspace'].includes(req.query.scope)) return res.status(400).json({ error: 'Choose Mine or Workspace tasks.' });
    const ownership = req.query.scope === 'mine' ? { lead: memberAssignmentWhere(req.user) } : {};
    const where = { AND: [taskQueueWhere({ done: showDone, due: req.query.due, now }), ownership] };
    const [tasks, total, overdueCount, pendingCount] = await Promise.all([
      prisma.leadTask.findMany({ where, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
      prisma.leadTask.count({ where }),
      prisma.leadTask.count({ where: { AND: [{ done: false, dueAt: { lt: now } }, ownership] } }),
      prisma.leadTask.count({ where: { AND: [{ done: false }, ownership] } }),
    ]);
    // Attach lead name
    const leadIds = [...new Set(tasks.map((t) => t.leadId))];
    const leads = await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } });
    const leadMap = Object.fromEntries(leads.map((l) => [l.id, l.name]));
    const enriched = tasks.map((t) => ({ ...t, leadName: leadMap[t.leadId] || '—', overdue: !t.done && Boolean(t.dueAt && t.dueAt < now) }));
    res.json({ tasks: enriched, overdueCount, pendingCount, total, page, pages: Math.ceil(total / limit) });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    handleError(res, e);
  }
});


export default router;
