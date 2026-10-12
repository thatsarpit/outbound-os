import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { saveDraft, loadDraft, clearDraft, clearSessionDrafts, clearSubmittedDraft } from '../web/src/lib/email-drafts.ts';

beforeEach(() => {
  const values = {};
  globalThis.localStorage = new Proxy({
    getItem: key => values[key] ?? null,
    setItem: (key, value) => { values[key] = String(value); },
    removeItem: key => { delete values[key]; },
  }, { ownKeys: () => Object.keys(values), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
});
const draft = (channel = 'email', senderAccountId = 1) => ({ subject: 'Re: enquiry', plainBody: 'A saved reply', htmlBody: '<p>A saved reply</p>', channel, senderAccountId, cc: '', bcc: '' });

test('drafts isolate users, workspaces, leads, channels and sender accounts', () => {
  saveDraft('org-a:user-a', 1, draft());
  saveDraft('org-a:user-a', 1, { ...draft('whatsapp', null), plainBody: 'WhatsApp reply' });
  saveDraft('org-a:user-a', 1, { ...draft('email', 2), plainBody: 'Second sender' });
  assert.equal(loadDraft('org-a:user-a', 1, 'email', 1).plainBody, 'A saved reply');
  assert.equal(loadDraft('org-a:user-a', 1, 'whatsapp').plainBody, 'WhatsApp reply');
  assert.equal(loadDraft('org-a:user-a', 1).plainBody, 'Second sender');
  assert.equal(loadDraft('org-a:user-b', 1), null);
  assert.equal(loadDraft('org-b:user-a', 1), null);
  assert.equal(loadDraft('org-a:user-a', 2), null);
  clearDraft('org-a:user-a', 1, 'email', 2);
  assert.equal(loadDraft('org-a:user-a', 1, 'email', 2), null);
  assert.ok(loadDraft('org-a:user-a', 1, 'email', 1));
});

test('sign-out clears only this session drafts and legacy unscoped drafts', () => {
  saveDraft('a', 1, draft()); saveDraft('b', 1, draft());
  localStorage.setItem('oos_draft_1', JSON.stringify(draft()));
  assert.equal(loadDraft('c', 1), null);
  clearSessionDrafts('a');
  assert.equal(loadDraft('a', 1), null);
  assert.ok(loadDraft('b', 1));
  assert.equal(localStorage.getItem('oos_draft_1'), null);
});

test('expired, corrupted and storage-denied drafts fail safely', () => {
  saveDraft('a', 1, draft());
  const key = Object.keys(localStorage).find(key => key.endsWith('email:1'));
  localStorage.setItem(key, JSON.stringify({ ...draft(), savedAt: Date.now() - 8 * 86400_000 }));
  assert.equal(loadDraft('a', 1), null);
  localStorage.setItem(key, 'invalid json');
  assert.equal(loadDraft('a', 1, 'email', 1), null);
  globalThis.localStorage = { setItem() { throw new Error('Storage denied'); }, getItem() { throw new Error('Storage denied'); } };
  assert.equal(saveDraft('a', 1, draft()), false);
  assert.equal(loadDraft('a', 1), null);
  assert.doesNotThrow(() => clearSessionDrafts('a'));
});


test('a slow send clears only its submitted draft revision', () => {
  saveDraft('a', 1, draft());
  const submitted = loadDraft('a', 1, 'email', 1);
  saveDraft('a', 1, { ...draft(), plainBody: 'New draft after reopening' });
  clearSubmittedDraft('a', 1, submitted);
  assert.equal(loadDraft('a', 1, 'email', 1).plainBody, 'New draft after reopening');
  const latest = loadDraft('a', 1, 'email', 1);
  clearSubmittedDraft('a', 1, latest);
  assert.equal(loadDraft('a', 1, 'email', 1), null);
});

test('mobile follow-ups use workspace time, including DST and half-hour offsets', async () => {
  const { workspaceWallTimeToUtc } = await import('../web/src/lib/mobile-workspace-time.ts');
  assert.equal(workspaceWallTimeToUtc('2026-10-14T11:30', 'Asia/Kolkata'), '2026-10-14T06:00:00.000Z');
  assert.equal(workspaceWallTimeToUtc('2026-07-14T11:30', 'Europe/London'), '2026-07-14T10:30:00.000Z');
  assert.equal(workspaceWallTimeToUtc('2026-12-14T11:30', 'Europe/London'), '2026-12-14T11:30:00.000Z');
  assert.throws(() => workspaceWallTimeToUtc('2026-03-29T01:30', 'Europe/London'), /clock change/);
  assert.throws(() => workspaceWallTimeToUtc('2026-10-25T01:30', 'Europe/London'), /clock change/);
});

test('login cache discards previous account data and role permissions but survives token refresh', async () => {
  const { bindSessionCache } = await import('../web/src/lib/session-cache.ts');
  let listener;
  let unsubscribed = false;
  const data = new Map([['leads', ['private contact']]]);
  let clears = 0;
  const unbind = bindSessionCache({ subscribe(fn) { listener = fn; return () => { unsubscribed = true; }; } }, { clear() { data.clear(); clears++; } });
  const a = { dashboardScope: 'clerk:workspace-a:user-a', user: { role: 'admin' } };
  listener({ ...a }, a);
  assert.equal(data.size, 1, 'token refresh keeps the same session cache');
  listener({ ...a, user: { role: 'viewer' } }, a);
  assert.equal(data.size, 0, 'a role downgrade clears previously privileged data');
  listener({ ...a, dashboardScope: 'clerk:workspace-b:user-a' }, a);
  listener({ ...a, dashboardScope: 'clerk:workspace-a:user-b' }, a);
  listener({ dashboardScope: 'signed-out', user: null }, a);
  assert.equal(clears, 4);
  unbind();
  assert.equal(unsubscribed, true);
});

test('login resumes the selected conversation but rejects external redirect paths', async () => {
  const { loginReturnPath } = await import('../web/src/lib/login-return.ts');
  assert.equal(loginReturnPath({ pathname: '/m/inbox', search: '?leadId=12&channel=email' }), '/m/inbox?leadId=12&channel=email');
  for (const pathname of ['//example.test', '/\\example.test', 'https://example.test', '/login', '/\t/example.test', '']) assert.equal(loginReturnPath({ pathname }), null);
  assert.equal(loginReturnPath({ pathname: '/m/tasks', search: 'https://example.test' }), '/m/tasks');
});
