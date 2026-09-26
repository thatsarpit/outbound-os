/**
 * Google Sheets sync — retry behaviour and row contents.
 * Run: node --test test/sheetsSync.test.js
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import sheetsSync from '../src/services/sheetsSync.js';

const realFetch = globalThis.fetch;

function stubFetch(responses) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { ok: next < 400, status: next };
  };
  return calls;
}

// Skip the real backoff so the suite stays fast.
const realSetTimeout = globalThis.setTimeout;
function stubTimers() {
  globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);
}

function configure() {
  sheetsSync._loaded = true;
  sheetsSync._enabled = true;
  sheetsSync._url = 'https://script.google.com/macros/s/TEST/exec';
  sheetsSync._events = ['lead.created'];
}

const LEAD = {
  id: 7,
  name: 'Ada Obi',
  company: 'Lagos Pharma Ltd',
  mobile: '2348012345678',
  email: 'buyer@example.com',
  country: 'Nigeria',
  product: 'Paracetamol 500mg',
  quantity: '10000 boxes',
  status: 'new',
  score: 90,
  leadTier: 'HOT',
  source: 'engyne',
  createdAt: '2026-09-24T10:00:00.000Z',
};

describe('SheetsSync', () => {
  beforeEach(() => { configure(); stubTimers(); });
  afterEach(() => { globalThis.fetch = realFetch; globalThis.setTimeout = realSetTimeout; });

  test('a row carries the phone AND the email', async () => {
    const calls = stubFetch([200]);
    await sheetsSync.dispatch('lead.created', LEAD);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.mobile, '2348012345678');
    assert.equal(calls[0].body.email, 'buyer@example.com');
    assert.equal(calls[0].body.quantity, '10000 boxes');
    assert.equal(calls[0].body.product, 'Paracetamol 500mg');
  });

  test('a no-phone placeholder is sent as blank, not as a number', async () => {
    const calls = stubFetch([200]);
    await sheetsSync.dispatch('lead.created', { ...LEAD, mobile: 'no-phone:buyer@example.com' });

    assert.equal(calls[0].body.mobile, '', 'placeholder leaked into the Mobile column');
    assert.equal(calls[0].body.email, 'buyer@example.com');
  });

  test('retries a 5xx and succeeds', async () => {
    const calls = stubFetch([500, 200]);
    await sheetsSync.dispatch('lead.created', LEAD);
    assert.equal(calls.length, 2, 'a transient 5xx lost the row');
  });

  test('retries a network error and succeeds', async () => {
    const calls = stubFetch([new Error('ECONNRESET'), 200]);
    await sheetsSync.dispatch('lead.created', LEAD);
    assert.equal(calls.length, 2, 'a network blip lost the row');
  });

  test('gives up after three attempts rather than looping', async () => {
    const calls = stubFetch([500, 500, 500]);
    await sheetsSync.dispatch('lead.created', LEAD);
    assert.equal(calls.length, 3);
  });

  test('does not retry a 4xx — the script rejected the row', async () => {
    const calls = stubFetch([400]);
    await sheetsSync.dispatch('lead.created', LEAD);
    assert.equal(calls.length, 1, 'a client error should not be retried');
  });

  test('stays silent when disabled or unsubscribed from the event', async () => {
    sheetsSync._enabled = false;
    let calls = stubFetch([200]);
    await sheetsSync.dispatch('lead.created', LEAD);
    assert.equal(calls.length, 0);

    configure();
    calls = stubFetch([200]);
    await sheetsSync.dispatch('lead.replied', LEAD);
    assert.equal(calls.length, 0);
  });
});
