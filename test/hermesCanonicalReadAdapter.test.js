import { test } from 'node:test';
import assert from 'node:assert/strict';

const now = 1800000000000;
const source = 'synthetic-crm';
function scope() {
  return { source, conversationKey: 'whatsapp:1:lead:7', channel: 'whatsapp', accountId: 1,
    events: [{ id: 'message:11:received', eventType: 'message.received', channel: 'whatsapp',
      accountId: 1, leadId: 7, messageId: 11, receiptId: null, createdAt: now - 1000 }] };
}

function snapshot(request = scope()) {
  return { available: true,
    provenance: { source, snapshotId: 'synthetic-revision-1', observedAt: now },
    conversationKey: request.conversationKey, channel: request.channel, accountId: request.accountId,
    events: { complete: true, records: structuredClone(request.events) },
    receipts: { complete: true, records: [] },
    history: { complete: true, hasMore: false, gaps: [], messages: [
      { id: 10, leadId: 7, channel: 'whatsapp', accountId: 1, direction: 'outbound',
        body: 'Synthetic earlier reply', attachments: [], contentComplete: true },
      { id: 11, leadId: 7, channel: 'whatsapp', accountId: 1, direction: 'inbound',
        body: 'Synthetic inbound question', attachments: [], contentComplete: true },
    ] } };
}

test('one complete synthetic snapshot provides canonical event reads and full bidirectional context', async () => {
  const { createCanonicalReadAdapter } = await import('../src/services/hermesCanonicalReadAdapter.js');
  const calls = [];
  const adapter = createCanonicalReadAdapter({ source, clock: () => now,
    readSnapshot: async request => { calls.push(request); return snapshot(request); } });
  const result = await adapter.readContext(scope());
  assert.equal(result.status, 'complete');
  assert.equal(result.available, true);
  assert.equal(result.complete, true);
  assert.deepEqual(result.provenance, snapshot().provenance);
  assert.deepEqual(result.coveredEventIds, ['message:11:received']);
  assert.deepEqual(result.data.messages, snapshot().history.messages);
  assert.deepEqual(result.data.events, scope().events);
  assert.deepEqual(result.data.receipts, []);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], scope());
  const events = await adapter.readCanonicalEvents(scope());
  assert.deepEqual(events.data, scope().events);
  assert.equal(events.complete, true);
  assert.equal(calls.length, 2, 'each independent read gets its own consistent snapshot');
});

function receiptFixture() {
  const request = { source, conversationKey: 'email:2:receipt:19', channel: 'email', accountId: 2,
    events: [{ id: 'receipt:19:unmatched', eventType: 'inbound.receipt_unmatched', channel: 'email',
      accountId: 2, leadId: null, messageId: null, receiptId: 19, createdAt: now - 500 }] };
  const value = snapshot(request);
  value.history.messages = [];
  value.receipts.records = [{ id: 19, channel: 'email', accountId: 2, state: 'unmatched',
    leadId: null, messageId: null, body: 'Synthetic unknown sender', attachments: [], contentComplete: true }];
  return { request, value };
}

test('unmatched receipt remains receipt-scoped without inventing a lead or transcript', async () => {
  const { createCanonicalReadAdapter } = await import('../src/services/hermesCanonicalReadAdapter.js');
  const { request, value } = receiptFixture();
  const adapter = createCanonicalReadAdapter({ source, clock: () => now, readSnapshot: async () => value });
  const receipt = await adapter.readUnmatchedReceipt(request, 19);
  assert.equal(receipt.complete, true);
  assert.deepEqual(receipt.data, value.receipts.records[0]);
  const context = await adapter.readContext(request);
  assert.deepEqual(context.data.messages, []);
  assert.equal(context.conversationKey, 'email:2:receipt:19');
  const other = await adapter.readUnmatchedReceipt(request, 20);
  assert.equal(other.complete, false);
  assert.equal(other.data, null);
  assert.equal(other.reason, 'receipt-not-in-scope');
});

test('partial history, pagination, migration gaps and unavailable content cannot attest completeness', async () => {
  const { createCanonicalReadAdapter } = await import('../src/services/hermesCanonicalReadAdapter.js');
  const mutations = [
    value => { value.events.complete = false; },
    value => { value.receipts.complete = false; },
    value => { value.history.complete = false; },
    value => { value.history.hasMore = true; },
    value => { value.history.gaps = ['synthetic-provider-migration-gap']; },
    value => { delete value.history.gaps; },
    value => { value.history.messages[0].contentComplete = false; },
    value => { value.history.messages[1].attachments = [{ available: false }]; },
  ];
  for (const mutate of mutations) {
    const value = snapshot(); mutate(value);
    const adapter = createCanonicalReadAdapter({ source, clock: () => now, readSnapshot: async () => value });
    for (const read of [adapter.readContext, adapter.readCanonicalEvents]) {
      const result = await read(scope());
      assert.equal(result.status, 'incomplete');
      assert.equal(result.complete, false);
      assert.equal(result.available, true);
      assert.equal(result.data, null);
      assert.deepEqual(result.coveredEventIds, []);
      assert.deepEqual(result.provenance, value.provenance);
    }
  }
});

