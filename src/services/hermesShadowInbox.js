import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { completionScope, signCompletion } from './hermesCompletionReceipt.js';
import { MAX_BATCH_EVENTS } from './hermesEventProtocol.js';

function hash(body) { return createHash('sha256').update(body).digest('hex'); }

function header(headers, name) {
  const values = Object.entries(headers ?? {}).filter(([key]) => key.toLowerCase() === name.toLowerCase());
  if (values.length !== 1 || typeof values[0][1] !== 'string') throw new Error(`Invalid ${name}`);
  return values[0][1];
}

function authenticate(body, headers, secret, now) {
  if (!Buffer.isBuffer(body) || !body.length || body.length > 65536) throw new Error('Invalid body size or type');
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('A scoped signing secret is required');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid clock');
  const timestamp = header(headers, 'X-Webhook-Timestamp');
  const seconds = Number(timestamp);
  if (!/^(0|[1-9]\d*)$/.test(timestamp) || !Number.isSafeInteger(seconds)
    || Math.abs(Math.floor(now / 1000) - seconds) > 300) throw new Error('Invalid or expired timestamp');
  const signature = header(headers, 'X-Webhook-Signature-V2');
  if (!/^[a-f0-9]{64}$/.test(signature)) throw new Error('Invalid signature');
  const expected = createHmac('sha256', secret).update(timestamp + '.').update(body).digest();
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), expected)) throw new Error('Invalid signature');
  return header(headers, 'X-Request-ID');
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
const batchKeys = ['event_type', 'event_id', 'mode', 'conversation_key', 'events'];
const eventKeys = ['id', 'eventType', 'channel', 'accountId', 'leadId', 'messageId', 'receiptId', 'createdAt'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function validateBatch(value) {
  if (!exactKeys(value, batchKeys) || value.event_type !== 'inbound.batch' || value.mode !== 'shadow'
    || typeof value.event_id !== 'string' || !uuid.test(value.event_id)
    || !Array.isArray(value.events) || !value.events.length || value.events.length > MAX_BATCH_EVENTS) throw new Error('Invalid batch');
  const ids = new Set();
  for (const event of value.events) {
    if (!exactKeys(event, eventKeys) || !['whatsapp', 'email'].includes(event.channel)
      || !(event.accountId === null || (Number.isSafeInteger(event.accountId) && event.accountId >= 0))
      || !Number.isSafeInteger(event.createdAt) || event.createdAt < 0) throw new Error('Invalid event reference');
    let key;
    if (event.eventType === 'message.received' && positive(event.messageId) && positive(event.leadId)
      && event.receiptId === null && event.id === `message:${event.messageId}:received`) {
      key = `${event.channel}:${event.accountId ?? 0}:lead:${event.leadId}`;
    } else if (event.eventType === 'inbound.receipt_unmatched' && event.channel === 'email'
      && positive(event.receiptId) && event.leadId === null && event.messageId === null
      && event.id === `receipt:${event.receiptId}:unmatched`) {
      key = `email:${event.accountId ?? 0}:receipt:${event.receiptId}`;
    } else throw new Error('Invalid event reference');
    if (key !== value.conversation_key || ids.has(event.id)) throw new Error('Invalid conversation scope or duplicate reference');
    ids.add(event.id);
  }
}

function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = fn();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function assertIsolated(db, { initialized = true } = {}) {
  if (db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND lower(name) IN ('lead','message')`).get()) {
    throw new Error('An isolated receiver database is required');
  }
  db.exec('PRAGMA foreign_keys=ON');
  if (db.prepare('PRAGMA foreign_keys').get().foreign_keys !== 1) throw new Error('Foreign keys are required');
  if (initialized && !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='HermesShadowBatch'").get()) {
    throw new Error('Explicit inbox initialization is required');
  }
}

/** Explicit receiver-owned schema. Never called on import or by application startup. */
export function initializeShadowInbox(db) {
  assertIsolated(db, { initialized: false });
  db.exec(`CREATE TABLE IF NOT EXISTS HermesShadowBatch (
    source TEXT NOT NULL, route TEXT NOT NULL, id TEXT NOT NULL,
    bodyHash TEXT NOT NULL, body BLOB NOT NULL, conversationKey TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'queued', result TEXT, reason TEXT,
    token TEXT, leaseUntil INTEGER, createdAt INTEGER NOT NULL, completedAt INTEGER,
    PRIMARY KEY(source,route,id)
  );
  CREATE TABLE IF NOT EXISTS HermesShadowEvent (
    source TEXT NOT NULL, eventId TEXT NOT NULL, route TEXT NOT NULL, batchId TEXT NOT NULL,
    PRIMARY KEY(source,eventId),
    FOREIGN KEY(source,route,batchId) REFERENCES HermesShadowBatch(source,route,id)
  );
  CREATE TABLE IF NOT EXISTS HermesShadowDraft (
    source TEXT NOT NULL, route TEXT NOT NULL, batchId TEXT NOT NULL,
    draft TEXT NOT NULL, draftHash TEXT NOT NULL, createdAt INTEGER NOT NULL,
    PRIMARY KEY(source,route,batchId),
    FOREIGN KEY(source,route,batchId) REFERENCES HermesShadowBatch(source,route,id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS HermesShadowConversationOwner
    ON HermesShadowBatch(source,conversationKey) WHERE state IN ('processing','blocked','uncertain');
  CREATE INDEX IF NOT EXISTS HermesShadowQueue ON HermesShadowBatch(source,route,state,createdAt);
  CREATE INDEX IF NOT EXISTS HermesShadowLeases ON HermesShadowBatch(source,state,leaseUntil);`);
}

/** The caller owns an isolated SQLite connection and fixed source/route secret scope. */
export class HermesShadowInbox {
  constructor(db, { secret, source, route, leaseMs = 30000, maxInFlight = 1 } = {}) {
    if (typeof secret !== 'string' || secret.length < 32) throw new Error('A scoped signing secret is required');
    if (typeof source !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(source)) throw new Error('Invalid source');
    if (typeof route !== 'string' || !/^\/[a-zA-Z0-9/_-]{1,255}$/.test(route) || route.includes('//')) throw new Error('Invalid route');
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0 || leaseMs > 300000) throw new Error('Invalid leaseMs');
    if (!Number.isSafeInteger(maxInFlight) || maxInFlight <= 0 || maxInFlight > 32) throw new Error('Invalid maxInFlight');
    assertIsolated(db);
    Object.assign(this, { db, secret, source, route, leaseMs, maxInFlight });
  }

  get(id) {
    return this.db.prepare('SELECT * FROM HermesShadowBatch WHERE source=? AND route=? AND id=?')
      .get(this.source, this.route, id);
  }

  getDraft(id) {
    return this.db.prepare('SELECT * FROM HermesShadowDraft WHERE source=? AND route=? AND batchId=?')
      .get(this.source, this.route, id);
  }

  expire(now) {
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + this.leaseMs)) throw new Error('Invalid clock');
    this.db.prepare(`UPDATE HermesShadowBatch SET state='uncertain',reason='lease-expired',
      result='{"state":"uncertain","reason":"lease-expired"}',token=NULL,leaseUntil=NULL,completedAt=?
      WHERE source=? AND state='processing' AND leaseUntil<=?`).run(now, this.source, now);
  }

  /** Explicit local execution only. Callbacks are trusted adapters, not customer-provided tools. */
  async runNext({ readContext, draftReply, clock = Date.now } = {}) {
    assertIsolated(this.db);
    const startedAt = clock();
    const batch = transaction(this.db, () => {
      this.expire(startedAt);
      const active = this.db.prepare(`SELECT count(*) AS n FROM HermesShadowBatch WHERE source=? AND state='processing'`).get(this.source).n;
      if (active >= this.maxInFlight) return null;
      // This append-only queue preserves rowids; audit wall time must never determine insertion FIFO.
      const next = this.db.prepare(`SELECT b.* FROM HermesShadowBatch b WHERE b.source=? AND b.route=?
        AND b.state='queued' AND NOT EXISTS (SELECT 1 FROM HermesShadowBatch owner
          WHERE owner.source=b.source AND owner.conversationKey=b.conversationKey
          AND owner.state IN ('processing','blocked','uncertain'))
        AND NOT EXISTS (SELECT 1 FROM HermesShadowBatch older
          WHERE older.source=b.source AND older.conversationKey=b.conversationKey AND older.state='queued'
          AND older.rowid<b.rowid)
        ORDER BY b.rowid LIMIT 1`).get(this.source, this.route);
      if (!next) return null;
      const token = randomUUID();
      this.db.prepare(`UPDATE HermesShadowBatch SET state='processing',token=?,leaseUntil=?
        WHERE source=? AND route=? AND id=?`).run(token, startedAt + this.leaseMs, this.source, this.route, next.id);
      return { ...next, token };
    });
    if (!batch) return { state: 'idle' };
    const value = JSON.parse(Buffer.from(batch.body).toString('utf8'));
    const policy = Object.freeze({ mode: 'shadow', access: 'read-only', action: 'draft-only', customerData: 'untrusted' });
    const scope = Object.freeze({ source: this.source, conversationKey: batch.conversationKey,
      channel: value.events[0].channel, accountId: value.events[0].accountId,
      events: Object.freeze(value.events.map(event => Object.freeze(event))) });
    const stale = { id: batch.id, state: 'stale' };
    const fenced = fn => {
      assertIsolated(this.db);
      return transaction(this.db, () => {
        const time = clock();
        this.expire(time);
        const current = this.get(batch.id);
        if (current.state !== 'processing' || current.token !== batch.token) return stale;
        return fn(time);
      });
    };
    const finishReview = (reason, state = 'blocked') => fenced(time => {
      this.db.prepare(`UPDATE HermesShadowBatch SET state=?,reason=?,result=?,token=NULL,leaseUntil=NULL,completedAt=?
        WHERE source=? AND route=? AND id=? AND token=? AND state='processing'`)
        .run(state, reason, JSON.stringify({ state, reason }), time, this.source, this.route, batch.id, batch.token);
      return { id: batch.id, state, reason };
    });
    if (typeof readContext !== 'function') return finishReview('missing-context-capability');
    if (typeof draftReply !== 'function') return finishReview('missing-draft-capability');
    let context;
    try { context = await readContext(scope); }
    catch { return finishReview('context-error', 'uncertain'); }
    if (!context || typeof context !== 'object') return finishReview('context-unavailable');
    if (context.available !== true || context.complete !== true || context.source !== scope.source
      || context.conversationKey !== scope.conversationKey || context.channel !== scope.channel
      || context.accountId !== scope.accountId || !Object.hasOwn(context, 'data') || context.data == null
      || !Array.isArray(context.coveredEventIds) || !scope.events.every(event => context.coveredEventIds.includes(event.id))) {
      return finishReview('context-insufficient');
    }
    if (fenced(() => true) !== true) return stale;
    let draft;
    try { draft = await draftReply({ scope, context: context.data, policy }); }
    catch { return finishReview('draft-error', 'uncertain'); }
    if (typeof draft !== 'string' || !draft.trim() || draft.length > 16384
      || Buffer.byteLength(draft, 'utf8') > 16384 || !draft.isWellFormed() || draft.includes('\0')) {
      return finishReview('invalid-draft');
    }
    const draftHash = hash(draft);
    return fenced(time => {
      this.db.prepare(`INSERT INTO HermesShadowDraft (source,route,batchId,draft,draftHash,createdAt)
        VALUES (?,?,?,?,?,?)`).run(this.source, this.route, batch.id, draft, draftHash, time);
      this.db.prepare(`UPDATE HermesShadowBatch SET state='drafted',result=?,token=NULL,leaseUntil=NULL,completedAt=?
        WHERE source=? AND route=? AND id=? AND token=?`)
        .run(JSON.stringify({ state: 'drafted', draftHash }), time, this.source, this.route, batch.id, batch.token);
      return { id: batch.id, state: 'drafted', draftHash };
    });
  }

  /** Inert receipt attempt: persisted successful drafts only, never private draft/context text. */
  completionReceipt(id, { completionSecret, now = Date.now() } = {}) {
    assertIsolated(this.db);
    completionScope({ completionSecret, source: this.source, route: this.route });
    if (completionSecret === this.secret) throw new Error('A separate completion secret is required');
    return transaction(this.db, () => {
      const batch = this.get(id);
      const draft = this.getDraft(id);
      if (!batch || batch.state !== 'drafted' || !draft) throw new Error('A persisted drafted result is required');
      const result = JSON.parse(batch.result);
      if (result.state !== 'drafted' || result.draftHash !== draft.draftHash || hash(draft.draft) !== draft.draftHash
        || hash(batch.body) !== batch.bodyHash || !Number.isSafeInteger(batch.completedAt)
        || batch.completedAt < batch.createdAt || draft.createdAt !== batch.completedAt || batch.completedAt > now) {
        throw new Error('Invalid persisted drafted result');
      }
      return signCompletion({ schemaVersion: 1, event_type: 'inbound.batch.completed', receiptId: `draft:${batch.id}`,
        batchId: batch.id, batchBodyHash: batch.bodyHash, source: this.source, route: this.route,
        resultState: 'drafted', draftHash: draft.draftHash, completedAt: batch.completedAt }, completionSecret, now);
    });
  }

  receive({ body, headers, source, route, now = Date.now() }) {
    assertIsolated(this.db);
    if (source !== this.source || route !== this.route) throw new Error('Wrong source or route');
    const deliveryId = authenticate(body, headers, this.secret, now);
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    validateBatch(value);
    if (deliveryId !== value.event_id) throw new Error('Delivery identity mismatch');
    return transaction(this.db, () => {
      const bodyHash = hash(body);
      const previous = this.get(value.event_id);
      if (previous) {
        if (previous.bodyHash !== bodyHash) throw new Error('Batch identity conflict');
        return { id: previous.id, state: previous.state, duplicate: true, bodyHash: previous.bodyHash };
      }
      const seen = this.db.prepare('SELECT 1 FROM HermesShadowEvent WHERE source=? AND eventId=?');
      for (const event of value.events) {
        if (seen.get(source, event.id)) throw new Error('Event identity conflict');
      }
      this.db.prepare(`INSERT INTO HermesShadowBatch (source,route,id,bodyHash,body,conversationKey,createdAt)
        VALUES (?,?,?,?,?,?,?)`).run(source, route, value.event_id, bodyHash, body, value.conversation_key, now);
      const reserve = this.db.prepare('INSERT INTO HermesShadowEvent (source,eventId,route,batchId) VALUES (?,?,?,?)');
      for (const event of value.events) reserve.run(source, event.id, route, value.event_id);
      return { id: value.event_id, state: 'queued', duplicate: false, bodyHash };
    });
  }
}
