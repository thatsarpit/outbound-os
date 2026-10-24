import { createHash } from 'node:crypto';
import { EMAIL_INGRESS_MAX_BYTES } from './emailIngressSignature.js';

export const emailAttachmentHash = bytes => createHash('sha256').update(bytes).digest('hex');

export function emailAttachmentMetadata(parsed) {
  return (parsed.attachments || []).map(attachment => ({
    filename: String(attachment.filename || 'attachment').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 255),
    contentType: String(attachment.contentType || 'application/octet-stream').slice(0, 150),
    size: attachment.size || attachment.content?.length || 0,
    contentId: attachment.cid ? String(attachment.cid).slice(0, 255) : null,
    sha256: emailAttachmentHash(attachment.content || Buffer.alloc(0)),
  }));
}

export function readEmailAttachmentMetadata(value) {
  const items = JSON.parse(value || '[]');
  if (!Array.isArray(items) || items.some(item => !item || typeof item.filename !== 'string'
    || item.filename.length > 255 || /[\x00-\x1f\x7f]/.test(item.filename)
    || typeof item.contentType !== 'string' || item.contentType.length > 150
    || !(item.contentId === null || (typeof item.contentId === 'string' && item.contentId.length <= 255))
    || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > EMAIL_INGRESS_MAX_BYTES
    || !/^[a-f0-9]{64}$/.test(item.sha256))) throw new Error('Invalid retained attachment metadata');
  if (items.reduce((sum, item) => sum + item.size, 0) > EMAIL_INGRESS_MAX_BYTES) throw new Error('Invalid retained attachment size');
  return items;
}

/** Sender filenames are labels only; they never select a server path. */
export function emailAttachmentDisposition(filename) {
  const name = String(filename).replace(/[\x00-\x1f\x7f\\/]/g, '_').slice(0, 255).toWellFormed() || 'attachment';
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
