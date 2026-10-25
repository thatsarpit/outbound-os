import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDashboardFileRequest } from '../src/utils/dashboardRequest.js';

test('dashboard file classification follows case-insensitive reserved service routes', () => {
  for (const path of ['/api', '/api/', '/API/auth/config', '/webhook', '/webhook/meta', '/WEBHOOK/meta', '/health', '/health/', '/HEALTHZ', '/healthz/']) {
    assert.equal(isDashboardFileRequest({ method: 'GET', path }), false, path);
    assert.equal(isDashboardFileRequest({ method: 'HEAD', path }), false, path);
  }
  for (const path of ['/', '/m/inbox', '/assets/app.js', '/app-icon.svg', '/apiary', '/webhook-status', '/healthy']) {
    assert.equal(isDashboardFileRequest({ method: 'GET', path }), true, path);
    assert.equal(isDashboardFileRequest({ method: 'HEAD', path }), true, path);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    assert.equal(isDashboardFileRequest({ method, path: '/' }), false, method);
  }
});
