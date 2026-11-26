import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { registerTriageTools } from '../src/tools/triage.js';

const tools = new Map();
registerTriageTools({ tool(name, _description, schema, _annotations, handler) {
  tools.set(name, { schema: z.object(schema), handler });
} });
const invoke = (name, args = {}) => {
  const { handler, schema } = tools.get(name);
  return handler(schema.parse(args));
};
const payload = result => JSON.parse(result.content[0].text);

test('inbox triage uses the existing queue filters and returns an explicit bounded summary', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ pathname: url.pathname, query: Object.fromEntries(url.searchParams), method: options.method });
    return Response.json({
      page: 2, pages: 3, total: 5, counts: { all: 8, needsReply: 5, waiting: 2, resolved: 1 }, unread: 0,
      threads: [
        {
          leadId: 11, leadName: 'Prospect fixture', leadCompany: 'Synthetic company',
          channel: 'email', outreachChannels: ['whatsapp', 'email'], unread: false, replyNeeded: true,
          lastMessagePreview: 'x'.repeat(500), lastMessage: 'Unprojected message', leadEmail: 'private-fixture@example.test',
          leadMobile: 'private-fixture-phone', assignedMember: { name: 'Synthetic owner', externalId: 'private-fixture-member' },
        },
        { leadId: 12, channel: 'telegram' },
      ],
    });
  });
  const args = { state: 'needs_reply', channel: 'email', assignment: 'unassigned', search: '  Prospect  ', page: 2, limit: 2 };
  const result = payload(await invoke('list_inbox_threads', args));
  assert.deepEqual(calls[0], {
    pathname: '/api/inbox/threads', query: {
      state: 'needs_reply', channel: 'email', search: 'Prospect', page: '2', limit: '2', assigned: 'false',
    }, method: 'GET',
  });
  assert.equal(result.total, 5);
  assert.equal(result.pages, 3);
  assert.equal(result.counts.needsReply, 5);
  assert.equal(result.counts.unread, null, 'legacy credentials have no personal read state');
  assert.equal(result.threads[0].unread, null);
  assert.equal(result.threads[0].latestChannel, 'email');
  assert.deepEqual(result.threads[0].outreachChannels, ['whatsapp', 'email']);
  assert.equal(result.threads[0].assigneeName, 'Synthetic owner');
  assert.equal(result.threads[1].outreachChannels, null, 'a staggered API deploy does not guess outreach history');
  assert.equal(Object.hasOwn(result.threads[0], 'preview'), false);
  assert.equal(Object.hasOwn(result.threads[0], 'lastMessage'), false);
  assert.equal(JSON.stringify(result).includes('private-fixture'), false);
  assert.equal(payload(await invoke('list_inbox_threads', { ...args, include_preview: true })).threads[0].preview.length, 240);
  assert.throws(() => invoke('list_inbox_threads', { limit: 51 }), /Too big/);
});

test('follow-up triage keeps workspace dates, pagination and explicit data projection', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.pathname, '/api/tasks');
    assert.deepEqual(Object.fromEntries(url.searchParams), { due: 'today', scope: 'workspace', page: '1', limit: '20' });
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    return Response.json({ page: 1, pages: 1, total: 1, overdueCount: 2, pendingCount: 5, tasks: [
      { id: 10, leadId: 11, leadName: 'Fixture', title: 'Call back', dueAt: '2027-03-10T16:00:00.000Z', overdue: false, tenantId: 77 },
    ] });
  });
  assert.deepEqual(payload(await invoke('list_follow_up_tasks', { due: 'today' })), {
    page: 1, pages: 1, total: 1, overdueCount: 2, pendingCount: 5, tasks: [
      { taskId: 10, leadId: 11, leadName: 'Fixture', title: 'Call back', dueAt: '2027-03-10T16:00:00.000Z', overdue: false },
    ],
  });
});

test('legacy Mine calls fail before HTTP and malformed API responses do not imply an empty queue', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({}));
  assert.equal((await invoke('list_inbox_threads', { assignment: 'mine' })).isError, true);
  assert.equal((await invoke('list_follow_up_tasks', { scope: 'mine' })).isError, true);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal((await invoke('list_inbox_threads')).isError, true);
  assert.equal((await invoke('list_follow_up_tasks')).isError, true);
});
