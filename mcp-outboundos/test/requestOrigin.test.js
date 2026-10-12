import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requestOrigin } from '../src/requestOrigin.js';

function request(proxy, headers) {
  const app = express();
  app.set('trust proxy', proxy);
  return { app, socket: { remoteAddress: '127.0.0.1' }, protocol: proxy ? 'https' : 'http', get: name => headers[name] };
}

test('trusted proxy origin preserves public host/port and ignores later hosts', () => {
  assert.equal(requestOrigin(request('loopback', { host: 'localhost:3002', 'x-forwarded-host': 'crm.example.test:8443, downstream.example.test' })), 'https://crm.example.test:8443');
});

test('untrusted requests use direct Host and reject malformed discovery origins', () => {
  assert.equal(requestOrigin(request(false, { host: '[::1]:3002', 'x-forwarded-host': 'attacker.example.test' })), 'http://[::1]:3002');
  for (const host of ['', 'user:pass@example.test', 'example.test/path', 'example.test?query', 'example.test#fragment', 'example.test"']) {
    assert.throws(() => requestOrigin(request(false, { host })), { message: 'Invalid request origin', status: 400 });
  }
});
