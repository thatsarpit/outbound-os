import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadPhoneHref } from '../shared/leadPhone.js';

test('lead dial links preserve saved prefixes and only dial usable phone numbers', () => {
  assert.equal(leadPhoneHref(' +44 (7700) 900-123 '), 'tel:+447700900123');
  assert.equal(leadPhoneHref('09123456789'), 'tel:09123456789');
  assert.equal(leadPhoneHref('919876500001'), 'tel:919876500001');
  for (const value of [
    undefined, null, '', 'no-phone:email-1234567890', 'UK.abc1234567',
    '123456', '1234567890123456', '0000000000', '++15555550101',
    '+15555550101;ext=9', '+15555550101 dial 9', 'tel:+15555550101',
  ]) assert.equal(leadPhoneHref(value), null, String(value));
});
