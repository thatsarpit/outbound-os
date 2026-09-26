/**
 * Constant-time secret comparison for the inbound webhook API key.
 * Run: node --test test/secretsMatch.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { secretsMatch } from '../src/utils/secretsMatch.js';

describe('secretsMatch', () => {
  test('accepts an exact match', () => {
    assert.equal(secretsMatch('s3cret-key-value', 's3cret-key-value'), true);
  });

  test('rejects a near miss', () => {
    assert.equal(secretsMatch('s3cret-key-valuE', 's3cret-key-value'), false);
  });

  test('rejects operands of different lengths without throwing', () => {
    // timingSafeEqual throws on length mismatch; hashing first is what avoids
    // both the throw and a length oracle.
    assert.equal(secretsMatch('short', 's3cret-key-value'), false);
    assert.equal(secretsMatch('s3cret-key-value-and-more', 's3cret-key-value'), false);
  });

  test('rejects anything that is not a non-empty string', () => {
    for (const provided of [undefined, null, '', 0, {}, ['s3cret-key-value']]) {
      assert.equal(secretsMatch(provided, 's3cret-key-value'), false,
        `provided: ${JSON.stringify(provided)}`);
    }
  });

  test('rejects when no key is configured, rather than matching a blank', () => {
    // A WebhookSource row with an empty apiKey must not become open to all.
    for (const expected of ['', undefined, null]) {
      assert.equal(secretsMatch('anything', expected), false);
      assert.equal(secretsMatch('', expected), false);
    }
  });

  test('an array from a repeated query param does not match', () => {
    // Express parses ?apiKey=a&apiKey=b into an array.
    assert.equal(secretsMatch(['a', 'b'], 'a'), false);
  });
});
