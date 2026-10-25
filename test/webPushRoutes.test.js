import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createWebPushRouter } from '../src/routes/webPush.js';
import { inboxViewerKey } from '../src/utils/inboxState.js';

const key = { publicKey: 'fixture-public-key', enabled: true };
const alice = { id: 7 };
const bob = { id: 8 };

async function withServer(user, rows, run) {
  const db = {
    webPushSubscription: {
      findMany: async ({ where }) => rows.filter(row => row.viewerKey === where.viewerKey),
      deleteMany: async ({ where }) => {
        const matches = row => row.id === where.id && row.viewerKey === where.viewerKey;
        const count = rows.filter(matches).length;
        rows.splice(0, rows.length, ...rows.filter(row => !matches(row)));
        return { count };
      },
    },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use(createWebPushRouter({ db, config: () => key }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('notification device inventory is personal and never exposes endpoint credentials', async () => {
  const rows = [
    { id: 1, viewerKey: inboxViewerKey(alice), enabled: true, vapidKey: key.publicKey, encryptedData: 'an-unreadable-old-subscription', endpointHash: 'private-hash', createdAt: '2026-10-23T10:00:00Z' },
    { id: 2, viewerKey: inboxViewerKey(bob), encryptedData: 'other-person-secret', createdAt: '2026-10-23T10:00:00Z' },
  ];
  await withServer(alice, rows, async base => {
    const configResponse = await fetch(`${base}/push/config`);
    assert.equal(configResponse.status, 200);
    assert.deepEqual(await configResponse.json(), key);
    const response = await fetch(`${base}/push/subscriptions`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload, { devices: [{ id: 1, label: 'Notification device', registeredAt: '2026-10-23T10:00:00Z', enabled: true, needsReconnect: false }], limit: 10 });
    assert.doesNotMatch(JSON.stringify(payload), /private-hash|encryptedData|endpoint|viewerKey|vapidKey|other-person-secret/);
  });
});

test('lost devices can be removed by safe ID without deleting another person’s device', async () => {
  const rows = [{ id: 1, viewerKey: inboxViewerKey(alice) }, { id: 2, viewerKey: inboxViewerKey(bob) }];
  await withServer(alice, rows, async base => {
    for (const id of ['2', '999']) {
      const response = await fetch(`${base}/push/subscriptions/${id}`, { method: 'DELETE' });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { removed: true });
    }
    assert.equal(rows.length, 2);
    for (const id of ['1junk', '0', '-1', '9007199254740992']) {
      assert.equal((await fetch(`${base}/push/subscriptions/${id}`, { method: 'DELETE' })).status, 400);
    }
    assert.equal((await fetch(`${base}/push/subscriptions/1`, { method: 'DELETE' })).status, 200);
    assert.deepEqual(rows, [{ id: 2, viewerKey: inboxViewerKey(bob) }]);
  });
});

test('shared service callers cannot enumerate or revoke personal push devices', async () => {
  await withServer({ id: 'mcp-service', orgId: 'service' }, [], async base => {
    assert.equal((await fetch(`${base}/push/subscriptions`)).status, 403);
    assert.equal((await fetch(`${base}/push/subscriptions/1`, { method: 'DELETE' })).status, 403);
  });
});
