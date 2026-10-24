import leadStateService from '../domain/leadStateService.js';
import { isSendableMobile } from './inboundLead.js';
import { whatsappAddress } from './whatsappAddress.js';

/** Tags are comma-separated tokens; a multi-tag filter requires every token. */
export function tokenizeLeadTags(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.flatMap((item) => String(item ?? '').split(','))
    .map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export function hasAllLeadTags(value, requested) {
  const actual = new Set(tokenizeLeadTags(value));
  return tokenizeLeadTags(requested).every((tag) => actual.has(tag));
}

export function campaignChannels(channel = 'whatsapp') {
  if (channel === 'both') return ['email', 'whatsapp'];
  if (!['whatsapp', 'email', 'imessage'].includes(channel)) throw new Error('Unsupported campaign channel');
  return [channel];
}

/** The same suppression/reachability decision is used in preview and dispatch. */
export function campaignChannelEligibility(lead, channel) {
  if (!lead) return { eligible: false, reason: 'lead_deleted' };
  if (leadStateService.shouldBlockAutomation(lead.status, { channel })) {
    return { eligible: false, reason: `lead_${lead.status}` };
  }
  if (lead.repliedAt) return { eligible: false, reason: 'customer_replied' };
  if (channel === 'email') {
    if (lead.emailOptOut) return { eligible: false, reason: 'email_opted_out' };
    if (['bounced', 'complained', 'unsubscribed', 'suppressed'].includes(lead.emailStatus)) {
      return { eligible: false, reason: `email_${lead.emailStatus}` };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(lead.email || '').trim())) {
      return { eligible: false, reason: 'no_email_address' };
    }
  } else if (channel === 'whatsapp') {
    if (lead.isOnWhatsApp === false) return { eligible: false, reason: 'whatsapp_unavailable' };
    if (!whatsappAddress(lead)) return { eligible: false, reason: 'no_whatsapp_address' };
  } else if (channel === 'imessage') {
    if (!isSendableMobile(lead.mobile)) return { eligible: false, reason: 'no_phone_number' };
  } else {
    return { eligible: false, reason: 'unsupported_channel' };
  }
  return { eligible: true, reason: null };
}

/** The historical mixed-channel selector was an email selector, never a WA id. */
export function campaignSenderId(campaign, channel) {
  if (channel === 'email') return campaign.emailSenderAccountId
    || (['email', 'both'].includes(campaign.channel) ? campaign.senderAccountId : null)
    || null;
  if (channel === 'whatsapp') return campaign.whatsappSenderAccountId
    || (campaign.channel === 'whatsapp' ? campaign.senderAccountId : null)
    || null;
  return null;
}
