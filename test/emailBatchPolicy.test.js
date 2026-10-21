import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countryAllowed, normalizeCountry, normalizeRecipientEmail, prepareBatchTemplate, renderBatchTemplate, validateBatchSettings } from '../src/utils/emailBatchPolicy.js';

const template = { id: 7, name: 'Fixture brand', subject: 'Hello {{name}}', htmlBody: '<p>{{lead.product}} to {{ country }}</p><a href="{{ unsubscribe }}">Unsubscribe</a>', textBody: '{{name}}: {{product}}' };

test('country policy resolves US/UK/Australia names and aliases and excludes blank/other countries', () => {
  const countries = ['United States', 'UK', 'Australia'];
  for (const value of ['US', 'U.S.A.', 'USA', 'United States of America', 'GB', 'GBR', 'Great Britain', 'United Kingdom', 'AU', 'AUS', ' australia ']) assert.equal(countryAllowed(value, countries), true, value);
  for (const value of ['', null, 'Canada', 'India', 'Unknown']) assert.equal(countryAllowed(value, countries), false, value);
  assert.equal(countryAllowed('US', []), false);
  assert.equal(countryAllowed('IN', ['India']), true, 'other workspaces can choose their own countries');
  assert.equal(normalizeCountry('uk'), 'United Kingdom');
});

test('batch templates use the saved content, preserve unsubscribe and fail on unsupported variables', () => {
  const prepared = prepareBatchTemplate(template);
  assert.match(prepared.htmlBody, /contact.PRODUCT/);
  assert.match(prepared.htmlBody, /\{\{ unsubscribe \}\}/);
  assert.match(prepared.subject, /contact.FIRSTNAME/);
  assert.notEqual(prepareBatchTemplate({ ...template, subject: 'Edited' }).hash, prepared.hash);
  assert.throws(() => prepareBatchTemplate({ ...template, htmlBody: '{{lead.secret}}' }), /Unsupported/);
  assert.throws(() => prepareBatchTemplate(null), /saved email template/);
  const rendered = renderBatchTemplate(template, { name: 'Buyer', product: '<script> & "quotes"', country: 'UK' });
  assert.equal(rendered.subject, 'Hello Buyer');
  assert.match(rendered.htmlBody, /&lt;script&gt; &amp; &quot;quotes&quot;/);
  assert.match(rendered.htmlBody, /\{\{ unsubscribe \}\}/);
  assert.equal(rendered.textBody, 'Buyer: <script> & "quotes"');
});

test('settings validation normalizes countries and rejects partial or ambiguous numeric input', () => {
  const fields = Object.fromEntries(validateBatchSettings({ countries: ['US', 'USA', 'UK', 'Australia'], senderIds: [1, 1, 2], templateId: 7, batchSize: 200, perSenderQuota: 50 }));
  assert.deepEqual(JSON.parse(fields['email.daily.countries']), ['United States', 'United Kingdom', 'Australia']);
  assert.deepEqual(JSON.parse(fields['email.daily.sender_ids']), [1, 2]);
  for (const bad of [{ enabled: true, batchSize: 0 }, { senderIds: ['1'] }, { countries: 'US' }, { countries: [null] }, { templateId: '7' }, { perSenderQuota: 151 }, { brevoFolderId: '12abc' }, { enabled: 'false' }]) assert.throws(() => validateBatchSettings(bad));
  assert.equal(normalizeRecipientEmail(' Buyer@EXAMPLE.test '), 'buyer@example.test');
  assert.equal(normalizeRecipientEmail('missing-domain'), '');
});
