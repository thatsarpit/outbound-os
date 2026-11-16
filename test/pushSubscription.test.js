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
    assert.deepEqual(publicPushDevice(row, 'fixture-key'), { id: 3, label: 'Safari on iPhone', enabled: true, needsReconnect: false, registeredAt: row.createdAt, previewMode: 'private' });
    assert.equal(publicPushDevice(row, 'rotated-key').needsReconnect, true);
    assert.deepEqual(decryptPushSubscription(encryptedData), valid, 'web push receives no label metadata');
    assert.doesNotMatch(JSON.stringify(publicPushDevice(row, 'fixture-key')), /endpoint|keys|encryptedData|vapidKey|viewerKey|private-viewer|private-hash/);
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

test('notification preview settings are encrypted, device-specific and private by default', async () => {
  const { pushPreviewMode, pushSubscriptionPreview, updatePushSubscriptionPreview, publicPushDevice } = await import('../src/utils/pushSubscription.js');
  const old = process.env.LEAD_SYNC_ENCRYPTION_KEY;
  process.env.LEAD_SYNC_ENCRYPTION_KEY = 'fixture-encryption-key-with-32-characters';
  try {
    const encrypted = encryptPushSubscription(valid, 'Fixture phone');
    assert.equal(pushSubscriptionPreview(encrypted), 'private');
    for (const invalid of [undefined, null, '', 'full', {}, true]) assert.equal(pushPreviewMode(invalid), 'private');
    assert.equal(pushSubscriptionPreview('unreadable'), 'private');
    const updated = updatePushSubscriptionPreview(encrypted, 'message');
    assert.equal(pushSubscriptionPreview(updated), 'message');
    assert.equal(pushSubscriptionPreview(encrypted), 'private', 'changing one device cannot mutate another stored registration');
    assert.deepEqual(decryptPushSubscription(updated), valid);
    assert.equal(publicPushDevice({ encryptedData: updated }, 'fixture-key').label, 'Fixture phone');
    assert.equal(pushSubscriptionPreview(updatePushSubscriptionPreview(updated, 'sender')), 'sender');
    assert.equal(pushSubscriptionPreview(updatePushSubscriptionPreview(updated, 'invalid')), 'private');
  } finally {
    if (old === undefined) delete process.env.LEAD_SYNC_ENCRYPTION_KEY;
    else process.env.LEAD_SYNC_ENCRYPTION_KEY = old;
  }
});

test('push previews reveal only the selected information and never put message content in links', async () => {
  const { buildMessagePush, pushPlainText } = await import('../src/utils/pushMessage.js');
  const message = { id: 1, leadId: 9, channel: 'whatsapp', lead: { name: '<b>Fixture buyer</b>' }, content: 'Can you share an update?', createdAt: '2026-11-05T01:00:00Z' };
  const privatePush = buildMessagePush(message);
  assert.equal(privatePush.title, 'New WhatsApp message');
  assert.doesNotMatch(JSON.stringify(privatePush), /Fixture buyer|share an update/);
  const sender = buildMessagePush(message, 'sender');
  assert.equal(sender.title, 'Fixture buyer · WhatsApp');
  assert.equal(sender.body, 'Sent you a message.');
  const preview = buildMessagePush(message, 'message');
  assert.equal(preview.body, message.content);
  assert.equal(preview.timestamp, Date.parse(message.createdAt));
  assert.equal(preview.url, '/m/inbox?leadId=9&channel=whatsapp');
  assert.equal(buildMessagePush({ ...message, id: 2 }, 'message').tag, preview.tag);
  assert.notEqual(buildMessagePush({ ...message, channel: 'email' }, 'message').tag, preview.tag);
  assert.equal(buildMessagePush({ ...message, channel: 'unknown' }, 'message').title, 'Fixture buyer · customer');
  assert.equal(buildMessagePush({ ...message, createdAt: 'invalid' }).timestamp, undefined);
  assert.equal(buildMessagePush(message, 'unrecognized').body, privatePush.body);
  assert.equal(pushPlainText('<script>bad()</script><b>Hello</b>\n\u202Ethere &lt;b&gt;again&lt;/b&gt;', 80), 'Hello there again');
  assert.equal(pushPlainText('👨‍👩‍👧‍👦'.repeat(10), 4), `${'👨‍👩‍👧‍👦'.repeat(3)}…`);
});

test('media notifications describe the attachment without leaking hidden captions', async () => {
  const { buildMessagePush } = await import('../src/utils/pushMessage.js');
  const message = { leadId: 9, channel: 'telegram', lead: { name: 'Fixture customer' }, mediaType: 'image', mediaCaption: 'Delivery photo', content: '[Photo]' };
  assert.equal(buildMessagePush(message, 'message').body, 'Photo: Delivery photo');
  assert.equal(buildMessagePush({ ...message, mediaCaption: '' }, 'message').body, 'Photo');
  assert.equal(buildMessagePush({ ...message, mediaType: 'audio', content: '[Voice message]', mediaCaption: '' }, 'message').body, 'Voice message');
  assert.equal(buildMessagePush({ ...message, mediaType: 'pdf', mediaCaption: '' }, 'message').body, 'Document');
  assert.equal(buildMessagePush({ ...message, mediaType: null, content: '[Unsupported WhatsApp message]', mediaCaption: '' }, 'message').body, 'New message');
  assert.doesNotMatch(JSON.stringify(buildMessagePush(message, 'sender')), /Delivery photo/);
});

test('push worker preserves notification timestamps and focuses an already-open conversation without reloading its draft', async () => {
  const { readFile } = await import('node:fs/promises');
  const { runInNewContext } = await import('node:vm');
  const handlers = {};
  const notices = [];
  const url = 'https://app.example.test/m/inbox?leadId=9&channel=whatsapp';
  let focused = 0, opened = 0;
  const self = {
    addEventListener: (type, handler) => { handlers[type] = handler; },
    location: { origin: 'https://app.example.test' },
    registration: { showNotification: async (title, options) => notices.push({ title, options }) },
    clients: {
      matchAll: async () => [{ url, focus: async () => { focused++; }, navigate: async () => assert.fail('Do not reload an open conversation') }],
      openWindow: async () => { opened++; },
    },
  };
  runInNewContext(await readFile(new URL('../web/public/push-sw.js', import.meta.url), 'utf8'), { self, URL });
  let pending;
  handlers.push({ data: { json: () => ({ title: 'Fixture · WhatsApp', body: 'Fixture message', timestamp: 1793840400000, url: '/m/inbox?leadId=9&channel=whatsapp' }) }, waitUntil: promise => { pending = promise; } });
  await pending;
  assert.equal(notices[0].options.timestamp, 1793840400000);
  handlers.notificationclick({ notification: { close() {}, data: notices[0].options.data }, waitUntil: promise => { pending = promise; } });
  await pending;
  assert.equal(focused, 1);
  assert.equal(opened, 0);
  handlers.notificationclick({ notification: { close() {}, data: { url: 'https://outside.example.test/m/inbox' } }, waitUntil: promise => { pending = promise; } });
  await pending;
  assert.equal(opened, 0, 'a notification cannot navigate to another origin');
});
