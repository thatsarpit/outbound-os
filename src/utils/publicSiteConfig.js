const DEFAULT_SITE_URL = 'https://outboundos.space';
const DEFAULT_APP_ORIGIN = 'https://app.outboundos.space';
const DEFAULT_APP_URL = `${DEFAULT_APP_ORIGIN}/login`;
const DEFAULT_REQUEST_ACCESS_PATH = '/api/public/request-access';
const DEFAULT_CONTACT_LOCAL_PART = 'hello';

function trimValue(value) {
  return String(value || '').trim();
}

function normalizeUrl(value, fallback) {
  const raw = trimValue(value) || fallback;
  try {
    const url = new URL(raw);
    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

function normalizeEmail(value, fallback) {
  const raw = trimValue(value).toLowerCase();
  return raw || fallback;
}

function inferOriginFromUrl(value, fallback) {
  const raw = trimValue(value);
  if (!raw) return fallback;

  try {
    return new URL(raw).origin;
  } catch {
    return fallback;
  }
}

export function inferMailDomainFromSiteUrl(siteUrl) {
  try {
    const hostname = new URL(siteUrl).hostname.toLowerCase();
    return hostname.replace(/^www\./, '');
  } catch {
    return 'outboundos.space';
  }
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
  return `${cleanedLocalPart}@${mailDomain}`;
}

export function buildDefaultEmailSignature({
  senderName = '',
  companyName = '',
  env = process.env,
} = {}) {
  const { siteUrl } = resolvePublicSiteConfig(env);
  const resolvedSender = trimValue(senderName) || trimValue(companyName) || 'Outbound OS';
  const resolvedCompany = trimValue(companyName) || 'Outbound OS';

  return `<strong>${resolvedSender}</strong><br>${resolvedCompany}<br><a href="${siteUrl}">${siteUrl}</a>`;
}

export function resolvePublicSiteConfig(env = process.env) {
  const siteUrl = normalizeUrl(
    env.NEXT_PUBLIC_SITE_URL || env.PUBLIC_SITE_URL,
    DEFAULT_SITE_URL
  );
  const appOrigin = normalizeUrl(
    env.NEXT_PUBLIC_APP_ORIGIN || env.APP_ORIGIN || inferOriginFromUrl(env.NEXT_PUBLIC_APP_URL, DEFAULT_APP_ORIGIN),
    DEFAULT_APP_ORIGIN
  );
  const appUrl = normalizeUrl(
    env.NEXT_PUBLIC_APP_URL || `${appOrigin}/login`,
    DEFAULT_APP_URL
  );
  const requestAccessEndpoint = normalizeUrl(
    env.NEXT_PUBLIC_REQUEST_ACCESS_ENDPOINT || `${appOrigin}${DEFAULT_REQUEST_ACCESS_PATH}`,
    `${DEFAULT_APP_ORIGIN}${DEFAULT_REQUEST_ACCESS_PATH}`
  );
  const mailDomain = normalizeEmail(
    env.EMAIL_DEFAULT_DOMAIN,
    inferMailDomainFromSiteUrl(siteUrl)
  );
  const contactEmail = normalizeEmail(
    env.NEXT_PUBLIC_CONTACT_EMAIL || env.CONTACT_EMAIL,
    `${DEFAULT_CONTACT_LOCAL_PART}@${mailDomain}`
  );

  return {
    siteUrl,
    appOrigin,
    appUrl,
    requestAccessEndpoint,
    contactEmail,
    mailDomain,
  };
}

export default {
  buildDefaultEmailSignature,
  buildProjectEmailAddress,
  inferMailDomainFromSiteUrl,
  resolvePublicSiteConfig,
};
