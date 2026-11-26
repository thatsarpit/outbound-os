/**
 * WhatsApp media through Meta's Cloud API: photos, PDFs, voice notes and
 * videos, in both directions.
 *
 * Incoming: a message carries only a media id. The file is fetched in two
 * steps — GET /{media-id} returns a short-lived URL, then that URL is
 * downloaded with the same token — and stored in the data volume, because
 * Meta keeps it for a limited time only.
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 *
 * Outgoing: a stored file is uploaded to POST /{phone-number-id}/media, and
 * the returned id is sent in a message. data/media is never served publicly,
 * so the "link" form of media messages is not an option.
 *
 */

import fs from 'fs';
import path from 'path';
import { randomUUID, createHash } from 'crypto';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import whatsappCloudApi, { ycloudBase } from './whatsappCloudApi.js';
import { WHATSAPP_PROVIDERS } from './whatsappProviders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MEDIA_DIR = path.join(__dirname, '..', '..', 'data', 'media');

/** Larger files are left on Meta and noted in the message instead. */
export const MAX_MEDIA_BYTES = 32 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

const graphBase = () => process.env.META_GRAPH_API_BASE || 'https://graph.facebook.com/v21.0';

const EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/amr': '.amr',
  'video/mp4': '.mp4',
  'video/3gpp': '.3gp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
};

/** "audio/ogg; codecs=opus" → "audio/ogg" */
export function baseMime(mimeType) {
  return String(mimeType || '').split(';')[0].trim().toLowerCase();
}

/** How a file is shown: image | video | audio | pdf | document. */
export function mediaKind(mimeType) {
  const mime = baseMime(mimeType);
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  return 'document';
}

/** The Cloud API message type for a file kind. PDFs go out as documents. */
export function cloudApiType(kind) {
  return kind === 'image' || kind === 'video' || kind === 'audio' ? kind : 'document';
}

/**
 * The media part of an incoming Meta message, or null.
 * @returns {{ id: string, mimeType: string, filename: string|null, caption: string|null, type: string, voice: boolean }|null}
 */
export function metaInboundMedia(msg) {
  const type = msg?.type;
  if (!['image', 'video', 'audio', 'document', 'sticker'].includes(type)) return null;
  const part = msg[type];
  if (!part?.id) return null;
  return {
    id: String(part.id),
    mimeType: baseMime(part.mime_type) || 'application/octet-stream',
    filename: part.filename ? String(part.filename).slice(0, 200) : null,
    caption: part.caption ? String(part.caption) : null,
    type,
    voice: type === 'audio' && part.voice === true,
  };
}

/** A safe original filename: no path, nothing that could escape a directory. */
function safeName(name, fallbackExt) {
  const base = path.basename(String(name || '')).replace(/[^\w.\- ()]+/g, '_').slice(0, 120);
  if (base && base !== '.' && base !== '..') return base;
  return `file${fallbackExt}`;
}

function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

async function readLimitedMedia(response, tooLarge) {
  if (Number(response.headers.get('content-length')) > MAX_MEDIA_BYTES) {
    if (response.body) await response.body.cancel().catch(() => {});
    throw tooLarge();
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_MEDIA_BYTES) throw tooLarge();
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size);
}

async function metaTransport(accountId) {
  const transport = await whatsappCloudApi.getTransport(accountId);
  if (transport.provider !== WHATSAPP_PROVIDERS.META) {
    const error = new Error('Media is supported on numbers connected through Meta\'s Cloud API.');
    error.code = 'provider_unsupported';
    throw error;
  }
  return transport;
}

/**
 * Download an incoming file and store it in the data volume.
 * @returns {Promise<{ mediaUrl: string, mediaType: string, mediaFilename: string, size: number }>}
 */
export async function downloadInboundMedia(media, accountId) {
  const transport = await metaTransport(accountId);
  const auth = { Authorization: `Bearer ${transport.token}` };

  const infoRes = await fetchWithTimeout(`${graphBase()}/${encodeURIComponent(media.id)}`, { headers: auth });
  const info = await infoRes.json().catch(() => ({}));
  if (!infoRes.ok || !info?.url) {
    throw new Error(`Meta media lookup failed (HTTP ${infoRes.status}): ${info?.error?.message || 'no url'}`);
  }
  const size = Number(info.file_size || 0);
  if (size > MAX_MEDIA_BYTES) {
    const error = new Error(`File is ${Math.round(size / 1048576)} MB; the limit is ${MAX_MEDIA_BYTES / 1048576} MB`);
    error.code = 'too_large';
    throw error;
  }

  let download;
  try { download = new URL(info.url); } catch {}
  // Send the bearer only to Meta's media host or the configured Graph origin, which already receives it.
  if (!download || download.username || download.password
    || !['https://lookaside.fbsbx.com', new URL(graphBase()).origin].includes(download.origin)) {
    throw new Error('Meta media lookup returned an untrusted download URL.');
  }
  const fileRes = await fetchWithTimeout(download, { headers: auth });
  if (!fileRes.ok) throw new Error(`Meta media download failed (HTTP ${fileRes.status})`);
  const declaredMime = baseMime(info.mime_type || media.mimeType);
  const mime = declaredMime === 'application/octet-stream'
    ? baseMime(fileRes.headers.get('content-type')) : declaredMime;
  if (!Object.hasOwn(EXTENSIONS, mime)) {
    if (fileRes.body) await fileRes.body.cancel().catch(() => {});
    throw new Error('Unsupported Meta media content type.');
  }
  const buffer = await readLimitedMedia(fileRes,
    () => Object.assign(new Error('File is larger than the limit'), { code: 'too_large' }));
  const ext = EXTENSIONS[mime];
  const storedName = `${randomUUID()}${ext}`;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(MEDIA_DIR, storedName), buffer, { flag: 'wx', mode: 0o600 });

  const kind = media.type === 'sticker' ? 'image' : mediaKind(mime);
  const fallback = media.voice ? `voice-message${ext}` : `${kind}${ext}`;
  return {
    mediaUrl: `data/media/${storedName}`,
    mediaType: kind,
    mediaFilename: safeName(media.filename || fallback, ext),
    size: buffer.length,
  };
}

