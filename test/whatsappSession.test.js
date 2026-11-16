import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  whatsappSession,
  whatsappFailureReason,
} from '../src/utils/whatsappSession.js';
const now = Date.parse('2026-10-23T00:00:00Z');
const incoming = (sentAt, waAccount = 1) => ({
  channel: 'whatsapp',
  direction: 'inbound',
  sentAt,
  createdAt: new Date(now),
  waAccount,
});
test('WhatsApp window uses provider time and sending number, never import time or outbound sends', () => {
  assert.equal(
    whatsappSession([incoming('2026-08-31T10:00:00Z')], 1, now).isOpen,
    false,
  );
  assert.equal(
    whatsappSession([incoming('2026-10-22T01:00:00Z')], 1, now).isOpen,
    true,
  );
  assert.equal(
    whatsappSession([incoming('2026-10-22T00:00:00Z')], 1, now).isOpen,
    false,
  );
  assert.equal(
    whatsappSession([incoming('2026-10-22T23:00:00Z', 2)], 1, now).isOpen,
    false,
  );
  assert.equal(
    whatsappSession(
      [{ ...incoming('2026-10-22T23:00:00Z'), direction: 'outbound' }],
      1,
      now,
    ).isOpen,
    false,
  );
  assert.equal(
    whatsappSession([incoming('2026-10-24T00:00:00Z')], 1, now).isOpen,
    false,
  );
  assert.equal(
    whatsappFailureReason(131047, 'Re-engagement message'),
    're_engagement_required',
  );
  assert.equal(whatsappFailureReason(131070, 'Caller is not thread owner'), 'thread_not_owned');
});

test('receipt reason separates a country marketing pause from the per-recipient limit', () => {
  assert.equal(
    whatsappFailureReason(131049, 'Marketing messages to United States phone numbers are currently paused'),
    'marketing_country_restricted',
  );
  assert.equal(
    whatsappFailureReason(131049, 'Message was not delivered to maintain healthy ecosystem engagement'),
    'marketing_limit',
  );
  // Lowercase "us" is a pronoun, not a country, and must not trip the match.
  assert.equal(
    whatsappFailureReason(131049, 'Marketing paused — the recipient asked us to slow down'),
    'marketing_limit',
  );
  assert.equal(whatsappFailureReason(130472, "User's number is part of an experiment"), 'marketing_experiment');
});
