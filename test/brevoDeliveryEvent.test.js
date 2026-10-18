import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brevoDeliveryTransition, brevoEventKind, brevoMessageId, normalizeBrevoEvent } from '../src/utils/brevoDeliveryEvent.js';

const receipt = (event, ts = 1792112400) => normalizeBrevoEvent({ email: 'recipient@example.test', camp_id: 17, event, ts_event: ts });

test('Brevo receipts normalize payload vocabulary, UTC event times and SMTP identifiers', () => {
  assert.equal(receipt('hardBounce').event, 'hard_bounce');
  assert.equal(receipt('softBounce').event, 'soft_bounce');
  assert.equal(receipt('unsubscribed').event, 'unsubscribe');
  assert.equal(brevoEventKind(receipt('unsubscribe').event), 'suppression');
  assert.equal(brevoEventKind('__proto__'), 'unknown');
  assert.equal(brevoMessageId(' <mail-17@example.test> '), 'mail-17@example.test');
  assert.equal(brevoMessageId('bad\nheader'), null);
  assert.equal(receipt('opened').occurredAt.toISOString(), new Date(1792112400000).toISOString());
  assert.equal(receipt('opened', 1792112400000).occurredAt.toISOString(), receipt('opened').occurredAt.toISOString());
  assert.equal(normalizeBrevoEvent({ email: 'x@example.test', event: 'delivered', ts_epoch: 1792112400000, date: '2026-10-16 10:00:00' }).occurredAt, null);
  assert.equal(normalizeBrevoEvent({ email: 'bad', event: 'sent' }), null);
  assert.equal(normalizeBrevoEvent([]), null);
});

test('webhook registration ids do not deduplicate distinct facts and replay keys ignore transport metadata', () => {
  const input = { id: 99, event: 'delivered', email: ' Recipient@EXAMPLE.test ', camp_id: 17, ts_event: 1792112400 };
  const event = normalizeBrevoEvent(input);
  assert.equal(event.eventKey, normalizeBrevoEvent({ ...input, id: 100, delivery_attempt: 3 }).eventKey);
  assert.notEqual(event.eventKey, normalizeBrevoEvent({ ...input, email: 'another@example.test' }).eventKey);
  assert.notEqual(event.eventKey, normalizeBrevoEvent({ ...input, event: 'opened' }).eventKey);
  assert.notEqual(event.eventKey, normalizeBrevoEvent(input, 'different-brevo-account').eventKey);
});

test('temporary bounces preserve acceptance without suppressing or requeuing a recipient', () => {
  const soft = brevoDeliveryTransition({ status: 'sent' }, receipt('soft_bounce'));
  assert.equal(soft.status, 'sent');
  assert.equal(soft.providerDeliveryStatus, 'soft_bounce');
  assert.equal(brevoDeliveryTransition(soft, receipt('request', 1792112401)), null);
  assert.equal(brevoDeliveryTransition(soft, receipt('delivered', 1792112401)).status, 'delivered');
});

test('delivery facts advance monotonically and proxy opens do not become engagement', () => {
  const read = brevoDeliveryTransition({ status: 'sent' }, receipt('opened'));
  for (const event of ['delivered', 'sent', 'soft_bounce', 'hard_bounce', 'proxy_open']) {
    assert.equal(brevoDeliveryTransition(read, receipt(event, 1792112401)), null, event);
  }
  const failed = brevoDeliveryTransition({ status: 'sent' }, receipt('hard_bounce'));
  assert.equal(failed.status, 'permanently_failed');
  assert.equal(brevoDeliveryTransition(failed, receipt('soft_bounce', 1792112401)), null);
  assert.equal(brevoDeliveryTransition(failed, receipt('delivered', 1792112399)), null);
  assert.equal(brevoDeliveryTransition(failed, { ...receipt('delivered'), occurredAt: null }), null);
  assert.equal(brevoDeliveryTransition(failed, receipt('delivered', 1792112401)).status, 'delivered');
});
