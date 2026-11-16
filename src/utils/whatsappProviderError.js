/** Retain actionable provider facts without storing bodies, keys or headers. */
export function whatsappProviderError(data, httpStatus, secret = '') {
  const upstream = data?.error?.whatsappApiError || data?.whatsappApiError || {};
  const outer = data?.error || {};
  let message = String(upstream.error_data?.details || upstream.error_user_msg || upstream.message
    || outer.message || data?.errorMessage || data?.message || `HTTP ${httpStatus}`);
  if (secret) message = message.split(secret).join('[redacted]');
  message = message.replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 500);
  const safe = (value, max) => value == null ? null : String(value).replace(/[^\w.-]/g, '').slice(0, max) || null;
  const errorCode = safe(upstream.code ?? data?.errorCode ?? outer.code, 64);
  return { rawError: message, errorCode, requestId: safe(outer.requestId || data?.requestId || upstream.fbtrace_id || outer.fbtrace_id, 128) };
}
