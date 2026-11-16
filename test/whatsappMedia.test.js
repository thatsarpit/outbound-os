/**
 * WhatsApp media helpers: reading media from Meta webhooks and classifying files.
 * Run: node --test test/whatsappMedia.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { baseMime, cloudApiType, downloadInboundMedia, MAX_MEDIA_BYTES, mediaKind, metaInboundMedia } from '../src/services/whatsappMedia.js';
import whatsappCloudApi from '../src/services/whatsappCloudApi.js';

test('Meta media credentials stay on approved origins and oversized or active payloads are rejected', async t => {
  t.mock.method(whatsappCloudApi, 'getTransport', async () => ({ provider: 'meta', token: 'fixture-only' }));
  const media = { id: 'fixture', type: 'image', mimeType: 'image/jpeg' };
  const requests = [];
  let destination = 'https://untrusted.example.test/resource';
  let mime = 'image/jpeg';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ origin: new URL(url).origin, redirect: options.redirect });
    if (requests.length === 1) return Response.json({ url: destination, mime_type: mime });
    return new Response(new ReadableStream({
      start(controller) {
        const chunk = new Uint8Array(MAX_MEDIA_BYTES / 2);
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    }));
  });
  await assert.rejects(downloadInboundMedia(media, 1), /untrusted download URL/);
  assert.equal(requests.length, 1);
  destination = 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=fixture';
  mime = 'image/svg+xml';
  requests.length = 0;
  await assert.rejects(downloadInboundMedia(media, 1), /Unsupported Meta media content type/);
  assert.deepEqual(requests[1], { origin: 'https://lookaside.fbsbx.com', redirect: 'error' });
  mime = 'image/jpeg';
  requests.length = 0;
  await assert.rejects(downloadInboundMedia(media, 1), { code: 'too_large' });
});

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
