import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, actor, NOW, signedBatch, scope, storeOptions, completionSecret } from './helpers/hermesHarness.js';

test('separate processes contend for one sender claim without duplicating event assignment', { timeout: 20000 }, async () => {
  const f = harness();
  try {
    f.message();
    const a = actor(f, 'claim'), b = actor(f, 'claim');
    await Promise.all([a.wait('ready'), b.wait('ready')]);
    a.send({ action: 'go', now: NOW }); b.send({ action: 'go', now: NOW });
    const results = await Promise.all([a.wait('result'), b.wait('result')]);
    assert.notEqual(a.pid, b.pid);
    assert.ok(results.every(r => r.pid !== process.pid));
    assert.equal(results.filter(r => r.value !== null).length, 1);
    assert.equal(f.db.prepare('SELECT count(*) n FROM HermesEventBatch').get().n, 1);
    assert.equal(f.db.prepare('SELECT count(*) n FROM HermesInboundEvent WHERE batchId IS NOT NULL').get().n, 1);
  } finally { await f.close(); }
});

test('committed sender lease survives owner death with stable replay and stale-token fencing', { timeout: 20000 }, async () => {
  const f = harness();
  try {
    f.message();
    const child = actor(f, 'claim');
    await child.wait('ready'); child.send({ action: 'go', now: NOW });
    const original = (await child.wait('result')).value;
    assert.equal((await child.stop()).signal, 'SIGKILL');
    assert.equal(f.store.claim(NOW + storeOptions.leaseMs - 1), null);
    const successor = actor(f, 'claim');
    await successor.wait('ready'); successor.send({ action: 'go', now: NOW + storeOptions.leaseMs });
    const replay = (await successor.wait('result')).value;
    assert.equal(replay.id, original.id); assert.equal(replay.body, original.body);
    assert.notEqual(replay.leaseToken, original.leaseToken);
    assert.equal(replay.attempts, 2);
    assert.equal(f.store.accept(original.id, original.leaseToken, NOW + storeOptions.leaseMs), false);
    assert.equal(f.store.retry(original.id, original.leaseToken, { now: NOW + storeOptions.leaseMs }), false);
    assert.equal(f.store.accept(replay.id, replay.leaseToken, NOW + storeOptions.leaseMs), true);
    assert.equal(f.store.claim(NOW + 10 * storeOptions.leaseMs), null, 'accepted ownership does not expire');
  } finally { await f.close(); }
});

test('separate receiver processes enforce exclusivity and fence a late model result after expiry', { timeout: 20000 }, async () => {
  const f = harness();
  try {
    f.message(); const batch = f.store.claim(NOW);
    f.inbox.receive(signedBatch(batch));
    const first = actor(f, 'paused-draft'), second = actor(f, 'run');
    await Promise.all([first.wait('ready'), second.wait('ready')]);
    first.send({ action: 'go', now: NOW });
    const started = await first.wait('draft-started');
    assert.equal(started.value.conversationKey, 'whatsapp:1:lead:1');
    second.send({ action: 'go', now: NOW });
    assert.equal((await second.wait('result')).value.state, 'idle');
    assert.equal(f.inbox.get(batch.id).state, 'processing');
    second.send({ action: 'go', now: NOW + scope.leaseMs });
    assert.equal((await second.wait('result')).value.state, 'idle');
    first.send({ action: 'release', now: NOW + scope.leaseMs });
    assert.equal((await first.wait('result')).value.state, 'stale');
    assert.equal(f.inbox.get(batch.id).state, 'uncertain');
    assert.equal(f.inbox.getDraft(batch.id), undefined);
    assert.throws(() => f.inbox.completionReceipt(batch.id, { completionSecret, now: NOW + scope.leaseMs }), /persisted drafted/);
  } finally { await f.close(); }
});

test('receiver death after model entry retains uncertain ownership and never redrafts later conversation work', { timeout: 20000 }, async () => {
  const f = harness();
  try {
    f.message(); const batch = f.store.claim(NOW);
    f.inbox.receive(signedBatch(batch));
    const value = JSON.parse(batch.body);
    const later = { id: randomUUID() };
    value.event_id = later.id;
    value.events[0].messageId = 200;
    value.events[0].id = 'message:200:received';
    later.body = JSON.stringify(value);
    f.inbox.receive(signedBatch(later));
    const child = actor(f, 'paused-draft');
    await child.wait('ready'); child.send({ action: 'go', now: NOW });
    await child.wait('draft-started');
    assert.equal(f.inbox.get(batch.id).state, 'processing');
    assert.equal((await child.stop()).signal, 'SIGKILL');
    const successor = actor(f, 'run');
    await successor.wait('ready'); successor.send({ action: 'go', now: NOW + scope.leaseMs });
    assert.equal((await successor.wait('result')).value.state, 'idle');
    assert.equal(f.inbox.get(batch.id).state, 'uncertain');
    assert.equal(f.inbox.get(later.id).state, 'queued');
    assert.equal(f.receiver.prepare('SELECT count(*) n FROM HermesShadowDraft').get().n, 0);
    assert.throws(() => f.inbox.completionReceipt(batch.id, { completionSecret, now: NOW + scope.leaseMs }), /persisted drafted/);
  } finally { await f.close(); }
});

