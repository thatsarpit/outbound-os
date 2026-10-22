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
});
