import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  accountJson,
  isSameWorkspaceDay,
  normalizePeer,
  normalizePhone,
  publicError,
} from '../src/services/telegram.js';

describe('Telegram account safety', () => {
  it('never returns encrypted credentials or login challenges to the dashboard', () => {
    const result = accountJson({
      id: 7,
      name: 'Sales account',
      apiHash: 'enc:v1:secret-api-hash',
      session: 'enc:v1:authorization-key',
      pendingSession: 'enc:v1:pending-key',
      phoneCodeHash: 'enc:v1:code-hash',
      status: 'connected',
    });

    assert.equal(result.apiHash, undefined);
    assert.equal(result.session, undefined);
    assert.equal(result.pendingSession, undefined);
    assert.equal(result.phoneCodeHash, undefined);
    assert.equal(result.hasCredentials, true);
    assert.equal(result.hasSession, true);
  });

  it('normalizes international phone numbers and rejects invalid values', () => {
    assert.equal(normalizePhone('+91 98765-43210'), '+919876543210');
    assert.throws(() => normalizePhone('123'), /valid phone number/i);
  });

  it('requires a bounded explicit Telegram recipient', () => {
    assert.equal(normalizePeer('  @buyer  '), '@buyer');
    assert.throws(() => normalizePeer(''), /required/i);
    assert.throws(() => normalizePeer(`@${'a'.repeat(129)}`), /too long/i);
  });

  it('maps provider failures to safe actionable messages', () => {
    assert.equal(
      publicError({ errorMessage: 'PHONE_CODE_EXPIRED' }),
      'The Telegram verification code expired; request a new one',
    );
    assert.equal(
      publicError({ errorMessage: 'FLOOD_WAIT_120' }),
      'Telegram temporarily rate-limited this account',
    );
  });

  it('resets daily counters at midnight in the workspace zone', () => {
    const beforeMidnightIst = new Date('2026-09-20T18:29:59.000Z');
    const afterMidnightIst = new Date('2026-09-20T18:30:01.000Z');
    assert.equal(isSameWorkspaceDay(beforeMidnightIst, afterMidnightIst, 'Asia/Kolkata'), false);
    // The same two instants are one calendar day in UTC.
    assert.equal(isSameWorkspaceDay(beforeMidnightIst, afterMidnightIst, 'UTC'), true);
  });
});