test('unavailable, malformed and throwing sources fail closed without exposing source errors', async () => {
  const { createCanonicalReadAdapter } = await import('../src/services/hermesCanonicalReadAdapter.js');
  for (const value of [null, undefined, {}, { available: false }, { ...snapshot(), events: null }]) {
    const adapter = createCanonicalReadAdapter({ source, clock: () => now, readSnapshot: async () => value });
    const result = await adapter.readContext(scope());
    assert.equal(result.complete, false);
    assert.equal(result.data, null);
    assert.deepEqual(result.coveredEventIds, []);
  }
  const adapter = createCanonicalReadAdapter({ source, readSnapshot: async () => { throw Error('private secret'); } });
  const result = await adapter.readContext(scope());
  assert.equal(result.reason, 'source-read-failed');
  assert.equal(JSON.stringify(result).includes('private secret'), false);
});

test('scope and canonical references are validated before calling a source', async () => {
  const { createCanonicalReadAdapter } = await import('../src/services/hermesCanonicalReadAdapter.js');
  let calls = 0;
  const adapter = createCanonicalReadAdapter({ source, clock: () => now, readSnapshot: async () => { calls++; return snapshot(); } });
  const mutations = [r => { r.source = 'other'; }, r => { r.events = []; },
    r => { r.events[0].id = 'message:011:received'; }, r => { r.accountId = 2; },
    r => { r.events[0].leadId = 8; }, r => { r.events.push(r.events[0]); },
    r => { r.events[0].createdAt = Infinity; }, r => { r.events[0].receiptId = 1; },
    r => { r.events[0].body = 'not-reference-only'; }];
  for (const mutate of mutations) {
    const request = scope(); mutate(request);
    const result = await adapter.readContext(request);
    assert.equal(result.status, 'invalid-request');
    assert.equal(result.data, null);
  }
  assert.equal((await adapter.readContext(null)).status, 'invalid-request');
  assert.equal(calls, 0);
});

test('untrusted, stale, future or inconsistent snapshot provenance is rejected', async () => {
  const { createCanonicalReadAdapter } = await import('../src/services/hermesCanonicalReadAdapter.js');
  const mutations = [v => { delete v.provenance; }, v => { v.provenance.source = 'other'; },
    v => { v.provenance.snapshotId = ''; }, v => { v.provenance.observedAt = now - 300001; },
    v => { v.provenance.observedAt = now + 1; }, v => { v.channel = 'email'; },
    v => { v.accountId = 2; }, v => { v.conversationKey = 'other'; },
    v => { v.events.records = []; }, v => { v.events.records[0].createdAt--; },
    v => { v.events.records.push(v.events.records[0]); }];
  for (const mutate of mutations) {
    const value = snapshot(); mutate(value);
    const result = await createCanonicalReadAdapter({ source, clock: () => now,
      readSnapshot: async () => value }).readContext(scope());
    assert.equal(result.status, 'inconsistent');
    assert.equal(result.complete, false);
    assert.equal(result.data, null);
    assert.equal(result.provenance, null);
    assert.deepEqual(result.coveredEventIds, []);
  }
});

test('missing, cross-scope, duplicate or misassociated canonical content is rejected', async () => {
  const { createCanonicalReadAdapter } = await import('../src/services/hermesCanonicalReadAdapter.js');
  const mutations = [v => { v.history.messages.pop(); }, v => { v.history.messages[1].direction = 'outbound'; },
    v => { v.history.messages[0].leadId = 8; }, v => { v.history.messages[0].accountId = 2; },
    v => { v.history.messages[0].channel = 'email'; }, v => { v.history.messages.push(v.history.messages[0]); },
    v => { v.history.messages[0] = null; }, v => { v.history.messages[0].body = null; }];
  for (const mutate of mutations) {
    const value = snapshot(); mutate(value);
    const result = await createCanonicalReadAdapter({ source, clock: () => now,
      readSnapshot: async () => value }).readContext(scope());
    assert.equal(result.complete, false);
    assert.equal(result.data, null);
    assert.deepEqual(result.coveredEventIds, []);
  }
  for (const mutate of [v => { v.receipts.records = []; }, v => { v.receipts.records[0].leadId = 7; },
    v => { v.receipts.records[0].state = 'matched'; }, v => { v.history.messages = snapshot().history.messages; }]) {
    const { request, value } = receiptFixture(); mutate(value);
    const result = await createCanonicalReadAdapter({ source, clock: () => now,
      readSnapshot: async () => value }).readUnmatchedReceipt(request, 19);
    assert.equal(result.complete, false);
    assert.equal(result.data, null);
  }
});

test('snapshot consistency must be explicitly attested and cover event capture time', async () => {
  const { createCanonicalReadAdapter } = await import('../src/services/hermesCanonicalReadAdapter.js');
  for (const mutate of [v => { delete v.provenance.consistent; }, v => { v.provenance.consistent = false; },
    v => { v.provenance.observedAt = now - 2000; }, v => { v.history.messages[0].attachments = [null]; }]) {
    const value = snapshot(); mutate(value);
    const result = await createCanonicalReadAdapter({ source, clock: () => now,
      readSnapshot: async () => value }).readContext(scope());
    assert.equal(result.complete, false);
    assert.equal(result.data, null);
  }
});

test('missing future source fails closed without inventing canonical context', async () => {
  const { createCanonicalReadAdapter } = await import('../src/services/hermesCanonicalReadAdapter.js');
  const adapter = createCanonicalReadAdapter({ source, clock: () => now });
  const result = await adapter.readContext(scope());
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'missing-source-capability');
  assert.equal(result.available, false);
  assert.equal(result.complete, false);
  assert.equal(result.data, null);
  assert.equal(result.provenance, null);
  assert.deepEqual(result.coveredEventIds, []);
});
