/**
 * The workspace's public web identity: its website, and the email domain that
 * goes with it. Used to pick a system sender on the business's own domain and
 * to suggest addresses in the email CLI.
 *
 * Everything derives from BUSINESS_WEBSITE (set in onboarding or Settings);
 * EMAIL_DEFAULT_DOMAIN and CONTACT_EMAIL override. With nothing configured the
 * values are empty rather than pointing at somebody else's domain.
 */

function trimValue(value) {
  return String(value || '').trim();
}

function normalizeUrl(value) {
  const raw = trimValue(value);
  if (!raw) return '';
  try {
    return new URL(raw).toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function inferMailDomainFromSiteUrl(siteUrl) {
  try {
    return new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function resolvePublicSiteConfig(env = process.env) {
  const siteUrl = normalizeUrl(env.BUSINESS_WEBSITE || env.PUBLIC_SITE_URL || env.NEXT_PUBLIC_SITE_URL);
  const mailDomain = trimValue(env.EMAIL_DEFAULT_DOMAIN).toLowerCase() || inferMailDomainFromSiteUrl(siteUrl);
  const contactEmail = trimValue(env.CONTACT_EMAIL).toLowerCase() || (mailDomain ? `hello@${mailDomain}` : '');
  return { siteUrl, mailDomain, contactEmail };
}

export function buildProjectEmailAddress(localPart, env = process.env) {
  const cleanedLocalPart = trimValue(localPart)
    .toLowerCase()
    .replace(/[^a-z0-9._+-]+/g, '')
    .replace(/(^[.+_-]+|[.+_-]+$)/g, '');

  if (!cleanedLocalPart) {
    throw new Error('A non-empty local-part is required to build a project email address.');
  }

  const { mailDomain } = resolvePublicSiteConfig(env);
  if (!mailDomain) {
    throw new Error('No email domain: set BUSINESS_WEBSITE or EMAIL_DEFAULT_DOMAIN, or pass --email.');
  }
  return `${cleanedLocalPart}@${mailDomain}`;
}

export function buildDefaultEmailSignature({
  senderName = '',
  companyName = '',
  env = process.env,
} = {}) {
  const { siteUrl } = resolvePublicSiteConfig(env);
  const resolvedCompany = trimValue(companyName) || trimValue(env.BUSINESS_NAME) || 'Outbound OS';
  const resolvedSender = trimValue(senderName) || resolvedCompany;
  const link = siteUrl ? `<br><a href="${siteUrl}">${siteUrl}</a>` : '';
  return `<strong>${resolvedSender}</strong><br>${resolvedCompany}${link}`;
}

export default {
  buildDefaultEmailSignature,
  buildProjectEmailAddress,
  inferMailDomainFromSiteUrl,
  resolvePublicSiteConfig,
};
