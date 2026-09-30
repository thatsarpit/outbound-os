/**
 * Meta WhatsApp webhook inbound message text extraction.
 * Run: node --test test/metaWebhook.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { metaInboundText } from '../src/utils/metaWebhook.js';

describe('metaInboundText', () => {
  test('extracts plain text message body', () => {
    assert.equal(
      metaInboundText({ type: 'text', text: { body: 'Hello, I am interested' } }),
      'Hello, I am interested',
    );
  });

  test('extracts template button reply text', () => {
    assert.equal(
      metaInboundText({ type: 'button', button: { text: 'Yes, call me', payload: 'CALL_ME' } }),
      'Yes, call me',
    );
  });

  test('extracts interactive button and list reply titles', () => {
    assert.equal(
      metaInboundText({
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'btn_1', title: 'Book Demo' } },
      }),
      'Book Demo',
    );
    assert.equal(
      metaInboundText({
        type: 'interactive',
        interactive: { type: 'list_reply', list_reply: { id: 'row_2', title: 'Enterprise Plan' } },
      }),
      'Enterprise Plan',
    );
  });

  test('extracts captions from image, video, and document messages', () => {
    assert.equal(
      metaInboundText({ type: 'image', image: { id: 'img_1', caption: 'Payment receipt' } }),
      'Payment receipt',
    );
    assert.equal(
      metaInboundText({ type: 'video', video: { id: 'vid_1', caption: 'Warehouse tour' } }),
      'Warehouse tour',
    );
    assert.equal(
      metaInboundText({
        type: 'document',
        document: { id: 'doc_1', filename: 'quote.pdf', caption: 'Signed quote' },
      }),
      'Signed quote',
    );
  });

  test('extracts reaction emoji', () => {
    assert.equal(
      metaInboundText({ type: 'reaction', reaction: { message_id: 'wamid.1', emoji: '👍' } }),
      '👍',
    );
  });

  test('returns type placeholders for media messages without captions', () => {
    assert.equal(metaInboundText({ type: 'image', image: { id: 'img_1' } }), '[Photo]');
    assert.equal(metaInboundText({ type: 'video', video: { id: 'vid_1' } }), '[Video]');
    assert.equal(metaInboundText({ type: 'audio', audio: { id: 'aud_1', voice: true } }), '[Voice message]');
    assert.equal(metaInboundText({ type: 'audio', audio: { id: 'aud_2', voice: false } }), '[Audio]');
    assert.equal(
      metaInboundText({ type: 'document', document: { id: 'doc_1', filename: 'invoice.pdf' } }),
      '[Document] invoice.pdf',
    );
    assert.equal(metaInboundText({ type: 'document', document: { id: 'doc_2' } }), '[Document]');
    assert.equal(metaInboundText({ type: 'sticker', sticker: { id: 'stk_1' } }), '[Sticker]');
    assert.equal(metaInboundText({ type: 'location' }), '[location]');
  });

  test('returns empty string when message has no text or type', () => {
    assert.equal(metaInboundText({}), '');
    assert.equal(metaInboundText(null), '');
    assert.equal(metaInboundText(undefined), '');
  });
});
