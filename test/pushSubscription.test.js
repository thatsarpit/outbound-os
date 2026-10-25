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

test('notification inventory has safe labels and never serializes subscription credentials', async () => {
  const { publicPushDevice, pushDeviceId, pushDeviceLabel } = await import('../src/utils/pushSubscription.js');
  const old = process.env.LEAD_SYNC_ENCRYPTION_KEY;
  process.env.LEAD_SYNC_ENCRYPTION_KEY = 'fixture-encryption-key-with-32-characters';
  try {
    const encryptedData = encryptPushSubscription(valid, '  Safari on iPhone\n\u202E  ');
    const row = { id: 3, encryptedData, enabled: true, vapidKey: 'fixture-key', createdAt: '2026-10-24T00:00:00Z', viewerKey: 'private-viewer', endpointHash: 'private-hash' };
    assert.deepEqual(publicPushDevice(row, 'fixture-key'), { id: 3, label: 'Safari on iPhone', enabled: true, needsReconnect: false, registeredAt: row.createdAt });
    assert.equal(publicPushDevice(row, 'rotated-key').needsReconnect, true);
    assert.deepEqual(decryptPushSubscription(encryptedData), valid, 'web push receives no label metadata');
    assert.doesNotMatch(JSON.stringify(publicPushDevice(row, 'fixture-key')), /endpoint|keys|encryptedData|vapidKey|viewerKey|private/);
    assert.equal(publicPushDevice({ ...row, encryptedData: 'corrupt' }, 'fixture-key').label, 'Notification device');
    assert.equal(pushDeviceLabel('a'.repeat(100)).length, 64);
    assert.equal(pushDeviceLabel(null), 'Notification device');
    assert.equal(pushDeviceId('12'), 12);
    for (const id of ['0', '01', '1junk', '-1', '1.1', '9007199254740992', undefined, 2]) assert.equal(pushDeviceId(id), null);
  } finally {
    if (old === undefined) delete process.env.LEAD_SYNC_ENCRYPTION_KEY;
    else process.env.LEAD_SYNC_ENCRYPTION_KEY = old;
  }
});
