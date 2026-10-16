import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simpleParser } from 'mailparser';
import { classifyInboundEmail, isHumanReply } from '../src/utils/emailInbound.js';
import { describeEmailDelivery, isReplyableEmail } from '../web/src/lib/email-delivery.ts';

async function classify(headers, body = 'A fixture message') {
  return classifyInboundEmail(await simpleParser(`${headers}\r\n\r\n${body}`));
}

test('standard delivery and disposition reports are separated from customer replies', async () => {
  assert.equal(await classify('Content-Type: multipart/report; report-type=delivery-status; boundary="fixture"'), 'delivery_report');
  assert.equal(await classify('Content-Type: message/delivery-status'), 'delivery_report');
  assert.equal(await classify('Content-Type: multipart/report; report-type=disposition-notification; boundary="fixture"'), 'automatic_reply');
});

test('automatic responder headers and explicit vacation subjects identify automatic replies', async () => {
  for (const header of ['Auto-Submitted: auto-replied', 'Auto-Submitted: auto-generated; owner=fixture', 'X-Autoreply: yes', 'X-Autorespond: vacation']) {
    assert.equal(await classify(header), 'automatic_reply', header);
  }
  for (const subject of ['Automatic reply: enquiry', 'Out of office: enquiry', 'Auto-reply: quotation', 'Vacation response']) {
    assert.equal(await classify(`Subject: ${subject}`), 'automatic_reply', subject);
  }
});

test('quoted automatic mail, human wording, and request-side suppression headers do not hide a reply', async () => {
  assert.equal(await classify('Auto-Submitted: no\r\nX-Auto-Response-Suppress: All\r\nSubject: Re: Quotation', 'I will be out of office tomorrow. Please quote 5 boxes.\n> Automatic reply'), 'human');
  assert.equal(await classify('Subject: Delivery failure question', 'Can you explain the delivery failure I received?'), 'human');
  assert.equal(await classify('Subject: Re: Out of office', 'I have returned. Could you send the quotation?'), 'human');
  assert.equal(await classify('Subject: Out of office tomorrow, please quote'), 'human');
  assert.equal(await classify('Precedence: bulk\r\nSubject: Enquiry'), 'human');
});

test('classification controls reply counting and composer parents while legacy rows remain compatible', () => {
  const human = { channel: 'email', direction: 'inbound', status: 'delivered', emailInboundKind: 'human' };
  assert.equal(isHumanReply(human), true);
  assert.equal(isHumanReply({ ...human, emailInboundKind: null }), true);
  for (const kind of ['automatic_reply', 'delivery_report', 'pending']) {
    const message = { ...human, emailInboundKind: kind };
    assert.equal(isHumanReply(message), false);
    assert.equal(isReplyableEmail(message), false);
    assert.match(describeEmailDelivery(message).detail, /not been counted|excluded from/);
  }
  assert.equal(isHumanReply({ ...human, emailInboundKind: null, status: 'partial' }), false);
  assert.equal(isReplyableEmail({ ...human, emailInboundKind: null, status: 'partial' }), false);
  assert.equal(isHumanReply({ channel: 'whatsapp', direction: 'inbound' }), true);
  assert.equal(isHumanReply({ ...human, direction: 'outbound' }), false);
});
