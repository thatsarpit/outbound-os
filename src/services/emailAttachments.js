import { lstat } from 'node:fs/promises';
import path from 'node:path';
import prisma from '../utils/prismaClient.js';
import { MEDIA_DIR } from './whatsappMedia.js';

export class EmailAttachmentError extends Error {
  constructor(message, statusCode, reason) {
    super(message);
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

export function emailAttachmentIds(value = []) {
  // Older dashboard builds can send numeric strings. Preserve order and
  // deduplicate without accepting partial numeric strings or objects.
  if (!Array.isArray(value) || value.some(id =>
    !((typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id)))
      && Number.isSafeInteger(Number(id)) && Number(id) > 0))) {
    throw new EmailAttachmentError('Choose valid files from the media library.', 400, 'invalid_email_attachments');
  }
  return [...new Set(value.map(Number))];
}

export async function resolveEmailAttachments(ids) {
  if (ids.length === 0) return [];
  const files = await prisma.mediaFile.findMany({ where: { id: { in: ids } } });
  const byId = new Map(files.map(file => [file.id, file]));
  const root = path.resolve(MEDIA_DIR);
  return Promise.all(ids.map(async (id) => {
    const file = byId.get(id);
    // MediaFile paths are relative to the app checkout. Accept only regular
    // files directly inside its private media directory.
    const filename = file && path.basename(file.path);
    const absolute = filename && path.join(root, filename);
    const stat = file?.path === 'data/media/' + filename && filename
      ? await lstat(absolute).catch(error => {
        if (error.code !== 'ENOENT') throw error;
      })
      : null;
    if (!stat?.isFile()) {
      throw new EmailAttachmentError(
        'An attachment is missing or unavailable. Check the media library and upload the file again if needed.',
        404,
        'email_attachment_unavailable',
      );
    }
    return { filename: file.originalName, path: absolute, contentType: file.mimeType };
  }));
}
