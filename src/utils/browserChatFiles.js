import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import sharp from 'sharp';

export const browserChatFileLimit = 5 * 1024 * 1024;
export const browserChatFileRetention = 90 * 86400_000;
export const browserChatFileFields = { filename: true, contentType: true, size: true, expiresAt: true };

function fileError(message, status = 400) {
  return Object.assign(new Error(message), { status, chatFileError: true });
}

export async function prepareBrowserChatFile(file) {
  if (!file) return null;
  const input = file.buffer;
  if (!input?.length) throw fileError('Choose a non-empty file.');
  const prefix = input.subarray(0, 12);
  const format = prefix.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? 'jpeg'
    : prefix.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'png'
    : prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
  let bytes, contentType, extension;
  if (format) {
    try {
      const photo = sharp(input, { limitInputPixels: 16_000_000, autoOrient: true, failOn: 'warning' });
      const metadata = await photo.metadata();
      if (metadata.format !== format || metadata.pages > 1) throw new Error('Unsupported photo format');
      bytes = await photo.resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 }).timeout({ seconds: 5 }).toBuffer();
    } catch {
      throw fileError('Choose a readable JPEG, PNG or WebP photo under 16 megapixels.');
    }
    contentType = 'image/webp';
    extension = 'webp';
  } else if (/\.txt$/i.test(file.originalname) && input.length <= 256 * 1024) {
    let value;
    try { value = new TextDecoder('utf-8', { fatal: true }).decode(input); }
    catch { throw fileError('Choose a UTF-8 plain text file.'); }
    if (!value || /[^\P{Cc}\t\r\n]/u.test(value)) throw fileError('Choose a UTF-8 plain text file.');
    bytes = Buffer.from(value);
    contentType = 'text/plain';
    extension = 'txt';
  } else {
    throw fileError('Choose a JPEG, PNG, WebP or UTF-8 .txt file.');
  }
  if (bytes.length >= browserChatFileLimit) throw fileError('Choose a file under 5 MB.', 413);
  const stem = file.originalname.replace(/\.[^.]*$/, '').replace(/[^a-z0-9 _-]/gi, '_').trim().slice(0, 70).trim();
  return { filename: `${stem || 'attachment'}.${extension}`, contentType, bytes,
    size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function storageKey(env) {
  const secret = env.LEAD_SYNC_ENCRYPTION_KEY || env.JWT_SECRET;
  if (!secret || secret.length < 16) throw fileError('File storage is temporarily unavailable.', 503);
  return createHash('sha256').update(`outboundos:browser-chat-file:v1\0${secret}`).digest();
}

export function sealedBrowserChatFile(file, messageId, env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', storageKey(env), iv);
  cipher.setAAD(Buffer.from(String(messageId)));
  const encrypted = Buffer.concat([cipher.update(file.bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function openBrowserChatFile(file, env) {
  const payload = Buffer.from(file.payload);
  const decipher = createDecipheriv('aes-256-gcm', storageKey(env), payload.subarray(0, 12));
  decipher.setAAD(Buffer.from(String(file.messageId)));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
}

export async function checkBrowserChatFileCapacity(db, chatId, size) {
  const stored = { payload: { not: null } };
  const chatBytes = await db.browserChatAttachment.aggregate({
    where: { ...stored, message: { browserChatId: chatId } }, _sum: { size: true },
  });
  if ((chatBytes._sum.size ?? 0) + size > 32 * 1024 * 1024) {
    throw fileError('This chat has reached its attachment limit.', 413);
  }
  const totalBytes = await db.browserChatAttachment.aggregate({ where: stored, _sum: { size: true } });
  if ((totalBytes._sum.size ?? 0) + size > 256 * 1024 * 1024) {
    throw fileError('Attachment storage is full. You can still send a message.', 413);
  }
}

export async function pruneBrowserChatFiles(db, now = new Date()) {
  const where = { expiresAt: { lte: now }, payload: { not: null } };
  const expired = await db.browserChatAttachment.findMany({
    where, select: { messageId: true }, orderBy: { expiresAt: 'asc' }, take: 32,
  });
  if (expired.length) {
    await db.browserChatAttachment.updateMany({
      where: { ...where, messageId: { in: expired.map(file => file.messageId) } },
      data: { payload: null },
    });
  }
}
