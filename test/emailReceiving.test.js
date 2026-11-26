import test from 'node:test';
import assert from 'node:assert/strict';
import { usesCloudflareReceiving, emailReceivingStatus, inboxEmailHealth } from '../src/utils/emailReceiving.js';

test('only explicitly migrated addresses skip IMAP, even while ingress is temporarily unavailable', () => {
  const env = { EMAIL_CLOUDFLARE_ACCOUNTS: ' Sales@Example.test, other@example.test ' };
  assert.equal(usesCloudflareReceiving({ email: 'sales@example.test' }, env), true);
  for (const email of ['', 'sale@example.test', 'someone@sub.example.test']) {
    assert.equal(usesCloudflareReceiving({ email }, env), false);
  }
  assert.deepEqual(emailReceivingStatus({ email: 'sales@example.test' }, env), {
    receivingProvider: 'cloudflare', receivingReady: false,
  });
  assert.deepEqual(emailReceivingStatus({ email: 'sales@example.test' }, {
    ...env, EMAIL_INGRESS_ENABLED: 'true', EMAIL_INGRESS_SECRET: 's'.repeat(32),
  }), { receivingProvider: 'cloudflare', receivingReady: true });
  assert.equal(emailReceivingStatus({ imapHost: 'imap.example.test' }, env).receivingProvider, 'imap');
  assert.equal(emailReceivingStatus({}, env).receivingProvider, 'none');
});

test('saved IMAP settings cannot make a Cloudflare inbox appear healthy', () => {
  const now = Date.now();
  const account = { id: 1, email: 'sales@example.test', enabled: true, status: 'verified', imapHost: 'imap.example.test', lastSyncAt: new Date(now) };
  const env = { EMAIL_CLOUDFLARE_ACCOUNTS: account.email, EMAIL_INGRESS_ENABLED: 'true', EMAIL_INGRESS_SECRET: 's'.repeat(32) };
  assert.equal(inboxEmailHealth([account], new Map(), { now, env }).inbound, 0);
  const health = inboxEmailHealth([account], new Map([[1, { lastCloudflareReceiptAt: new Date(now) }]]), { now, env });
  assert.equal(health.status, 'limited');
  assert.equal(health.inbound, 1);
  assert.match(health.detail, /have received mail/);
  assert.equal(inboxEmailHealth([account], new Map(), { now, env: {} }).status, 'ready');
  assert.equal(inboxEmailHealth([{ ...account, lastReceivingError: 'Connection failed' }], new Map(), { now, env: {} }).inbound, 0);
});
