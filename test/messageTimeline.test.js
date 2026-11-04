import test from 'node:test';
import assert from 'node:assert/strict';
import { messageEventTime, sortConversationMessages } from '../src/utils/messageTimeline.js';

test('late media and imported messages appear at their provider event time without mutating the records', () => {
  const first = { id: 1, direction: 'inbound', providerCreatedAt: '2026-10-24T10:00:10Z', createdAt: '2026-10-24T10:00:11Z' };
  const late = { id: 2, direction: 'inbound', providerCreatedAt: '2026-10-24T10:00:05Z', createdAt: '2026-10-24T10:00:12Z' };
  const reply = { id: 3, direction: 'outbound', sentAt: '2026-10-24T10:00:20Z', createdAt: '2026-10-24T10:00:19Z' };
  const history = [first, late, reply];
  assert.deepEqual(sortConversationMessages(history).map(row => row.id), [2, 1, 3]);
  assert.deepEqual(history.map(row => row.id), [1, 2, 3]);
});

test('missing or invalid provider dates fall back to sent/created time, with stable ties', () => {
  const first = { id: 2, direction: 'inbound', providerCreatedAt: 'bad', sentAt: '2026-10-24T10:00:00Z' };
  const second = { id: 1, direction: 'outbound', createdAt: '2026-10-24T10:00:00Z' };
  assert.deepEqual(sortConversationMessages([first, second]).map(row => row.id), [1, 2]);
  assert.equal(messageEventTime({ direction: 'inbound' }), 0);
});

// Message actions must never resolve a target by phone number or another thread.
test('quoted reply targets keep channel, lead and sender identity boundaries', async () => {
  const { assertReplyTarget, nativeMessageId } = await import('../src/utils/messageActions.js');
  const target = { id: 1, leadId: 10, channel: 'whatsapp', waAccount: 2, waMessageId: 'ycloud-fixture', providerMessageId: 'wamid.FIXTURE' };
  assert.equal(nativeMessageId(target), 'wamid.FIXTURE');
  assert.equal(assertReplyTarget(target, 10, 'whatsapp', 2), 'wamid.FIXTURE');
  assert.throws(() => assertReplyTarget(target, 11, 'whatsapp', 2));
  assert.throws(() => assertReplyTarget(target, 10, 'telegram', 2));
  assert.throws(() => assertReplyTarget(target, 10, 'whatsapp', 3));
  assert.equal(nativeMessageId({ ...target, providerMessageId: null }), null, 'YCloud submission IDs cannot become quoted WhatsApp targets');
  assert.throws(() => assertReplyTarget({ ...target, providerMessageId: null }, 10, 'whatsapp', 2));
  assert.equal(nativeMessageId({ channel: 'telegram', telegramMessageId: '123' }), '123');
  assert.equal(nativeMessageId({ channel: 'imessage', imessageMessageId: 'fixture' }), null, 'unsupported native operations are not advertised');
});

test('Telegram reaction identities cannot collide across peers with the same remote message number', async () => {
  const { reactionKey } = await import('../src/utils/messageActions.js');
  const message = { channel: 'telegram', telegramAccountId: 1, telegramMessageId: '42', leadId: 10 };
  assert.notEqual(reactionKey(message, 'business').targetId, reactionKey({ ...message, leadId: 11 }, 'business').targetId);
});
