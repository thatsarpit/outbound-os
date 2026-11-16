/**
 * Meta reuses error 131049 for two different situations: a per-recipient
 * marketing limit, which clears on its own and is worth retrying after 24h,
 * and a marketing pause for a whole country (the US pause from April 2025),
 * which no amount of per-recipient retrying can get past. Only the prose
 * distinguishes them, so this inspects it: a country-level restriction talks
 * about marketing being paused/unsupported for a country or region. The three
 * separate tests keep the match conservative — unrelated throttle prose
 * ("healthy ecosystem engagement") names neither a pause nor a country.
 */
export function isCountryPolicyRestriction(text) {
  const value = String(text || '');
  if (!/marketing/i.test(value)) return false;
  if (!/paus|suspend|unavailable|restrict|not (currently )?(available|supported|allowed|permitted)/i.test(value)) return false;
  // "US" is matched case-sensitively: lowercase "us" is an ordinary pronoun.
  return /countr|region|united states|\+1\b/i.test(value) || /\bU\.?S\.?\b/.test(value);
}

/** Retain actionable provider facts without storing bodies, keys or headers. */
export function whatsappProviderError(data, httpStatus, secret = '') {
  const upstream = data?.error?.whatsappApiError || data?.whatsappApiError || {};
  const outer = data?.error || {};
  let message = String(upstream.error_data?.details || upstream.error_user_msg || upstream.message
    || outer.message || data?.errorMessage || data?.message || `HTTP ${httpStatus}`);
  if (secret) message = message.split(secret).join('[redacted]');
  message = message.replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 500);
  const safe = (value, max) => value == null ? null : String(value).replace(/[^\w.-]/g, '').slice(0, max) || null;
  const errorCode = safe(upstream.code ?? data?.errorCode ?? outer.code ?? data?.code, 64);
  return { rawError: message, errorCode, requestId: safe(outer.requestId || data?.requestId || upstream.fbtrace_id || outer.fbtrace_id, 128) };
}
