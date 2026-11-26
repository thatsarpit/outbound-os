/** Preserve the stored dialling prefix and reject placeholders and extensions. */
export function leadPhoneHref(value) {
  const phone = typeof value === 'string' ? value.trim() : '';
  if (!/^\+?[\d(). -]+$/.test(phone)) return null;
  const digits = phone.replace(/\D/g, '');
  if (!/^\d{7,15}$/.test(digits) || /^0+$/.test(digits)) return null;
  return `tel:${phone.startsWith('+') ? '+' : ''}${digits}`;
}
