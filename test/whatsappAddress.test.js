/**
 * WhatsApp addressing: phone numbers and business-scoped user ids (BSUIDs).
 * Run: node --test test/whatsappAddress.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isBsuid, whatsappAddress, cloudApiAddressee } from '../src/utils/whatsappAddress.js';

const digitsOnly = (value) => String(value).replace(/\D/g, '');

describe('Business-scoped user ids', () => {
  test('recognises the documented formats', () => {
    assert.equal(isBsuid('US.13491208655302741918'), true);
    assert.equal(isBsuid('IN.9812345678abcDEF'), true);
    assert.equal(isBsuid('US.ENT.11815799212886844830'), true);
  });

  test('rejects phone numbers, placeholders and junk', () => {
    for (const value of ['15551230001', '+91 98765 43210', 'no-phone:US.123', 'us.123', 'USA.123', 'US.', '', null, undefined]) {
      assert.equal(isBsuid(value), false, String(value));
    }
  });
});

describe('Where a lead is messaged', () => {
  test('the number wins when there is one', () => {
    assert.equal(whatsappAddress({ mobile: '+919876543210', waUserId: 'IN.123456' }), '+919876543210');
  });

  test('falls back to the user id for a username-only contact', () => {
    assert.equal(whatsappAddress({ mobile: 'no-phone:IN.123456', waUserId: 'IN.123456' }), 'IN.123456');
  });

  test('nowhere when neither is usable', () => {
    assert.equal(whatsappAddress({ mobile: 'no-phone:someone@example.com', waUserId: null }), null);
    assert.equal(whatsappAddress(null), null);
  });
});

describe('Cloud API addressing', () => {
  test('a number goes in `to`', () => {
    assert.deepEqual(cloudApiAddressee('+1 555-123-0001', digitsOnly), { to: '15551230001' });
  });

  test('a user id goes in `recipient`, untouched', () => {
    assert.deepEqual(cloudApiAddressee('US.13491208655302741918', digitsOnly), { recipient: 'US.13491208655302741918' });
  });

  test('nothing usable gives null', () => {
    assert.equal(cloudApiAddressee('', digitsOnly), null);
  });
});
