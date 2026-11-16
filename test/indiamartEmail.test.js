import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndiaMartFirstTouchEmail } from '../src/templates/indiamartFirstTouch.js';
const profile = { businessName: 'Fixture Medicals', businessCity: 'Fixture City', businessCountry: 'India', senderSignature: 'Fixture Team' };

test('new enquiry copy acknowledges quantity, uses the configured identity and keeps unsubscribe handling', () => {
  const email = buildIndiaMartFirstTouchEmail({ name: 'Example Buyer', product: 'Fixture product', quantity: '2 boxes', country: 'Spain' }, profile);
  assert.equal(email.subject, 'Your IndiaMART enquiry: Fixture product');
  assert.match(email.textBody, /Hi Example/);
  assert.match(email.textBody, /noted your requested quantity as 2 boxes/);
  assert.match(email.textBody, /destination in Spain/);
  assert.match(email.textBody, /Fixture Medicals/);
  assert.match(email.textBody, /reply with "Unsubscribe"/);
  assert.doesNotMatch(email.textBody, /\{\{/);
  assert.doesNotMatch(email.textBody, /still need|contacted us earlier/i);
});
test('missing fields and untrusted text cannot inject HTML or email headers', () => {
  const empty = buildIndiaMartFirstTouchEmail({}, profile);
  assert.match(empty.textBody, /Hi there/); assert.match(empty.textBody, /share the quantity/);
  assert.match(empty.textBody, /confirm the delivery country/);
  const bad = buildIndiaMartFirstTouchEmail({ name: '<script>alert(1)</script>', product: 'Item\r\nBcc: other@example.test', quantity: '<img onerror=alert(1)>' }, profile);
  assert.doesNotMatch(bad.subject, /[\r\n]/);
  assert.doesNotMatch(bad.htmlBody, /<script\b|<img\b/i);
  assert.match(bad.htmlBody, /&lt;script&gt;/);
});