test('persisted draft survives receiver death and lost ACK replay without duplicate draft or completion effect', { timeout: 20000 }, async () => {
  const f = harness();
  try {
    f.message(); const batch = f.store.claim(NOW);
    const child = actor(f, 'receive-run');
    await child.wait('ready'); child.send({ action: 'go', now: NOW, batch });
    assert.equal((await child.wait('result')).value.state, 'drafted');
    assert.equal((await child.stop()).signal, 'SIGKILL');
    // The receiver committed, but the sender never recorded the transport ACK.
    const replay = f.store.claim(NOW + storeOptions.leaseMs);
    assert.equal(replay.id, batch.id); assert.equal(replay.body, batch.body);
    const successor = actor(f, 'receive-run');
    await successor.wait('ready'); successor.send({ action: 'go', now: NOW + storeOptions.leaseMs, batch: replay });
    assert.equal((await successor.wait('received')).value.duplicate, true);
    assert.equal((await successor.wait('result')).value.state, 'idle');
    assert.equal(f.receiver.prepare('SELECT count(*) n FROM HermesShadowDraft').get().n, 1);
    const now = NOW + storeOptions.leaseMs;
    const completionScope = { completionSecret, source: scope.source, route: scope.route };
    const receipt = f.inbox.completionReceipt(batch.id, { completionSecret, now });
    assert.throws(() => f.store.receiveCompletion({ ...receipt, now }, completionScope), /accepted/);
    assert.equal(f.store.accept(replay.id, replay.leaseToken, now), true);
    assert.equal(f.store.receiveCompletion({ ...receipt, now }, completionScope).duplicate, false);
    const fresh = f.inbox.completionReceipt(batch.id, { completionSecret, now: now + 1000 });
    assert.deepEqual(fresh.body, receipt.body);
    assert.equal(f.store.receiveCompletion({ ...fresh, now: now + 1000 }, completionScope).duplicate, true);
    assert.equal(f.db.prepare('SELECT count(*) n FROM HermesEventBatch WHERE state=\'completed\'').get().n, 1);
  } finally { await f.close(); }
});

test('receiver processes preserve FIFO under clock reversal while a different account proceeds', { timeout: 20000 }, async () => {
  const f = harness();
  try {
    f.message(); const batch = f.store.claim(NOW);
    const first = JSON.parse(batch.body);
    const next = (id, accountId) => {
      const value = structuredClone(first);
      value.event_id = randomUUID();
      value.conversation_key = `whatsapp:${accountId}:lead:1`;
      value.events[0].id = `message:${id}:received`; value.events[0].messageId = id;
      value.events[0].accountId = accountId;
      return { id: value.event_id, body: JSON.stringify(value) };
    };
    const later = next(200, 1), other = next(201, 2);
    f.inbox.receive(signedBatch(batch));
    f.inbox.receive(signedBatch(later, NOW - 1000));
    f.inbox.receive(signedBatch(other, NOW - 2000));
    const a = actor(f, 'paused-draft'), b = actor(f, 'run');
    await Promise.all([a.wait('ready'), b.wait('ready')]);
    a.send({ action: 'go', now: NOW });
    assert.equal((await a.wait('draft-started')).value.events[0].id, first.events[0].id);
    b.send({ action: 'go', now: NOW });
    const independent = (await b.wait('result')).value;
    assert.equal(independent.state, 'drafted');
    assert.equal(f.inbox.get(other.id).state, 'drafted');
    assert.equal(f.inbox.get(later.id).state, 'queued');
    a.send({ action: 'release', now: NOW });
    assert.equal((await a.wait('result')).value.state, 'drafted');
    b.send({ action: 'go', now: NOW });
    assert.equal((await b.wait('result')).value.state, 'drafted');
    assert.equal(f.inbox.get(later.id).state, 'drafted');
    assert.equal(f.receiver.prepare('SELECT count(*) n FROM HermesShadowDraft').get().n, 3);
  } finally { await f.close(); }
});

for (const journal of ['WAL', 'DELETE']) test(`SIGKILL rolls back uncommitted ingress and its event (${journal}/FULL)`, { timeout: 20000 }, async () => {
  const f = harness({ journal });
  try {
    const child = actor(f, 'uncommitted-ingress');
    await child.wait('ready'); child.send({ action: 'go', now: NOW });
    assert.deepEqual((await child.wait('transaction-open')).value, { messages: 1, events: 1 });
    assert.equal(f.db.prepare('SELECT count(*) n FROM Message').get().n, 0);
    assert.equal((await child.stop()).signal, 'SIGKILL');
    assert.equal(f.db.prepare('SELECT count(*) n FROM Message').get().n, 0);
    assert.equal(f.db.prepare('SELECT count(*) n FROM HermesInboundEvent').get().n, 0);
    assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
    f.message(); assert.ok(f.store.claim(NOW), 'abandoned writer lock is released');
  } finally { await f.close(); }
});
