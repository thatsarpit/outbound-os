import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function completionHash(body) { return createHash('sha256').update(body).digest('hex'); }

export function completionScope({ completionSecret, source, route }) {
  if (typeof completionSecret !== 'string' || completionSecret.length < 32) throw new Error('A separate scoped completion secret is required');
  if (typeof source !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(source)) throw new Error('Invalid completion source');
  if (typeof route !== 'string' || !/^\/[a-zA-Z0-9/_-]{1,255}$/.test(route) || route.includes('//')) throw new Error('Invalid completion route');
}

function clock(now) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid completion clock');
}

function header(headers, name) {
  const values = Object.entries(headers ?? {}).filter(([key]) => key.toLowerCase() === name.toLowerCase());
  if (values.length !== 1 || typeof values[0][1] !== 'string') throw new Error(`Invalid ${name}`);
  return values[0][1];
}

/** Canonical bytes also reject duplicate JSON keys and alternate field order/encoding. */
export function completionBody(value) {
  return Buffer.from(JSON.stringify({ schemaVersion: value.schemaVersion, event_type: value.event_type,
    receiptId: value.receiptId, batchId: value.batchId, batchBodyHash: value.batchBodyHash,
    source: value.source, route: value.route, resultState: value.resultState,
    draftHash: value.draftHash, completedAt: value.completedAt }));
}

export function signCompletion(value, completionSecret, now) {
  clock(now);
  const body = completionBody(value);
  const timestamp = String(Math.floor(now / 1000));
  return { body, headers: { 'Content-Type': 'application/json', 'X-Request-ID': value.receiptId,
    'X-Webhook-Timestamp': timestamp,
    'X-Webhook-Signature-V2': createHmac('sha256', completionSecret).update(timestamp + '.').update(body).digest('hex') } };
}

export function verifyCompletion({ body, headers, now }, scope) {
  completionScope(scope);
  clock(now);
  if (!Buffer.isBuffer(body) || !body.length || body.length > 2048) throw new Error('Invalid completion body');
  const timestamp = header(headers, 'X-Webhook-Timestamp');
  const seconds = Number(timestamp);
  if (!/^(0|[1-9]\d*)$/.test(timestamp) || !Number.isSafeInteger(seconds)
    || Math.abs(Math.floor(now / 1000) - seconds) > 300) throw new Error('Invalid or expired completion timestamp');
  const signature = header(headers, 'X-Webhook-Signature-V2');
  if (!/^[a-f0-9]{64}$/.test(signature)) throw new Error('Invalid completion signature');
  const expected = createHmac('sha256', scope.completionSecret).update(timestamp + '.').update(body).digest();
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), expected)) throw new Error('Invalid completion signature');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  const keys = ['schemaVersion', 'event_type', 'receiptId', 'batchId', 'batchBodyHash', 'source', 'route', 'resultState', 'draftHash', 'completedAt'];
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  const sha256 = /^[a-f0-9]{64}$/;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))
    || value.schemaVersion !== 1 || value.event_type !== 'inbound.batch.completed'
    || typeof value.batchId !== 'string' || !uuid.test(value.batchId) || value.receiptId !== `draft:${value.batchId}`
    || typeof value.batchBodyHash !== 'string' || !sha256.test(value.batchBodyHash)
    || typeof value.draftHash !== 'string' || !sha256.test(value.draftHash)
    || value.source !== scope.source || value.route !== scope.route || value.resultState !== 'drafted'
    || !Number.isSafeInteger(value.completedAt) || value.completedAt < 0
    || value.completedAt > now || value.completedAt > (seconds + 1) * 1000 - 1
    || header(headers, 'X-Request-ID') !== value.receiptId || !body.equals(completionBody(value))) {
    throw new Error('Invalid completion receipt or delivery identity');
  }
  return value;
}
