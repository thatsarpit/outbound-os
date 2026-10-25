import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadViews, saveViews } from '../web/src/lib/saved-views.ts';

test('saved lead views isolate accounts and workspaces in a shared browser', () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const view = [{ id: 'fixture', name: 'My open leads', filters: { status: 'new' } }];
  saveViews(view, 'clerk:org_a:user_one');
  assert.deepEqual(loadViews('clerk:org_a:user_one'), view);
  assert.deepEqual(loadViews('clerk:org_a:user_two'), []);
  assert.deepEqual(loadViews('clerk:org_b:user_one'), []);
  values.set('outboundos_leads_views', JSON.stringify(view));
  assert.deepEqual(loadViews('local:99'), [], 'legacy unscoped presets are not attributed to a different person');
  delete globalThis.localStorage;
  assert.deepEqual(loadViews('local:99'), []);
});
