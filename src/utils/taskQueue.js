import { workspaceTimezone, zonedParts, zonedTimeToUtc } from './workspaceTime.js';

/** Day boundaries use the workspace's calendar, including daylight-saving changes. */
export function taskQueueWhere({ done = false, due, now = new Date(), timezone = workspaceTimezone() } = {}) {
  const where = done ? {} : { done: false };
  if (!due || due === 'all') return where;
  const p = zonedParts(now, timezone);
  const start = zonedTimeToUtc(p.year, p.month, p.day, 0, 0, timezone);
  const end = zonedTimeToUtc(p.year, p.month, p.day + 1, 0, 0, timezone);
  if (due === 'overdue') return { ...where, done: false, dueAt: { lt: now } };
  if (due === 'today') return { ...where, dueAt: { gte: start, lt: end } };
  if (due === 'upcoming') return { ...where, dueAt: { gte: end } };
  if (due === 'unscheduled') return { ...where, dueAt: null };
  throw Object.assign(new Error('Choose a valid due-date filter.'), { statusCode: 400 });
}
