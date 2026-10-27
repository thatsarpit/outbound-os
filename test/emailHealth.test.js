import test from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_SYNC_STALE_AFTER_MS, emailAccountHealth, emailHealthSummary } from '../web/src/lib/email-health.ts';

const now = Date.parse('2026-10-24T00:00:00Z');
const account = { enabled: true, status: 'verified', imapHost: 'imap.example.test', imapUser: 'sales@example.test', hasImapPass: true, lastSyncAt: new Date(now - 60_000).toISOString(), lastError: null };

test('enabled is separate from verified sending and configured receiving', () => {
  assert.equal(emailAccountHealth({ ...account, status: 'pending' }, now).sending, 'unverified');
  assert.equal(emailAccountHealth({ ...account, status: 'error' }, now).sending, 'error');
  assert.equal(emailAccountHealth({ ...account, enabled: false }, now).sending, 'paused');
  assert.equal(emailAccountHealth({ ...account, imapHost: '' }, now).receiving, 'not_configured');
  assert.equal(emailAccountHealth({ ...account, hasImapPass: false }, now).receiving, 'not_configured');
  assert.equal(emailAccountHealth({ ...account, imapUser: ' ' }, now).receiving, 'not_configured');
});

test('old, failed, never-synced and future timestamps cannot appear current', () => {
  assert.equal(emailAccountHealth(account, now).receiving, 'current');
  assert.equal(emailAccountHealth({ ...account, lastSyncAt: new Date(now - EMAIL_SYNC_STALE_AFTER_MS).toISOString() }, now).receiving, 'stale');
  assert.equal(emailAccountHealth({ ...account, lastSyncAt: null }, now).receiving, 'never_synced');
  assert.equal(emailAccountHealth({ ...account, lastSyncAt: 'invalid' }, now).receiving, 'invalid_timestamp');
  assert.equal(emailAccountHealth({ ...account, lastSyncAt: new Date(now + 10 * 60_000).toISOString() }, now).receiving, 'invalid_timestamp');
  assert.equal(emailAccountHealth({ ...account, lastError: 'Authentication failed' }, now).receiving, 'error');
  assert.equal(emailAccountHealth({ ...account, enabled: false, lastError: 'Old error' }, now).receiving, 'paused');
});

test('aggregate reports all mailbox states instead of hiding stale accounts behind one recent sync', () => {
  const old = new Date(now - 30 * 60_000).toISOString();
  const summary = emailHealthSummary([
    account,
    { ...account, lastSyncAt: old },
    { ...account, lastSyncAt: null },
    { ...account, status: 'pending', imapHost: '' },
    { ...account, enabled: false, lastSyncAt: new Date(now).toISOString() },
  ], now);
  assert.deepEqual(summary, { total: 5, enabled: 4, sendingVerified: 3, receivingConfigured: 4, receivingEnabled: 3, receivingCurrent: 1, receivingDirect: 0, receivingStale: 1, receivingUnconfirmed: 1, lastSyncAt: account.lastSyncAt });
  assert.equal(emailHealthSummary([], now).lastSyncAt, null);
  assert.equal(emailHealthSummary([{ ...account, lastSyncAt: old }], now).receivingCurrent, 0);
});


test('Cloudflare configuration is independent of IMAP timestamps and does not claim live delivery health', () => {
  const direct = { ...account, receivingProvider: 'cloudflare', receivingReady: true,
    imapHost: '', lastError: 'Old IMAP error', lastSyncAt: 'invalid' };
  assert.equal(emailAccountHealth(direct, now).receiving, 'direct');
  assert.equal(emailAccountHealth(direct, now).lastSyncAt, null);
  assert.equal(emailAccountHealth({ ...direct, receivingReady: false }, now).receiving, 'error');
  assert.equal(emailAccountHealth({ ...direct, enabled: false }, now).receiving, 'paused');
  const summary = emailHealthSummary([direct], now);
  assert.equal(summary.receivingDirect, 1);
  assert.equal(summary.receivingCurrent, 0);
  assert.equal(summary.lastSyncAt, null);
});
