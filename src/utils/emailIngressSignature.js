import { createHash, createHmac } from 'node:crypto';
import { secretsMatch } from './secretsMatch.js';

export const EMAIL_INGRESS_MAX_BYTES = 25 * 1024 * 1024;
export const EMAIL_INGRESS_HEADERS = {
  timestamp: 'x-outboundos-email-timestamp', eventId: 'x-outboundos-email-event-id',
  from: 'x-outboundos-email-from', to: 'x-outboundos-email-to', signature: 'x-outboundos-email-signature',
  receivedAt: 'x-outboundos-email-received-at',
  payloadHash: 'x-outboundos-email-content-sha256',
};
export function emailIngressSignature({ secret, timestamp, eventId, from, to, receivedAt, raw, payloadHash }) {
  const hash = payloadHash || createHash('sha256').update(raw).digest('hex');
  return `v1=${createHmac('sha256', secret).update(`${timestamp}\n${eventId}\n${from}\n${to}\n${receivedAt}\n${hash}`).digest('hex')}`;
}
export function readEmailIngressHeaders(headers, now = Date.now()) {
  const read = (name) => headers[EMAIL_INGRESS_HEADERS[name]];
  const timestamp = read('timestamp'), eventId = read('eventId'), from = read('from'), to = read('to'), signature = read('signature'), receivedAt = read('receivedAt'), payloadHash = read('payloadHash');
  if (typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp)
    || Math.abs(now - Number(timestamp) * 1000) > 5 * 60 * 1000
    || typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(eventId)
    || typeof from !== 'string' || !/^[A-Za-z0-9_-]{0,1024}$/.test(from)
    || typeof to !== 'string' || !/^[A-Za-z0-9_-]{1,1024}$/.test(to)
    || typeof signature !== 'string' || !/^v1=[a-f0-9]{64}$/.test(signature)
    || typeof receivedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receivedAt)
    || !Number.isFinite(Date.parse(receivedAt)) || Date.parse(receivedAt) > now + 60_000
    || typeof payloadHash !== 'string' || !/^[a-f0-9]{64}$/.test(payloadHash)) return null;
  const envelopeFrom = Buffer.from(from, 'base64url').toString('utf8');
  const envelopeTo = Buffer.from(to, 'base64url').toString('utf8');
  const address = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
  if ((envelopeFrom && !address.test(envelopeFrom)) || !address.test(envelopeTo)
    || envelopeFrom.length > 254 || envelopeTo.length > 254
    || Buffer.from(envelopeFrom).toString('base64url') !== from || Buffer.from(envelopeTo).toString('base64url') !== to) return null;
  return { timestamp, eventId, from, to, receivedAt, payloadHash, signature, envelopeFrom, envelopeTo };
}
export function verifyEmailIngressHeaderSignature(input, secret) {
  return secretsMatch(input.signature, emailIngressSignature({ ...input, secret }));
}
export function verifyEmailIngressSignature(input, raw, secret) {
  return verifyEmailIngressHeaderSignature(input, secret)
    && secretsMatch(input.payloadHash, createHash('sha256').update(raw).digest('hex'));
}
