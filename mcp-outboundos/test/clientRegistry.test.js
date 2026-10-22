import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClientRegistry } from '../src/clientRegistry.js';

test('full registration metadata evicts older entries instead of disabling onboarding', () => {
  let now = 0;
  const registry = new ClientRegistry({ capacity: 2, ttlMs: 100, now: () => now });
  registry.set('first', { name: 'first' });
  registry.set('second', { name: 'second' });
  registry.set('third', { name: 'third' });
  assert.equal(registry.get('first'), undefined);
  assert.equal(registry.get('second').name, 'second');
  assert.equal(registry.get('third').name, 'third');
  assert.equal(registry.entries.size, 2);
  now = 100;
  assert.equal(registry.get('third'), undefined);
  registry.set('fresh', { name: 'fresh' });
  assert.equal(registry.entries.size, 1);
  assert.equal(registry.get('fresh').name, 'fresh');
});
