import { isSendableMobile } from './inboundLead.js';

/**
 * WhatsApp business-scoped user ids (BSUIDs).
 *
 * Meta identifies every WhatsApp user to a business by a BSUID: the user's
 * two-letter country code, a dot, then up to 128 letters and digits, e.g.
 * "US.13491208655302741918" (or "US.ENT.…" for a parent id). For people who
 * use a WhatsApp username and have not been in touch for 30 days, webhooks
 * carry only the BSUID — no phone number — and replies must be addressed to
 * it with the `recipient` field instead of `to`.
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids
 */
const BSUID_PATTERN = /^[A-Z]{2}(?:\.ENT)?\.[A-Za-z0-9]{1,128}$/;

export function isBsuid(value) {
  return BSUID_PATTERN.test(String(value ?? '').trim());
}

/** Where to send a lead's WhatsApp messages: their number when we have one,
    otherwise their BSUID, otherwise nowhere. */
export function whatsappAddress(lead) {
  if (isSendableMobile(lead?.mobile)) return String(lead.mobile).trim();
  if (isBsuid(lead?.waUserId)) return String(lead.waUserId).trim();
  return null;
}

/** The addressing part of a Cloud API message body. */
export function cloudApiAddressee(address, normalizePhone) {
  const value = String(address ?? '').trim();
  if (isBsuid(value)) return { recipient: value };
  const to = normalizePhone(value);
  return to ? { to } : null;
}
