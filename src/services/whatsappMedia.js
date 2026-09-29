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
 * AiSensy numbers are not handled here: their Project API passes messages
 * through, not media downloads, so their media stays a text placeholder.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import whatsappCloudApi from './whatsappCloudApi.js';
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

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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

  const fileRes = await fetchWithTimeout(info.url, { headers: auth });
  if (!fileRes.ok) throw new Error(`Meta media download failed (HTTP ${fileRes.status})`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  if (buffer.length > MAX_MEDIA_BYTES) {
    const error = new Error('File is larger than the limit');
    error.code = 'too_large';
    throw error;
  }

  const mime = baseMime(info.mime_type || media.mimeType);
  const ext = EXTENSIONS[mime] || path.extname(media.filename || '') || '';
  const storedName = `${randomUUID()}${ext}`;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(MEDIA_DIR, storedName), buffer);

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
  const transport = await metaTransport(accountId);
  const mime = baseMime(mimeType);
  const buffer = await fs.promises.readFile(filePath);

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([buffer], { type: mime }), filename);

  const uploadRes = await fetchWithTimeout(`${graphBase()}/${transport.phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${transport.token}` },
    body: form,
  });
  const uploaded = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || !uploaded?.id) {
    const error = new Error(uploaded?.error?.message || `Meta media upload failed (HTTP ${uploadRes.status})`);
    error.code = 'upload_failed';
    throw error;
  }

  const kind = mediaKind(mime);
  const result = await whatsappCloudApi.sendMediaById(address, uploaded.id, cloudApiType(kind), {
    caption,
    filename,
  }, accountId);
  if (!result.success) {
    logger.warn(`WhatsApp media send failed: ${result.reason} ${result.rawError || ''}`);
  }
  return { ...result, kind };
}

export default { metaInboundMedia, downloadInboundMedia, sendMediaFile, mediaKind, baseMime };
