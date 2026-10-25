import { createHmac, randomUUID } from 'node:crypto';
import { completionHash, verifyCompletion } from './hermesCompletionReceipt.js';
import { MAX_BATCH_EVENTS } from './hermesEventProtocol.js';

/** Local ledger adapter. No database is opened and no worker is started on import. */
export class HermesEventStore {
  constructor(db, { quietMs = 1500, maxWaitMs = 10000, leaseMs = 30000, maxEvents = MAX_BATCH_EVENTS, maxInFlight = 1 } = {}) {
    for (const [name, value] of Object.entries({ quietMs, maxWaitMs, leaseMs, maxEvents, maxInFlight })) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name}`);
    }
    if (maxEvents > MAX_BATCH_EVENTS) throw new Error('Invalid maxEvents');
    Object.assign(this, { db, quietMs, maxWaitMs, leaseMs, maxEvents, maxInFlight });
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  claim(now = Date.now()) {
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + this.leaseMs)) throw new Error('Invalid clock');
    return this.transaction(() => {
      // Recover only expired transport leases. Accepted agent runs need explicit completion.
      this.db.prepare(`UPDATE HermesEventBatch SET state='pending', leaseToken=NULL, leaseUntil=NULL
        WHERE state='leased' AND leaseUntil<=?`).run(now);
      const inFlight = this.db.prepare(`SELECT count(*) AS n FROM HermesEventBatch
        WHERE state IN ('leased','accepted')`).get().n;
      if (inFlight >= this.maxInFlight) return null;
      let batch = this.db.prepare(`SELECT * FROM HermesEventBatch
        WHERE state='pending' AND nextAttemptAt<=? ORDER BY createdAt,id LIMIT 1`).get(now);
      if (!batch) {
        const conversation = this.db.prepare(`SELECT e.conversationKey, min(e.createdAt) AS oldest,
          max(e.createdAt) AS newest FROM HermesInboundEvent e WHERE e.batchId IS NULL
          AND NOT EXISTS (SELECT 1 FROM HermesEventBatch b WHERE b.conversationKey=e.conversationKey
            AND b.state IN ('pending','leased','accepted','blocked'))
          GROUP BY e.conversationKey HAVING max(e.createdAt)<=? OR min(e.createdAt)<=?
          ORDER BY min(e.createdAt),e.conversationKey LIMIT 1`).get(now - this.quietMs, now - this.maxWaitMs);
        if (!conversation) return null;
        const events = this.db.prepare(`SELECT id,eventType,channel,accountId,leadId,messageId,receiptId,createdAt
          FROM HermesInboundEvent WHERE batchId IS NULL AND conversationKey=? ORDER BY createdAt,messageId,receiptId,id LIMIT ?`)
          .all(conversation.conversationKey, this.maxEvents);
        const id = randomUUID();
        const body = JSON.stringify({ event_type: 'inbound.batch', event_id: id, mode: 'shadow',
          conversation_key: conversation.conversationKey, events });
        this.db.prepare(`INSERT INTO HermesEventBatch
          (id,conversationKey,body,nextAttemptAt,createdAt) VALUES (?,?,?,?,?)`)
          .run(id, conversation.conversationKey, body, now, now);
        const assign = this.db.prepare('UPDATE HermesInboundEvent SET batchId=? WHERE id=? AND batchId IS NULL');
        for (const event of events) assign.run(id, event.id);
        batch = this.db.prepare('SELECT * FROM HermesEventBatch WHERE id=?').get(id);
      }
      const token = randomUUID();
      this.db.prepare(`UPDATE HermesEventBatch SET state='leased',leaseToken=?,leaseUntil=?,attempts=attempts+1
        WHERE id=?`).run(token, now + this.leaseMs, batch.id);
      return this.db.prepare('SELECT * FROM HermesEventBatch WHERE id=?').get(batch.id);
    });
  }

  accept(id, token, now = Date.now()) {
    return this.db.prepare(`UPDATE HermesEventBatch SET state='accepted',leaseToken=NULL,leaseUntil=NULL,lastStatus=202
      WHERE id=? AND state='leased' AND leaseToken=? AND leaseUntil>?`).run(id, token, now).changes === 1;
  }

  retry(id, token, { status = null, retryAfter = null, now = Date.now() } = {}) {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid clock');
    return this.transaction(() => {
      const batch = this.db.prepare(`SELECT * FROM HermesEventBatch
        WHERE id=? AND state='leased' AND leaseToken=? AND leaseUntil>?`).get(id, token, now);
      if (!batch) return false;
      const retryable = status === null || status === 408 || status === 429 || status >= 500;
      const seconds = typeof retryAfter === 'string' && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null;
      const dateDelay = typeof retryAfter === 'string' ? Date.parse(retryAfter) - now : NaN;
      const requested = seconds !== null ? seconds * 1000 : Number.isFinite(dateDelay) ? Math.max(0, dateDelay) : 0;
      const backoff = Math.min(3600000, 1000 * (2 ** Math.min(batch.attempts - 1, 12)));
      const delay = Math.max(requested, backoff);
      const nextAttemptAt = now + delay;
      const supported = (seconds === null || Number.isSafeInteger(seconds)) && Number.isSafeInteger(requested)
        && Number.isSafeInteger(delay) && Number.isSafeInteger(nextAttemptAt);
      // Unsupported delays must block for review, never become Infinity or retry before the provider permits.
      const pending = retryable && supported;
      this.db.prepare(`UPDATE HermesEventBatch SET state=?,nextAttemptAt=?,leaseToken=NULL,leaseUntil=NULL,lastStatus=?
        WHERE id=? AND leaseToken=?`).run(pending ? 'pending' : 'blocked', pending ? nextAttemptAt : now, status, id, token);
      return true;
    });
  }

  /** Explicit trusted scope/key configuration, never derived from the incoming receipt. No route is registered. */
  receiveCompletion({ body, headers, now = Date.now() }, scope) {
    const receipt = verifyCompletion({ body, headers, now }, scope);
    return this.transaction(() => {
      const batch = this.db.prepare('SELECT * FROM HermesEventBatch WHERE id=?').get(receipt.batchId);
      if (!batch || completionHash(batch.body) !== receipt.batchBodyHash || receipt.completedAt < batch.createdAt) {
        throw new Error('Completion batch identity conflict');
      }
      const receiptHash = completionHash(body);
      if (batch.state === 'completed') {
        if (batch.completionReceiptHash !== receiptHash) throw new Error('Completion receipt identity conflict');
        return { id: batch.id, state: 'completed', duplicate: true };
      }
      if (batch.state !== 'accepted' || batch.completionReceiptHash !== null) throw new Error('Completion requires an accepted batch');
      this.db.prepare(`UPDATE HermesEventBatch SET state='completed',completedAt=?,completionReceiptHash=?
        WHERE id=? AND state='accepted' AND completionReceiptHash IS NULL`)
        .run(receipt.completedAt, completionHash(body), receipt.batchId);
      return { id: batch.id, state: 'completed', duplicate: false };
    });
  }

  /** LOCAL trusted/test escape hatch only; unauthenticated, never expose to remote callers. */
  complete(id, now = Date.now()) {
    return this.db.prepare(`UPDATE HermesEventBatch SET state='completed',completedAt=?
      WHERE id=? AND state='accepted'`).run(now, id).changes === 1;
  }
}

/** One explicit shadow-mode dispatch. Transport is injected; imports/startup cannot send traffic. */
export async function dispatchShadowBatch({ enabled = false, store, endpoint, secret, transport, clock = Date.now, timeoutMs = 8000 } = {}) {
  if (enabled !== true) return { state: 'disabled' };
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new Error('A fixed credential-free HTTPS endpoint is required');
  if (typeof secret !== 'string' || secret.length < 32 || typeof transport !== 'function') throw new Error('A signing secret and explicit transport are required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs >= store.leaseMs) throw new Error('Transport timeout must be shorter than the lease');
  const batch = store.claim(clock());
  if (!batch) return { state: 'idle' };
  const timestamp = String(Math.floor(clock() / 1000));
  const headers = { 'Content-Type': 'application/json', 'X-Request-ID': batch.id,
    'X-Webhook-Timestamp': timestamp,
    'X-Webhook-Signature-V2': createHmac('sha256', secret).update(`${timestamp}.${batch.body}`).digest('hex') };
  const controller = new AbortController();
  let timer;
  let response;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Transport timeout')); }, timeoutMs);
    });
    response = await Promise.race([Promise.resolve().then(() => transport(url.href, {
      method: 'POST', headers, body: batch.body, redirect: 'error', signal: controller.signal,
    })), deadline]);
  } catch {
    response = null;
  } finally { clearTimeout(timer); }
  const status = Number.isInteger(response?.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
  if (status !== null && status >= 200 && status < 300) {
    return { id: batch.id, state: store.accept(batch.id, batch.leaseToken, clock()) ? 'accepted' : 'stale' };
  }
  const retryAfter = response?.headers?.get?.('retry-after') ?? null;
  const changed = store.retry(batch.id, batch.leaseToken, { status, retryAfter, now: clock() });
  const persisted = changed ? store.db.prepare('SELECT state FROM HermesEventBatch WHERE id=?').get(batch.id) : null;
  return { id: batch.id, state: !changed ? 'stale' : persisted.state === 'blocked' ? 'blocked' : 'retry' };
}
