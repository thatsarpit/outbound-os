/**
 * The workspace's home calling code, for numbers entered without one.
 *
 * DEFAULT_COUNTRY_CODE is digits only, e.g. 1 (US/Canada), 44 (UK), 91
 * (India). When it is set, a bare 10-digit number, or one written with a
 * national trunk 0 (07700 900123), is treated as a home number and gets the
 * code. When it is blank, numbers are kept exactly as given: guessing a
 * country for an international workspace sends messages to the wrong person.
 *
 * IMESSAGE_DEFAULT_COUNTRY_CODE is read as a fallback for older installs.
 */
export function defaultCountryCode(env = process.env) {
  return String(env.DEFAULT_COUNTRY_CODE || env.IMESSAGE_DEFAULT_COUNTRY_CODE || '').replace(/\D/g, '');
}

/** Digits in, digits out (no '+'). */
export function withDefaultCountryCode(digits, env = process.env) {
  const value = String(digits || '');
  const code = defaultCountryCode(env);
  if (!code || !value) return value;
  if (value.length === 10 && !value.startsWith('0')) return `${code}${value}`;
  if (/^0[1-9]\d{8,10}$/.test(value)) return `${code}${value.slice(1)}`;
  return value;
}
