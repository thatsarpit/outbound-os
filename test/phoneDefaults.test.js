import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { defaultCountryCode, withDefaultCountryCode } from '../src/utils/phoneDefaults.js';

describe('home country code for numbers entered without one', () => {
  test('leaves numbers alone when no home code is set', () => {
    const env = {};
    assert.equal(withDefaultCountryCode('9876543210', env), '9876543210');
    assert.equal(withDefaultCountryCode('07700900123', env), '07700900123');
  });

  test('adds the home code to a 10-digit national number', () => {
    assert.equal(withDefaultCountryCode('9876543210', { DEFAULT_COUNTRY_CODE: '91' }), '919876543210');
    assert.equal(withDefaultCountryCode('4155550123', { DEFAULT_COUNTRY_CODE: '+1' }), '14155550123');
  });

  test('replaces a national trunk 0 with the home code', () => {
    assert.equal(withDefaultCountryCode('07700900123', { DEFAULT_COUNTRY_CODE: '44' }), '447700900123');
  });

  test('never touches a number that already has a country code', () => {
    const env = { DEFAULT_COUNTRY_CODE: '91' };
    assert.equal(withDefaultCountryCode('447700900123', env), '447700900123');
    assert.equal(withDefaultCountryCode('14155550123', env), '14155550123');
  });

  test('falls back to the older iMessage setting', () => {
    assert.equal(defaultCountryCode({ IMESSAGE_DEFAULT_COUNTRY_CODE: '61' }), '61');
    assert.equal(defaultCountryCode({ DEFAULT_COUNTRY_CODE: '44', IMESSAGE_DEFAULT_COUNTRY_CODE: '61' }), '44');
  });
});
