/**
 * Inbound lead webhook mapping — the path a lead takes from Engyne into the CRM.
 * Run: node --test test/inboundLead.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapInboundLead,
  normalizeInboundMobile,
  isSendableMobile,
  digPath,
} from '../src/utils/inboundLead.js';

// These cases are Indian numbers, so the workspace's home code is India.
// test/phoneDefaults.test.js covers the blank (no-guessing) default.
process.env.DEFAULT_COUNTRY_CODE = '91';

describe('Inbound lead mapping — Engyne payloads', () => {
  // Exactly what Engyne's slot webhook now posts.
  const engyneFlat = {
    event: 'lead.verified',
    lead_id: 'IM-12345',
    slot_id: 'slot-1',
    name: 'Ada Obi',
    company: 'Lagos Pharma Ltd',
    mobile: '+234 801 234 5678',
    phone: '+234 801 234 5678',
    email: 'buyer@example.com',
    country: 'Nigeria',
    product: 'Paracetamol 500mg tablets',
    quantity: '10000 boxes',
    lead: { type: 'verified', payload: { phone: '+2348012345678' } },
  };

  test('flat Engyne payload maps with no field map at all', () => {
    const m = mapInboundLead(engyneFlat, {});
    assert.equal(m.mobile, '2348012345678');
    assert.equal(m.email, 'buyer@example.com');
    assert.equal(m.name, 'Ada Obi');
    assert.equal(m.company, 'Lagos Pharma Ltd');
    assert.equal(m.product, 'Paracetamol 500mg tablets');
    assert.equal(m.country, 'Nigeria');
    assert.equal(m.quantity, '10000 boxes');
  });

  test('nested envelope is reachable through a dotted field map', () => {
    const nested = { data: { lead: { sender_name: 'Ravi', phone: '9876543210', email: 'r@x.com' } } };
    const m = mapInboundLead(nested, {
      name: 'data.lead.sender_name',
      mobile: 'data.lead.phone',
      email: 'data.lead.email',
    });
    assert.equal(m.name, 'Ravi');
    assert.equal(m.mobile, '919876543210', 'bare 10-digit number defaults to +91');
    assert.equal(m.email, 'r@x.com');
  });

  test('dispatcher-channel payload maps via its own aliases', () => {
    // worker/dispatcher_worker.py crm_payload() shape.
    const m = mapInboundLead({
      channel: 'sheets', contact: '+2348012345678',
      phone: '+2348012345678', email: 'buyer@example.com',
      contact_person: 'Ada Obi', title: 'Paracetamol 500mg',
      quantity_text: '10000 boxes',
    }, {});
    assert.equal(m.mobile, '2348012345678');
    assert.equal(m.name, 'Ada Obi', 'contact_person is an accepted name alias');
    assert.equal(m.product, 'Paracetamol 500mg', 'title is an accepted product alias');
    assert.equal(m.quantity, '10000 boxes');
  });

  test('a field map that points nowhere falls back instead of losing the lead', () => {
    const m = mapInboundLead(engyneFlat, { mobile: 'data.lead.sender_mobile' });
    assert.equal(m.mobile, '2348012345678', 'stale field map must not drop the phone');
  });

  test('email-only payload yields no mobile but is still a lead', () => {
    const m = mapInboundLead({ name: 'Sam', email: 's@x.com' }, {});
    assert.equal(m.mobile, null);
    assert.equal(m.email, 's@x.com');
  });

  test('missing name falls back rather than throwing', () => {
    assert.equal(mapInboundLead({ phone: '9876543210' }, {}).name, 'Unknown');
  });
});

describe('Inbound lead mapping — mobile normalisation', () => {
  test('strips formatting and keeps the country code', () => {
    assert.equal(normalizeInboundMobile('+234-801 234 5678'), '2348012345678');
    assert.equal(normalizeInboundMobile('(987) 654-3210'), '919876543210');
  });

  test('returns null for nothing usable', () => {
    for (const input of [null, undefined, '', '   ', 'n/a']) {
      assert.equal(normalizeInboundMobile(input), null, `input: ${JSON.stringify(input)}`);
    }
  });
});

describe('Lead.mobile placeholders are not contact numbers', () => {
  test('accepts real numbers', () => {
    assert.ok(isSendableMobile('919876543210'));
    assert.ok(isSendableMobile('+2348012345678'));
  });

  test('rejects the placeholder used for email-only leads', () => {
    assert.equal(isSendableMobile('no-phone:buyer@example.com'), false);
    assert.equal(isSendableMobile('no-phone:engyne'), false);
  });

  test('rejects blanks and too-short strings', () => {
    for (const input of [null, undefined, '', '  ', '12345']) {
      assert.equal(isSendableMobile(input), false, `input: ${JSON.stringify(input)}`);
    }
  });

  // The old placeholder was String(Date.now()) — 13 digits, so indistinguishable
  // from a phone number. It reached Google Sheets as the buyer's mobile and was
  // queued for a WhatsApp send. Kept as a reminder of why the format matters.
  test('a timestamp placeholder would have passed this check', () => {
    assert.ok(isSendableMobile(String(Date.now())),
      'which is exactly why the placeholder is no longer numeric');
  });
});

describe('digPath', () => {
  test('resolves nested and flat paths, and misses safely', () => {
    assert.equal(digPath({ a: { b: { c: 1 } } }, 'a.b.c'), 1);
    assert.equal(digPath({ a: 2 }, 'a'), 2);
    assert.equal(digPath({ a: null }, 'a.b.c'), undefined);
    assert.equal(digPath({}, 'x.y'), undefined);
  });
});

describe('Inbound lead mapping — the real Engyne Cloud lead.captured event', () => {
  // Copied from IMLead apps/api/src/integrations/deliver.ts buildDeliveryPayload
  // and apps/api/src/routes/admin.ts (the "Send test lead" button). If Engyne
  // changes this shape, this test is where it should break.
  const engyneCaptured = {
    event: 'lead.captured',
    deliveryId: 'b3f1c2d4-0000-4000-8000-000000000001',
    workspaceId: 'ws_live_0001',
    occurredAt: '2026-09-24T18:24:00.000Z',
    test: false,
    data: {
      lead: {
        externalLeadId: 'BL000000000',
        title: 'Industrial Reverse Osmosis Plant',
        requirement: 'Need 2 units, 5000 LPH, for a textile unit',
        city: 'Surat',
        state: 'Gujarat',
        country: 'India',
        buyerName: 'Sample Buyer',
        buyerCompany: 'Sample Textiles',
        buyerMobile: '+91-9800000000',
        buyerEmail: 'sample.buyer@example.com',
      },
      decision: { decision: 'captured', reasonCode: 'approved', matchedKeyword: 'reverse osmosis' },
    },
  };

  test('maps a real captured lead with no field map configured', () => {
    const m = mapInboundLead(engyneCaptured, {});
    assert.equal(m.mobile, '919800000000', 'the buyer phone never reached the CRM');
    assert.equal(m.email, 'sample.buyer@example.com');
    assert.equal(m.name, 'Sample Buyer');
    assert.equal(m.company, 'Sample Textiles');
    assert.equal(m.product, 'Industrial Reverse Osmosis Plant');
    assert.equal(m.country, 'India');
  });

  test('the lead is accepted — it has a mobile and an email', () => {
    // The webhook rejects with 400 unless one of these is present. Before the
    // envelope was understood, both were null and every Engyne lead 400'd.
    const m = mapInboundLead(engyneCaptured, {});
    assert.ok(m.mobile || m.email, 'webhook would answer 400 and drop the lead');
  });

  test('a quantity-bearing capture keeps the quantity', () => {
    const withQty = structuredClone(engyneCaptured);
    withQty.data.lead.quantityRaw = '2 units';
    assert.equal(mapInboundLead(withQty, {}).quantity, '2 units');
  });

  test('an explicit field map still wins over the aliases', () => {
    const m = mapInboundLead(engyneCaptured, { mobile: 'data.lead.buyerEmail' });
    assert.equal(m.mobile, null, 'a map pointing at an email yields no usable number');
  });

  test('a contact-less capture is rejected rather than half-created', () => {
    const noContact = structuredClone(engyneCaptured);
    noContact.data.lead.buyerMobile = null;
    noContact.data.lead.buyerEmail = null;
    const m = mapInboundLead(noContact, {});
    assert.equal(m.mobile, null);
    assert.equal(m.email, null);
  });

  test('the decision block is never mistaken for lead data', () => {
    const m = mapInboundLead(engyneCaptured, {});
    assert.notEqual(m.name, 'captured');
    assert.notEqual(m.product, 'approved');
  });
});

describe('Inbound lead mapping — email consent', () => {
  test('only an explicit yes counts', () => {
    for (const yes of [true, 'true', 'yes', 'on', '1', 'Checked']) {
      assert.equal(mapInboundLead({ email: 'a@example.test', consent: yes }).emailConsent, true, String(yes));
    }
    for (const no of [false, 'false', 'no', '0', '', undefined, 'maybe']) {
      assert.equal(mapInboundLead({ email: 'a@example.test', consent: no }).emailConsent, false, String(no));
    }
  });

  test('reads the common checkbox names', () => {
    assert.equal(mapInboundLead({ email: 'a@example.test', marketing_consent: 'yes' }).emailConsent, true);
    assert.equal(mapInboundLead({ email: 'a@example.test', newsletter: 'on' }).emailConsent, true);
  });
});

