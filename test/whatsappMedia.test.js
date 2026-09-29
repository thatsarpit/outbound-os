/**
 * WhatsApp media helpers: reading media from Meta webhooks and classifying files.
 * Run: node --test test/whatsappMedia.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { metaInboundMedia, mediaKind, baseMime, cloudApiType } from '../src/services/whatsappMedia.js';

describe('Media in Meta webhooks', () => {
  test('a voice note', () => {
    const media = metaInboundMedia({ type: 'audio', audio: { id: 'm1', mime_type: 'audio/ogg; codecs=opus', voice: true } });
    assert.deepEqual(media, { id: 'm1', mimeType: 'audio/ogg', filename: null, caption: null, type: 'audio', voice: true });
  });

  test('a document keeps its name and caption', () => {
    const media = metaInboundMedia({ type: 'document', document: { id: 'm2', mime_type: 'application/pdf', filename: 'PO-1042.pdf', caption: 'Our order' } });
    assert.equal(media.filename, 'PO-1042.pdf');
    assert.equal(media.caption, 'Our order');
  });

  test('text, reactions and media without an id are not media', () => {
    assert.equal(metaInboundMedia({ type: 'text', text: { body: 'hi' } }), null);
    assert.equal(metaInboundMedia({ type: 'reaction', reaction: { emoji: '👍' } }), null);
    assert.equal(metaInboundMedia({ type: 'image', image: {} }), null);
    assert.equal(metaInboundMedia(null), null);
  });
});

describe('File kinds', () => {
  test('by MIME type', () => {
    assert.equal(mediaKind('image/jpeg'), 'image');
    assert.equal(mediaKind('video/mp4'), 'video');
    assert.equal(mediaKind('audio/ogg; codecs=opus'), 'audio');
    assert.equal(mediaKind('application/pdf'), 'pdf');
    assert.equal(mediaKind('application/vnd.ms-excel'), 'document');
    assert.equal(baseMime('Audio/OGG; codecs=opus'), 'audio/ogg');
  });

  test('PDFs are sent as documents', () => {
    assert.equal(cloudApiType('pdf'), 'document');
    assert.equal(cloudApiType('image'), 'image');
  });
});
