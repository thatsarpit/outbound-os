// The relay is deliberately opt-in. It never parses mail or sends customer mail.
const MAX_BYTES = 25 * 1024 * 1024;
const KEY = /^incoming\/([A-Za-z0-9_-]{16,100})\.eml$/;
const encoder = new TextEncoder();
function relayError(code, message, status = undefined) {
  return Object.assign(new Error(message), { relayCode: code, ...(status ? { httpStatus: status } : {}) });
}
const hex = bytes => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
const encodeAddress = value => btoa(String.fromCharCode(...encoder.encode(value))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function config(env) {
  if (env.RELAY_ENABLED !== 'true' || typeof env.EMAIL_INGRESS_SECRET !== 'string' || env.EMAIL_INGRESS_SECRET.length < 32) throw new Error('Email relay is not configured');
  const url = new URL(env.EMAIL_INGRESS_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/api/webhooks/email-ingress') throw new Error('Invalid email ingress URL');
  return url.toString();
}
function validEnvelope(from, to) {
  const address = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
  return typeof from === 'string' && from.length <= 254 && (!from || address.test(from))
    && typeof to === 'string' && to.length <= 254 && address.test(to);
}
function keyIdentity(key) {
  const match = typeof key === 'string' && key.match(KEY);
  if (!match) throw new Error('Invalid raw mail object identity');
  return match[1];
}

export async function signedDeliveryHeaders({ secret, eventId, from, to, receivedAt, raw, now = Date.now() }) {
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(eventId) || !validEnvelope(from, to)) throw new Error('Invalid email delivery envelope');
  const timestamp = String(Math.floor(now / 1000));
  const encodedFrom = encodeAddress(from), encodedTo = encodeAddress(to);
  const payloadHash = hex(await crypto.subtle.digest('SHA-256', raw));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = `${timestamp}\n${eventId}\n${encodedFrom}\n${encodedTo}\n${receivedAt}\n${payloadHash}`;
  const signature = hex(await crypto.subtle.sign('HMAC', key, encoder.encode(signed)));
  return {
    'content-type': 'message/rfc822',
    'x-outboundos-email-timestamp': timestamp,
    'x-outboundos-email-event-id': eventId,
    'x-outboundos-email-from': encodedFrom,
    'x-outboundos-email-to': encodedTo,
    'x-outboundos-email-received-at': receivedAt,
    'x-outboundos-email-content-sha256': payloadHash,
    'x-outboundos-email-signature': `v1=${signature}`,
  };
}

/** Await durable storage in the email handler; R2's object-create rule enqueues it. */
export async function storeIncomingEmail(message, env, { eventId = crypto.randomUUID(), now = Date.now() } = {}) {
  config(env);
  if (!validEnvelope(message.from, message.to)) throw new Error('Invalid incoming envelope');
  if (!Number.isSafeInteger(message.rawSize) || message.rawSize < 1 || message.rawSize > MAX_BYTES) {
    message.setReject('Email exceeds the receiving size limit');
    return;
  }
  const key = `incoming/${eventId}.eml`;
  keyIdentity(key);
  // No fire-and-forget work: a successful handler means the original reached R2.
  await env.MAIL_SPOOL.put(key, message.raw, {
    httpMetadata: { contentType: 'message/rfc822' },
    customMetadata: { eventId, from: message.from, to: message.to, receivedAt: new Date(now).toISOString() },
  });
  return key;
}

/** HTTP success alone is insufficient: require the backend's persisted receipt acknowledgement. */
export async function relayStoredEmail(key, env, { fetcher = fetch, now = Date.now() } = {}) {
  const url = config(env);
  const eventId = keyIdentity(key);
  const acceptedKey = `accepted/${eventId}.json`;
  if (await env.MAIL_SPOOL.head(acceptedKey)) return;
  const object = await env.MAIL_SPOOL.get(key);
  if (!object) throw relayError('original_not_visible', 'The queued raw email object is missing');
  if (object.size < 1 || object.size > MAX_BYTES) throw new Error('Stored raw email exceeds the receiver size limit');
  const metadata = object.customMetadata || {};
  if (metadata.eventId !== eventId || !validEnvelope(metadata.from, metadata.to)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(metadata.receivedAt)
    || !Number.isFinite(Date.parse(metadata.receivedAt))) throw new Error('Stored email envelope metadata is invalid');
  const raw = await object.arrayBuffer();
  if (raw.byteLength !== object.size) throw new Error('Stored email length is inconsistent');
  const headers = await signedDeliveryHeaders({ secret: env.EMAIL_INGRESS_SECRET, eventId, from: metadata.from, to: metadata.to, receivedAt: metadata.receivedAt, raw, now });
  const response = await fetcher(url, { method: 'POST', headers, body: raw, redirect: 'error', signal: AbortSignal.timeout(25_000) });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw relayError('receiver_response', `Email ingress did not acknowledge persistence (${response.status})`, response.status);
  const receipt = await response.json();
  if (receipt.accepted !== true || !Number.isSafeInteger(receipt.receiptId) || receipt.receiptId < 1
    || !['matched', 'unmatched', 'invalid', 'conflict'].includes(receipt.state)) throw relayError('invalid_acknowledgement', 'Email ingress returned no durable receipt acknowledgement');
  // This marker contains no envelope or message content. Raw mail remains private
  // for reconciliation; retention is configured only after the pilot is accepted.
  await env.MAIL_SPOOL.put(acceptedKey, JSON.stringify({ receiptId: receipt.receiptId, state: receipt.state, acceptedAt: new Date(now).toISOString() }), {
    httpMetadata: { contentType: 'application/json' },
  });
}

/** A bounded cursor scan recovers an object whose event notification was missed. */
export async function reconcileStoredMail(env, { now = Date.now() } = {}) {
  config(env);
  const stateKey = 'relay-state/reconcile.json';
  const state = await env.MAIL_SPOOL.get(stateKey);
  let cursor;
  let savedCursor = null;
  if (state) {
    const saved = await state.json();
    if (typeof saved.cursor === 'string') cursor = savedCursor = saved.cursor;
  }
  // Ten entries leave room for recovery bookkeeping within Free Workers'
  // 50-subrequest budget, including the queue write for every retained item.
  const page = await env.MAIL_SPOOL.list({ prefix: 'incoming/', limit: 10, ...(cursor ? { cursor } : {}) });
  for (const object of page.objects) {
    const eventId = keyIdentity(object.key);
    // Give the normal object-created notification/queue retries an hour first.
    if (new Date(object.uploaded).getTime() > now - 3_600_000 || await env.MAIL_SPOOL.head(`accepted/${eventId}.json`)) continue;
    const record = await env.MAIL_SPOOL.get(`relay-state/${eventId}.json`);
    const recent = record ? await record.json() : null;
    if (recent && Date.parse(recent.queuedAt) > now - 24 * 3_600_000) continue;
    await env.MAIL_DELIVERIES.send({ action: 'Reconcile', object: { key: object.key } });
    // Queue acceptance precedes this advisory throttle. A crash can cause a
    // duplicate delivery; it cannot make an unqueued object look accepted.
    await env.MAIL_SPOOL.put(`relay-state/${eventId}.json`, JSON.stringify({ queuedAt: new Date(now).toISOString() }));
  }
  const nextCursor = page.truncated ? page.cursor : null;
  if (!state || nextCursor !== savedCursor) {
    await env.MAIL_SPOOL.put(stateKey, JSON.stringify({ cursor: nextCursor }));
  }
}

export default {
  async email(message, env) { await storeIncomingEmail(message, env); },
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        const body = message.body;
        if (!['PutObject', 'CopyObject', 'CompleteMultipartUpload', 'Reconcile'].includes(body?.action)) throw new Error('Unexpected R2 queue notification');
        await relayStoredEmail(body.object?.key, env);
        message.ack();
      } catch (error) {
        // Do not log envelope, raw mail, signatures or provider response bodies.
        const reason = ['original_not_visible', 'receiver_response', 'invalid_acknowledgement'].includes(error?.relayCode) ? error.relayCode : 'relay_exception';
        console.error('Inbound email remains in private storage; queue delivery will retry.', {
          reason,
          ...(Number.isInteger(error?.httpStatus) ? { httpStatus: error.httpStatus } : {}),
          errorType: ['Error', 'TypeError', 'TimeoutError', 'AbortError', 'OperationError'].includes(error?.name) ? error.name : 'Error',
        });
        message.retry({ delaySeconds: Math.min(3600, 30 * 2 ** Math.min(message.attempts || 1, 7)) });
      }
    }
  },
  async scheduled(_controller, env) {
    if (env.RELAY_ENABLED === 'true') await reconcileStoredMail(env);
  },
  async fetch() { return new Response('Not found', { status: 404 }); },
};
