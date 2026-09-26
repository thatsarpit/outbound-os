import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { credentialState, providerOf, publicCredentialSummary } from '../src/services/whatsappProviders.js';

const noEnv = {};

describe('WhatsApp provider credentials', () => {
  test('defaults to Meta when an account does not say', () => {
    assert.equal(providerOf({}), 'meta');
    assert.equal(providerOf({ provider: 'aisensy' }), 'aisensy');
    assert.equal(providerOf({ provider: 'something-else' }), 'meta');
  });

  test('Meta needs both the phone number id and the token', () => {
    assert.equal(credentialState({ provider: 'meta', cloudApiPhoneId: '123' }, noEnv).ready, false);
    const ready = credentialState({ provider: 'meta', cloudApiPhoneId: '123', cloudApiToken: 'enc' }, noEnv);
    assert.deepEqual(ready, { provider: 'meta', session: true, templates: true, ready: true });
  });

  test('Meta falls back to the single-account env credentials', () => {
    const env = { META_PHONE_NUMBER_ID: '123', META_ACCESS_TOKEN: 'token' };
    assert.equal(credentialState({ provider: 'meta' }, env).ready, true);
  });

  test('AiSensy can send templates without session credentials, and the reverse', () => {
    const templatesOnly = credentialState({ provider: 'aisensy', aisensyCampaignApiKey: 'enc' }, noEnv);
    assert.deepEqual(templatesOnly, { provider: 'aisensy', session: false, templates: true, ready: true });
    const sessionOnly = credentialState({ provider: 'aisensy', aisensyProjectId: 'p', aisensyApiKey: 'enc' }, noEnv);
    assert.deepEqual(sessionOnly, { provider: 'aisensy', session: true, templates: false, ready: true });
  });

  test('Meta credentials on an AiSensy account do not make it ready', () => {
    const state = credentialState({ provider: 'aisensy', cloudApiPhoneId: '123', cloudApiToken: 'enc' }, noEnv);
    assert.equal(state.ready, false);
  });

  test('the browser summary never includes a secret', () => {
    const summary = publicCredentialSummary({
      provider: 'meta', cloudApiPhoneId: '123', cloudApiToken: 'secret-token', aisensyApiKey: 'secret-key',
    });
    assert.equal(JSON.stringify(summary).includes('secret'), false);
    assert.equal(summary.metaPhoneNumberId, '123');
  });
});
