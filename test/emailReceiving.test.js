import test from 'node:test';
import assert from 'node:assert/strict';
import { usesCloudflareReceiving, emailReceivingStatus } from '../src/utils/emailReceiving.js';

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
