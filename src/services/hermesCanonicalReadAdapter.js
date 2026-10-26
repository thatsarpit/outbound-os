const eventKeys = ['id', 'eventType', 'channel', 'accountId', 'leadId', 'messageId', 'receiptId', 'createdAt'];
const positive = value => Number.isSafeInteger(value) && value > 0;
function validEvent(event, scope) {
  if (!event || Object.keys(event).length !== eventKeys.length
    || !eventKeys.every(key => Object.hasOwn(event, key))
    || !['whatsapp', 'email'].includes(event.channel) || event.channel !== scope.channel
    || event.accountId !== scope.accountId
    || !(event.accountId === null || (Number.isSafeInteger(event.accountId) && event.accountId >= 0))
    || !Number.isSafeInteger(event.createdAt) || event.createdAt < 0) return false;
  if (event.eventType === 'message.received' && positive(event.messageId) && positive(event.leadId)
    && event.receiptId === null && event.id === `message:${event.messageId}:received`) {
    return scope.conversationKey === `${event.channel}:${event.accountId ?? 0}:lead:${event.leadId}`;
  }
  return event.eventType === 'inbound.receipt_unmatched' && event.channel === 'email'
    && positive(event.receiptId) && event.leadId === null && event.messageId === null
    && event.id === `receipt:${event.receiptId}:unmatched`
    && scope.conversationKey === `email:${event.accountId ?? 0}:receipt:${event.receiptId}`;
}

/** Inert future-source boundary. No database, HTTP client or MCP fallback is installed. */
export function createCanonicalReadAdapter({ source, readSnapshot, clock = Date.now } = {}) {
  async function read(scope) {
    try { scope = structuredClone(scope); } catch { scope = null; }
    const base = { source, conversationKey: scope?.conversationKey, channel: scope?.channel, accountId: scope?.accountId };
    if (typeof source !== 'string' || !source.trim() || scope?.source !== source
      || !Array.isArray(scope?.events) || !scope.events.length || scope.events.length > 50
      || !scope.events.every(event => validEvent(event, scope))
      || new Set(scope.events.map(event => event.id)).size !== scope.events.length) {
      return { ...base, available: false, complete: false, status: 'invalid-request', reason: 'invalid-scope',
        data: null, provenance: null, coveredEventIds: [] };
    }
    if (typeof readSnapshot !== 'function') return { ...base,
      available: false, complete: false, status: 'unavailable', reason: 'missing-source-capability',
      data: null, provenance: null, coveredEventIds: [] };
    const reject = (status, reason) => ({ ...base, available: false, complete: false,
      status, reason, data: null, provenance: null, coveredEventIds: [] });
    let value;
    try { value = structuredClone(await readSnapshot(structuredClone(scope))); }
    catch { return reject('unavailable', 'source-read-failed'); }
    if (value?.available !== true) return reject('unavailable', 'source-unavailable');
    if (!Array.isArray(value.events?.records) || !Array.isArray(value.receipts?.records)
      || !Array.isArray(value.history?.messages)) return reject('inconsistent', 'malformed-snapshot');
    const observed = value.provenance?.observedAt;
    const current = clock();
    if (value.provenance?.consistent !== true || scope.events.some(event => event.createdAt > observed)
      || value.provenance?.source !== source || typeof value.provenance?.snapshotId !== 'string'
      || !value.provenance.snapshotId.trim() || !Number.isSafeInteger(observed) || observed < 0
      || !Number.isSafeInteger(current) || current < observed || current - observed > 300000
      || value.conversationKey !== scope.conversationKey || value.channel !== scope.channel
      || value.accountId !== scope.accountId || value.events.records.length !== scope.events.length
      || !value.events.records.every(event => validEvent(event, scope)
        && scope.events.some(ref => eventKeys.every(key => ref[key] === event[key])))
      || new Set(value.events.records.map(event => event.id)).size !== scope.events.length) {
      return reject('inconsistent', 'snapshot-scope-or-provenance-mismatch');
    }
    const { messages } = value.history;
    const receipts = value.receipts.records;
    const leadId = scope.events[0].leadId;
    const validRow = row => row && positive(row.id) && row.channel === scope.channel
      && row.accountId === scope.accountId && typeof row.body === 'string';
    if (!messages.every(row => validRow(row) && row.leadId === leadId
        && ['inbound', 'outbound'].includes(row.direction))
      || new Set(messages.map(row => row.id)).size !== messages.length
      || !receipts.every(row => validRow(row) && row.state === 'unmatched'
        && row.leadId === null && row.messageId === null
        && scope.events.some(event => event.receiptId === row.id))
      || new Set(receipts.map(row => row.id)).size !== receipts.length
      || !scope.events.every(event => event.messageId !== null
        ? messages.some(row => row.id === event.messageId && row.direction === 'inbound')
        : receipts.some(row => row.id === event.receiptId))
      || (leadId === null && messages.length !== 0)) return reject('inconsistent', 'canonical-content-mismatch');
    const contentComplete = row => row.contentComplete === true && Array.isArray(row.attachments)
      && row.attachments.every(item => item?.available === true);
    if (value.events.complete !== true || value.receipts.complete !== true
      || value.history.complete !== true || value.history.hasMore !== false
      || !Array.isArray(value.history.gaps) || value.history.gaps.length
      || !value.history.messages.every(contentComplete) || !value.receipts.records.every(contentComplete)) {
      return { ...base, available: true, complete: false, status: 'incomplete', reason: 'incomplete-context',
        provenance: value.provenance, coveredEventIds: [], data: null };
    }
    return { ...base, available: true, complete: true, status: 'complete', reason: null,
      provenance: value.provenance, coveredEventIds: value.events.records.map(event => event.id),
      data: { events: value.events.records, receipts: value.receipts.records, messages: value.history.messages } };
  }
  return {
    readContext: read,
    async readUnmatchedReceipt(scope, receiptId) {
      const result = await read(scope);
      if (!result.complete) return result;
      const receipt = result.data.receipts.find(row => row.id === receiptId);
      if (!scope.events.some(event => event.receiptId === receiptId) || !receipt) return { ...result,
        complete: false, status: 'inconsistent', reason: 'receipt-not-in-scope', data: null, coveredEventIds: [] };
      return { ...result, data: receipt };
    },
    async readCanonicalEvents(scope) {
      const result = await read(scope);
      return { ...result, data: result.complete ? result.data.events : null };
    },
  };
}
