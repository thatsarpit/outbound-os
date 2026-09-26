/**
 * Field mapping for inbound lead webhooks.
 *
 * Kept free of prisma and express so the mapping that decides whether a lead
 * arrives with a phone number is unit-testable. Every sender shapes its payload
 * differently — Engyne posts a flat lead, older senders nest the buyer under an
 * envelope — so resolution is deliberately forgiving: the configured field map
 * first, then the obvious key name, then the well-known aliases.
 */

import { withDefaultCountryCode } from './phoneDefaults.js';

/** Resolve "a.b.c" as well as "a" against a payload. */
export function digPath(obj, path) {
  return String(path)
    .split('.')
    .reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}

/**
 * A lead's mobile is only usable if it is actually a number.
 *
 * Lead.mobile is a required column, so an email-only lead has to hold a
 * placeholder. Treating any non-empty string as a number is what let a
 * placeholder be queued for WhatsApp and pushed to Google Sheets as though it
 * were the buyer's contact number.
 */
export function isSendableMobile(mobile) {
  const value = String(mobile ?? '').trim();
  if (!value) return false;
  return /^\+?\d{6,}$/.test(value);
}

/**
 * Normalise to bare digits. A number with no country code gets the
 * workspace's DEFAULT_COUNTRY_CODE, if one is set (see utils/phoneDefaults).
 */
export function normalizeInboundMobile(mobile) {
  if (!mobile) return null;
  let value = String(mobile).replace(/[^0-9+]/g, '');
  if (value.startsWith('+')) value = value.slice(1);
  if (!value) return null;
  return withDefaultCountryCode(value);
}

// Aliases accepted for each lead field, in priority order, so a sender does not
// need a field map for the common spellings.
//
// The `buyer*` names are Engyne Cloud's. Its `lead.captured` event carries the
// contact details as `buyerMobile` / `buyerEmail`, which matched none of the
// generic spellings — so every Engyne lead was rejected with "Payload must
// contain mobile or email" and never reached the CRM at all.
const ALIASES = {
  name: ['name', 'buyerName', 'contact_name', 'contact_person', 'sender_name'],
  mobile: ['mobile', 'buyerMobile', 'phone', 'contact_mobile', 'phone_number', 'whatsapp'],
  email: ['email', 'buyerEmail', 'contact_email', 'email_address'],
  company: ['company', 'buyerCompany', 'company_name', 'org_name'],
  product: ['product', 'title', 'subject', 'enquiry', 'requirement'],
  country: ['country'],
  quantity: ['quantity', 'quantityRaw', 'quantity_text'],
};

// Where the lead itself might sit inside a sender's envelope, nearest first.
// Engyne Cloud posts `{event, deliveryId, data: {lead: {...}, decision: {...}}}`,
// so nothing useful is at the top level. Probing these means a new sender works
// without somebody first hand-writing a field map — and a field map that goes
// stale stops silently swallowing the phone number.
const ENVELOPE_ROOTS = [
  [],                    // flat payload
  ['data', 'lead'],      // Engyne Cloud lead.captured
  ['lead'],
  ['data'],
  ['payload'],
];

/**
 * Map an inbound payload onto lead fields.
 * @param {object} payload   Parsed request body.
 * @param {object} fieldMap  WebhookSource.fieldMap, e.g. { mobile: 'data.lead.phone' }.
 */
export function mapInboundLead(payload, fieldMap = {}) {
  // Each candidate object the lead could live in, resolved once.
  const scopes = ENVELOPE_ROOTS
    .map((root) => (root.length === 0 ? payload : digPath(payload, root.join('.'))))
    .filter((scope) => scope != null && typeof scope === 'object');

  const resolve = (key) => {
    // An explicit field map wins, and is read against the whole payload so it
    // can address any depth.
    const mapped = fieldMap[key];
    if (mapped) {
      const viaMap = digPath(payload, mapped);
      if (viaMap != null && viaMap !== '') return String(viaMap).trim();
    }
    // Otherwise try each known spelling, in each place a lead might sit.
    // Alias order is the outer loop so a preferred name found deeper still
    // beats a fallback name found shallower.
    for (const alias of ALIASES[key] || [key]) {
      for (const scope of scopes) {
        const found = digPath(scope, alias);
        if (found != null && found !== '') return String(found).trim();
      }
    }
    return null;
  };

  const rawMobile = resolve('mobile');
  return {
    name: resolve('name') || 'Unknown',
    rawMobile,
    mobile: normalizeInboundMobile(rawMobile),
    email: resolve('email'),
    company: resolve('company'),
    product: resolve('product'),
    country: resolve('country'),
    quantity: resolve('quantity'),
  };
}
