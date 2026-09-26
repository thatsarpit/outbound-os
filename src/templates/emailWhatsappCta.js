import businessProfile from '../businessProfile.js';

export const DAILY_EMAIL_TEMPLATE_NAME = 'WhatsApp Requirement CTA v2';
export const DAILY_EMAIL_TEMPLATE_VARIANT = 'daily-whatsapp-cta-v2';

/**
 * The "do you still need this?" email: a short nudge that asks a lead to send
 * their requirement on WhatsApp (or by reply). Every name, link and line of
 * small print comes from the workspace profile (BUSINESS_* and EMAIL_* env
 * vars), so the same template works for any business. A link that is not
 * configured is left out rather than pointing somewhere wrong.
 */

function escapeHtml(value) {
  const string = String(value ?? '');
  // Brevo contact expressions are trusted, application-authored template
  // tokens. Preserve their quote characters so the provider can evaluate
  // fallbacks instead of displaying a raw, HTML-encoded placeholder.
  const tokens = [];
  const protectedString = string.replace(
    /\{\{\s*contact\.[A-Z0-9_]+\|default:"[^"]*"\s*\}\}/gi,
    (token) => {
      const index = tokens.push(token) - 1;
      return `__BREVO_CONTACT_TOKEN_${index}__`;
    },
  );
  let escaped = protectedString
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  tokens.forEach((token, index) => {
    escaped = escaped.replace(`__BREVO_CONTACT_TOKEN_${index}__`, token);
  });
  return escaped;
}

function firstName(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned || /^user$/i.test(cleaned)) return 'there';
  // Brevo contact placeholders must survive untouched until provider render.
  if (/^\{\{\s*contact\./i.test(cleaned)) return cleaned;
  return cleaned.split(/\s+/)[0];
}

function safeUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

/** Adds campaign tags so replies from this email can be told apart in analytics. */
function withUtm(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('utm_source')) {
      parsed.searchParams.set('utm_source', 'outboundos');
      parsed.searchParams.set('utm_medium', 'email');
      parsed.searchParams.set('utm_campaign', 'requirement_followup');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function brand(profile) {
  const name = String(profile.businessName || '').trim() || 'Our team';
  const place = [profile.businessCity, profile.businessCountry]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
  return {
    name,
    tagline: String(profile.businessTagline || '').trim(),
    signer: String(profile.senderSignature || '').trim(),
    place,
    footerNote: String(profile.emailFooterNote || '').trim(),
    whatsappUrl: safeUrl(profile.businessWhatsAppUrl),
    websiteUrl: withUtm(safeUrl(profile.businessWebsite)),
    catalogueUrl: withUtm(safeUrl(profile.businessCatalogueUrl)),
  };
}

export function buildWhatsAppCtaEmail(lead, profile = businessProfile) {
  const b = brand(profile);
  const name = firstName(lead?.name);
  const product = String(lead?.product || '').trim();
  const country = String(lead?.country || '').trim();

  const subject = product ? `Do you still need ${product}?` : 'Do you still need anything from us?';
  const opening = product
    ? `Do you still need <strong>${escapeHtml(product)}</strong>?`
    : 'Do you still need anything from us?';
  const plainOpening = subject;

  const channel = b.whatsappUrl ? 'on WhatsApp' : 'in a reply to this email';
  const signOff = [b.signer, b.name].filter(Boolean);
  const signatureLine = [b.name, b.place].filter(Boolean).join(' · ');

  const htmlBody = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f3f5;color:#1f2328;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Send us what you need and the quantity. We will check the latest price and availability for you.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f3f5;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #dde1e6;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#1f2328;padding:18px 26px;color:#ffffff;">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:1.2;">${escapeHtml(b.name)}</div>
                ${b.tagline ? `<div style="margin-top:5px;color:#b8bec6;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">${escapeHtml(b.tagline)}</div>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:34px 28px 10px;">
                <div style="font-size:16px;line-height:1.7;color:#2b3036;">Hi ${escapeHtml(name)},</div>
                <div style="margin-top:16px;font-family:Georgia,'Times New Roman',serif;font-size:29px;line-height:1.25;color:#1f2328;">${opening}</div>
                <p style="margin:20px 0 0;font-size:15px;line-height:1.75;color:#565d66;">
                  You contacted us earlier. If you still need anything, send us what you need and the quantity ${channel}. We&rsquo;ll check the latest price and availability for you.
                </p>
                ${country ? `<p style="margin:12px 0 0;font-size:15px;line-height:1.75;color:#565d66;">We can arrange delivery to <strong>${escapeHtml(country)}</strong>.</p>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 6px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7f9;border-left:3px solid #1a7f64;border-radius:10px;">
                  <tr>
                    <td style="padding:18px 20px;font-size:14px;line-height:1.8;color:#3d434a;">
                      Just send the <strong>product</strong>, <strong>quantity</strong>, and <strong>delivery country</strong>. We&rsquo;ll reply with what is available, the price, and an estimated delivery time.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${b.whatsappUrl || b.catalogueUrl ? `<tr>
              <td align="center" style="padding:24px 28px 10px;">
                ${b.whatsappUrl ? `<a href="${escapeHtml(b.whatsappUrl)}" style="display:inline-block;background:#1a7f64;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;line-height:1;padding:16px 25px;border-radius:9px;">Send your requirement on WhatsApp</a>` : ''}
                ${b.catalogueUrl ? `<div style="margin-top:15px;"><a href="${escapeHtml(b.catalogueUrl)}" style="color:#1a5f8f;font-size:13px;font-weight:700;text-decoration:underline;">View our product catalogue</a></div>` : ''}
              </td>
            </tr>` : ''}
            <tr>
              <td align="center" style="padding:8px 28px 30px;font-size:13px;line-height:1.6;color:#6a717a;">
                You can also reply directly to this email.${b.websiteUrl ? `<br>
                <a href="${escapeHtml(b.websiteUrl)}" style="color:#1a5f8f;text-decoration:underline;">Visit ${escapeHtml(b.name)}</a>.` : ''}
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e4e7eb;padding:20px 28px 22px;">
                <div style="font-size:14px;line-height:1.6;color:#30363d;">${b.signer ? `<strong>${escapeHtml(b.signer)}</strong><br>` : ''}${escapeHtml(signatureLine)}</div>
                ${b.footerNote ? `<div style="margin-top:12px;font-size:11px;line-height:1.6;color:#7a818a;">${escapeHtml(b.footerNote)}</div>` : ''}
                <div style="margin-top:12px;font-size:11px;line-height:1.6;color:#8a9199;">You are receiving this because you asked us about a product. <a href="{{ unsubscribe }}" style="color:#6a717a;text-decoration:underline;">Unsubscribe in one click</a>.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const links = [
    b.whatsappUrl ? `WhatsApp: ${b.whatsappUrl}` : '',
    b.catalogueUrl ? `Catalogue: ${b.catalogueUrl}` : '',
    b.websiteUrl ? `Website: ${b.websiteUrl}` : '',
  ].filter(Boolean).join('\n');

  const textBody = `Hi ${name},

${plainOpening}

You contacted us earlier. If you still need anything, send us what you need and the quantity ${channel}. We’ll check the latest price and availability for you.
${country ? `\nWe can arrange delivery to ${country}.\n` : ''}
Just send the product, quantity, and delivery country. We’ll reply with what is available, the price, and an estimated delivery time.
${links ? `\n${links}\n` : ''}
You can also reply directly to this email.

Regards,
${signOff.length > 1 ? `${b.signer}\n${signatureLine}` : signatureLine}
${b.footerNote ? `\n${b.footerNote}\n` : ''}
Unsubscribe: {{ unsubscribe }}`;

  return { subject, htmlBody, textBody };
}
