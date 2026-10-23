import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialState, metaCredentialPair, providerOf, publicCredentialSummary } from '../src/services/whatsappProviders.js';

const env = { META_PHONE_NUMBER_ID: 'env-phone', META_ACCESS_TOKEN: 'env-token' };

describe('Direct Meta credentials', () => {
  test('requires a complete phone and token pair', () => {
    assert.equal(providerOf({}), 'meta');
    assert.equal(credentialState({ cloudApiPhoneId: 'phone' }, {}).ready, false);
    assert.deepEqual(credentialState({ cloudApiPhoneId: 'phone', cloudApiToken: 'token' }, {}), {
      provider: 'meta', session: true, templates: true, ready: true,
    });
  });

  test('falls back to the environment only when no account credentials exist', () => {
    assert.deepEqual(metaCredentialPair({}, env), { phoneNumberId: 'env-phone', token: 'env-token' });
    assert.equal(metaCredentialPair({ cloudApiPhoneId: 'account-phone' }, env), null);
    assert.equal(metaCredentialPair({ cloudApiToken: 'account-token' }, env), null);
    assert.deepEqual(metaCredentialPair({ cloudApiPhoneId: 'account-phone', cloudApiToken: 'account-token' }, env), {
      phoneNumberId: 'account-phone', token: 'account-token',
    });
  });

  test('unknown transports cannot borrow the Meta fallback', () => {
    assert.equal(credentialState({ provider: 'retired-provider' }, env).ready, false);
    assert.equal(metaCredentialPair({ provider: 'retired-provider', cloudApiPhoneId: 'phone', cloudApiToken: 'token' }, env), null);
  });

  test('the browser summary contains only public metadata', () => {
    const summary = publicCredentialSummary({ provider: 'meta', cloudApiPhoneId: 'phone', cloudApiToken: 'secret-token' });
    assert.equal(JSON.stringify(summary).includes('secret-token'), false);
    assert.equal(summary.metaPhoneNumberId, 'phone');
    assert.equal(summary.providerLabel, 'Meta WhatsApp Cloud API');
  });
});