/**
 * Upload a stored file to Meta and send it to a lead.
 * @param {object} args
 * @param {string} args.address     phone number or business-scoped user id
 * @param {string} args.filePath    absolute path of the stored file
 * @param {string} args.mimeType
 * @param {string} args.filename    shown to the recipient for documents
 * @param {string} [args.caption]   images, videos and documents only
 * @param {number|null} args.accountId
 */
export async function sendMediaFile({ address, filePath, mimeType, filename, caption, accountId }) {
  const mime = baseMime(mimeType);
  const buffer = await fs.promises.readFile(filePath);
  const kind = mediaKind(mime);
  const upload = async (transport) => {
    const form = new FormData();
    if (transport.provider === 'meta') {
      form.append('messaging_product', 'whatsapp');
      form.append('type', mime);
    }
    form.append('file', new Blob([buffer], { type: mime }), filename);

    const uploadUrl = transport.provider === 'ycloud'
      ? `${ycloudBase()}/whatsapp/media/${encodeURIComponent(transport.phoneNumber)}/upload`
      : `${graphBase()}/${transport.phoneNumberId}/media`;
    const uploadRes = await fetchWithTimeout(uploadUrl, {
      method: 'POST',
      headers: transport.headers,
      redirect: 'error',
      body: form,
    });
    const uploaded = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok || !uploaded?.id) {
      const error = new Error(uploaded?.error?.message || `Meta media upload failed (HTTP ${uploadRes.status})`);
      error.code = 'upload_failed';
      throw error;
    }
    return uploaded.id;
  };
  const result = await whatsappCloudApi.sendMediaById(address, upload, cloudApiType(kind), {
    caption,
    filename,
  }, accountId);
  if (!result.success) {
    logger.warn(`WhatsApp media send failed: ${result.reason} ${result.rawError || ''}`);
  }
  return { ...result, kind };
}

/** YCloud supplies a signed media URL; never follow arbitrary webhook URLs. */
const ycloudMediaError = (code, message) => Object.assign(new Error(message), { code });
export async function downloadYCloudInboundMedia(message, accountId = null) {
  const media = metaInboundMedia(message);
  if (!media) return null;
  const link = message[message.type]?.link;
  // Construct the request from server configuration and one encoded media ID.
  // No part of the webhook's URL can choose a host, port or request path.
  const download = new URL(`${ycloudBase()}/whatsapp/media/download/${encodeURIComponent(media.id)}`);
  let url;
  try { url = new URL(link); } catch { throw ycloudMediaError('untrusted_media_url', 'YCloud supplied an untrusted media URL.'); }
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(media.id)
    || url.origin !== download.origin || url.username || url.password || url.hash
    || url.pathname !== download.pathname || !url.searchParams.get('sig')) {
    throw ycloudMediaError('untrusted_media_url', 'YCloud supplied an untrusted media URL.');
  }
  for (const field of ['sig', 'payload']) {
    if (url.searchParams.has(field)) download.searchParams.set(field, url.searchParams.get(field));
  }
  const headers = accountId ? (await whatsappCloudApi.getTransport(accountId)).headers : {};
  const response = await fetch(download, { headers, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`YCloud media download failed (HTTP ${response.status}).`);
  const buffer = await readLimitedMedia(response,
    () => ycloudMediaError('media_too_large', 'YCloud media exceeds the file limit.'));
  const digest = message[message.type]?.sha256;
  if (digest && createHash('sha256').update(buffer).digest('base64') !== digest) {
    throw ycloudMediaError('media_checksum_mismatch', 'YCloud media checksum did not match the signed webhook.');
  }
  const mime = baseMime(media.mimeType === 'application/octet-stream' ? response.headers.get('content-type') : media.mimeType);
  if (!Object.hasOwn(EXTENSIONS, mime)) throw ycloudMediaError('unsupported_media_type', 'Unsupported YCloud media content type.');
  const ext = EXTENSIONS[mime];
  const name = `${randomUUID()}${ext}`;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  // Untrusted attachments are intentional: store private, non-executable blobs
  // under server-generated names, never under a provider-supplied path.
  await fs.promises.writeFile(path.join(MEDIA_DIR, name), buffer, { flag: 'wx', mode: 0o600 });
  const kind = media.type === 'sticker' ? 'image' : mediaKind(mime);
  return { mediaUrl: `data/media/${name}`, mediaType: kind,
    mediaFilename: safeName(media.filename || `${kind}${ext}`, ext), size: buffer.length };
}

export default { metaInboundMedia, downloadInboundMedia, sendMediaFile, mediaKind, baseMime };
