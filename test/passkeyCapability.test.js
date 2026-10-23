import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPasskeyCapability, passkeyAvailability, passkeyErrorMessage, passkeysEnabled } from '../web/src/lib/passkey-capability.ts';

const environment = enabled => ({ user_settings: { attributes: { passkey: { enabled } } } });

test('passkey capability requires an explicit boolean from public identity settings', () => {
  assert.equal(passkeysEnabled(environment(true)), true);
  assert.equal(passkeysEnabled({ response: environment(false) }), false);
  for (const payload of [null, {}, { response: null }, environment('true'), environment(1), { passkeys: true }, { user_settings: { passkey_settings: { show_sign_in_button: true } } }]) {
    assert.equal(passkeysEnabled(payload), null);
  }
});

test('public capability lookup sends no cookies or workspace credentials and fails closed', async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url.href, 'https://identity.example.test/v1/environment');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Accept, 'application/json');
    assert.ok(options.signal);
    return new Response(JSON.stringify({ response: environment(true) }), { headers: { 'Content-Type': 'application/json' } });
  };
  assert.equal(await loadPasskeyCapability('identity.example.test', fetcher), true);
  assert.equal(calls, 1);
  for (const host of ['http://identity.example.test', 'https://user:password@identity.example.test', 'https://identity.example.test?token=value', 'https://identity.example.test/some/path']) {
    await assert.rejects(() => loadPasskeyCapability(host, fetcher));
  }
  assert.equal(calls, 1, 'invalid URLs never trigger a request');
  await assert.rejects(() => loadPasskeyCapability('identity.example.test', async () => new Response('', { status: 503 })));
});

test('passkey enrollment is blocked on public development deployments and unsupported browsers', () => {
  const config = { enabled: true, secureContext: true, webAuthn: true, instanceType: 'production', hostname: 'app.example.test' };
  assert.equal(passkeyAvailability(config), 'available');
  assert.equal(passkeyAvailability({ ...config, instanceType: 'development' }), 'production_setup_needed');
  assert.equal(passkeyAvailability({ ...config, instanceType: undefined }), 'production_setup_needed');
  assert.equal(passkeyAvailability({ ...config, instanceType: 'development', hostname: 'localhost' }), 'available');
  assert.equal(passkeyAvailability({ ...config, enabled: false }), 'disabled');
  assert.equal(passkeyAvailability({ ...config, enabled: null }), 'unknown');
  assert.equal(passkeyAvailability({ ...config, secureContext: false }), 'unsupported');
  assert.equal(passkeyAvailability({ ...config, webAuthn: false }), 'unsupported');
});

test('passkey errors distinguish cancelled prompts and domain setup from success', () => {
  assert.match(passkeyErrorMessage({ name: 'NotAllowedError' }), /cancelled or timed out/);
  assert.match(passkeyErrorMessage({ code: 'passkey_not_allowed' }), /email sign-in is still available/);
  assert.match(passkeyErrorMessage({ name: 'SecurityError' }), /not configured/);
  assert.match(passkeyErrorMessage(new Error('A provider detail that should not leak')),
    /could not be added/);
  assert.doesNotMatch(passkeyErrorMessage(new Error('A provider detail that should not leak')), /provider detail/);
});
