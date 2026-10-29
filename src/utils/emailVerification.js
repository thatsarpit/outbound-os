import isEmail from 'validator/lib/isEmail.js';
import Mailchecker from 'mailchecker';
import { domainToASCII } from 'node:url';
import addressparser from 'nodemailer/lib/addressparser';

const disposable = new Set(Mailchecker.blacklist());
const roles = new Set(['admin', 'info', 'sales', 'support', 'contact', 'office', 'hello', 'accounts']);
export const verificationEnabled = () => process.env.EMAIL_VERIFICATION_ENABLED === 'true';

export function emailIdentity(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function recipientAddresses(values) {
  return values.filter(Boolean).flatMap(value => addressparser(String(value), { flatten: true }).map(part => part.address || ''));
}

/** Domain checks do not prove that a mailbox exists or will accept a message. */
export async function checkEmailAddress(input, lookupMx) {
  const email = emailIdentity(input);
  const result = (status, reason, extra = {}) => ({ email, status, reason,
    canSend: status === 'ready', mailboxVerified: false, ...extra });
  if (email.length > 254 || !isEmail(email, { allow_ip_domain: false, allow_display_name: false })) {
    return result('invalid', 'invalid_syntax');
  }
  const at = email.lastIndexOf('@');
  const domain = domainToASCII(email.slice(at + 1));
  const labels = domain.split('.');
  if (labels.some((_, i) => i < labels.length - 1 && disposable.has(labels.slice(i).join('.')))) {
    return result('invalid', 'disposable_domain', { domain });
  }
  try {
    const mx = await lookupMx(domain);
    if (mx.some(record => record.exchange === '' || record.exchange === '.')) return result('invalid', 'null_mx', { domain });
    if (!mx.length) return result('unknown', 'no_mx_records', { domain });
    return result('ready', 'mail_domain_ready', { domain, roleAccount: roles.has(email.slice(0, at)),
      mx: mx.map(record => String(record.exchange).slice(0, 255)).slice(0, 10) });
  } catch (error) {
    return result(error.code === 'ENOTFOUND' ? 'invalid' : 'unknown',
      error.code === 'ENOTFOUND' ? 'domain_not_found' : error.code === 'ENODATA' ? 'no_mx_records' : 'dns_unavailable', { domain });
  }
}
