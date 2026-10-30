import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { ycloudSignatureValid, ycloudSendPayload, ycloudPricing } from '../src/utils/ycloudWebhook.js';
import { credentialState, publicWhatsAppAccount } from '../src/services/whatsappProviders.js';

test('YCloud signatures authenticate exact bytes and expire', () => {
  const now = 1793232000000;
  const timestamp = String(now / 1000);
  const raw = Buffer.from('{"type":"example", "id":"event-1"}');
  const signature = createHmac('sha256', 'fixture-secret').update(`${timestamp}.`).update(raw).digest('hex');
  const header = `t=${timestamp},s=${signature}`;
  assert.equal(ycloudSignatureValid(raw, header, 'fixture-secret', now), true);
  assert.equal(ycloudSignatureValid(Buffer.from('{}'), header, 'fixture-secret', now), false);
  assert.equal(ycloudSignatureValid(raw, header, 'other-secret', now), false);
  assert.equal(ycloudSignatureValid(raw, header, '', now), false);
  assert.equal(ycloudSignatureValid(raw, `t=${timestamp},s=short`, 'fixture-secret', now), false);
  assert.equal(ycloudSignatureValid(raw, header, 'fixture-secret', now + 301000), false);
});

test('YCloud does not borrow direct Meta credentials and never exposes keys', () => {
  const account = { provider: 'ycloud', ycloudPhoneNumber: '+15550000001', ycloudWabaId: '1234567', ycloudApiKey: 'private-key', ycloudWebhookSecret: 'private-hook' };
  assert.equal(credentialState(account, {}).ready, true);
  assert.equal(credentialState({ ...account, ycloudApiKey: '' }, { META_ACCESS_TOKEN: 'meta-token', META_PHONE_NUMBER_ID: 'id' }).ready, false);
  const safe = publicWhatsAppAccount({ ...account, cloudApiToken: 'private-meta' });
  for (const secret of ['private-key', 'private-hook', 'private-meta']) assert.equal(JSON.stringify(safe).includes(secret), false);
  assert.equal(safe.ycloudWebhookConfigured, true);
  assert.equal(safe.metaConfigured, false);
});

test('YCloud payload preserves body/template and business-scoped destinations', () => {
  const template = { name: 'example_update', language: { code: 'en' } };
  assert.deepEqual(ycloudSendPayload({ messaging_product: 'whatsapp', recipient_type: 'individual', to: '15550000002', type: 'template', template }, '+15550000001'), {
    from: '+15550000001', to: '+15550000002', type: 'template', template,
  });
  assert.deepEqual(ycloudSendPayload({ recipient: 'US.fixture', type: 'text', text: { body: 'Hello' } }, '+15550000001'), {
    from: '+15550000001', recipient: 'US.fixture', type: 'text', text: { body: 'Hello' },
  });
});

test('YCloud estimated zero prices are not reported as final free delivery', () => {
  assert.equal(ycloudPricing({ status: 'sent', totalPrice: 0 }).billable, undefined);
  assert.equal(ycloudPricing({ status: 'delivered', totalPrice: 0 }).billable, false);
  assert.equal(ycloudPricing({ status: 'read', totalPrice: 0.02 }).billable, true);
  assert.equal(ycloudPricing({ status: 'read', totalPrice: '0' }).billable, undefined);
});


test('provider error facts preserve Meta/YCloud diagnostics and redact the API key', async () => {
  const { whatsappProviderError } = await import('../src/utils/whatsappProviderError.js');
  const result = whatsappProviderError({ error: { code: 'BAD_REQUEST', message: 'Wrapper', requestId: 'req_fixture', whatsappApiError: { code: '131047', error_data: { details: 'Session expired secret-fixture-key' } } } }, 400, 'secret-fixture-key');
  assert.deepEqual(result, { rawError: 'Session expired [redacted]', errorCode: '131047', requestId: 'req_fixture' });
  assert.equal(whatsappProviderError({ status: 'failed', errorCode: 'PARAM_INVALID', errorMessage: 'Invalid destination' }, 200).errorCode, 'PARAM_INVALID');
  assert.equal(whatsappProviderError({ whatsappApiError: { code: 100, message: 'Bad input' } }, 400).rawError, 'Bad input');
  assert.equal(whatsappProviderError({}, 503).rawError, 'HTTP 503');
  assert.equal(whatsappProviderError({ error: { code: 100, message: 'Invalid parameter', fbtrace_id: 'trace_fixture' } }, 400).requestId, 'trace_fixture');
});
