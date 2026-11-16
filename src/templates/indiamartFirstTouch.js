import businessProfile from '../businessProfile.js';

const clean = value => String(value || '').replace(/[\r\n]+/g, ' ').trim();
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export const INDIAMART_EMAIL_VARIANT = 'indiamart-first-touch-v1';

/** First response to a newly consumed enquiry; daily follow-ups keep their copy. */
export function buildIndiaMartFirstTouchEmail(lead, profile = businessProfile) {
  const name = clean(lead?.name).split(/\s+/)[0] || 'there';
  const product = clean(lead?.product);
  const quantity = clean(lead?.quantity);
  const country = clean(lead?.country);
  const business = clean(profile.businessName) || 'Our team';
  const subject = product ? `Your IndiaMART enquiry: ${product}` : 'Your IndiaMART enquiry';
  const signature = [clean(profile.senderSignature), business,
    [clean(profile.businessCity), clean(profile.businessCountry)].filter(Boolean).join(', ')].filter(Boolean).join('\n');
  const textBody = `Hi ${name},\n\nThank you for your enquiry on IndiaMART${product ? ` about ${product}` : ''}.\n\n${quantity ? `We noted your requested quantity as ${quantity}.` : 'Please share the quantity you need.'}\n${country ? `Please confirm the delivery destination in ${country}.` : 'Please confirm the delivery country.'}\n\nOur team will check availability and share pricing and an estimated delivery timeline. You can reply directly to this email.\n\nRegards,\n${signature}${profile.emailFooterNote ? `\n\n${clean(profile.emailFooterNote)}` : ''}\n\nTo stop receiving messages, reply with "Unsubscribe".`;
  const htmlBody = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="font-family:Arial,sans-serif;line-height:1.6;max-width:620px;margin:36px auto;padding:0 20px;color:#202530">${textBody.split('\n\n').map(part => `<p>${escape(part).replaceAll('\n', '<br>')}</p>`).join('')}</body></html>`;
  return { subject, textBody, htmlBody };
}
