import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { validatePushSubscription, encryptPushSubscription, decryptPushSubscription, endpointHash } from '../src/utils/pushSubscription.js';
const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
const valid = { endpoint: 'https://web.push.apple.com/fixture-endpoint', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 7).toString('base64url') } };
test('push subscriptions accept browser providers and reject arbitrary network destinations', () => {
  assert.equal(validatePushSubscription(valid).endpoint, valid.endpoint);
  for (const endpoint of ['https://127.0.0.1/test', 'http://web.push.apple.com/test', 'https://web.push.apple.com.attacker.test/test', 'https://user:password@web.push.apple.com/test', 'https://web.push.apple.com:444/test', 'https://169.254.169.254/latest/meta-data/']) {
    assert.throws(() => validatePushSubscription({ ...valid, endpoint }));
  }
  assert.throws(() => validatePushSubscription({ ...valid, keys: { auth: 'short', p256dh: 'bad' } }));
});
test('push endpoint credentials are encrypted with authentication and hashed separately', () => {
  const old = process.env.LEAD_SYNC_ENCRYPTION_KEY;
  process.env.LEAD_SYNC_ENCRYPTION_KEY = 'fixture-encryption-key-with-32-characters';
  try {
    const encrypted = encryptPushSubscription(valid);
    assert.notEqual(encrypted, JSON.stringify(valid));
    assert.deepEqual(decryptPushSubscription(encrypted), valid);
    assert.equal(endpointHash(valid.endpoint).length, 64);
    const parts = encrypted.split('.'); parts[1] = Buffer.alloc(16).toString('base64url');
    assert.throws(() => decryptPushSubscription(parts.join('.')));
  } finally {
    if (old === undefined) delete process.env.LEAD_SYNC_ENCRYPTION_KEY;
    else process.env.LEAD_SYNC_ENCRYPTION_KEY = old;
  }
});
