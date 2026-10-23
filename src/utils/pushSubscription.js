import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function endpointHash(endpoint) {
  return createHash('sha256').update(endpoint).digest('hex');
}

/** Accept only browser push providers, never arbitrary user-controlled URLs. */
export function validatePushSubscription(input) {
  let url;
  try { url = new URL(input?.endpoint); } catch { throw new Error('Invalid push endpoint.'); }
  const host = url.hostname;
  const trusted = host.endsWith('.push.apple.com') || host === 'fcm.googleapis.com'
    || host === 'updates.push.services.mozilla.com' || host.endsWith('.updates.push.services.mozilla.com');
  if (!trusted || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.href.length > 4096) throw new Error('Unsupported push endpoint.');
  const { p256dh, auth } = input?.keys || {};
  if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}=?$/.test(p256dh) || Buffer.from(p256dh, 'base64url').length !== 65
    || typeof auth !== 'string' || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(auth) || Buffer.from(auth, 'base64url').length !== 16) throw new Error('Invalid push encryption keys.');
  return { endpoint: url.href, keys: { p256dh, auth } };
}

function encryptionKey() {
  const key = process.env.LEAD_SYNC_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (key.length < 16) throw new Error('Push subscription encryption is not configured.');
  return createHash('sha256').update(key).digest();
}
export function encryptPushSubscription(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map(part => part.toString('base64url')).join('.');
}
export function decryptPushSubscription(value) {
  const [iv, tag, body] = value.split('.').map(part => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return validatePushSubscription(JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')));
}
