import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verify the exact bytes, not a reserialized JSON body. */
export function ycloudSignatureValid(rawBody, header, secret, now = Date.now()) {
  if (!secret || !rawBody || typeof header !== 'string') return false;
  const parts = header.split(',').map(p => p.trim().split('='));
  const times = parts.filter(([key]) => key === 't');
  const signatures = parts.filter(([key]) => key === 's');
  if (times.length !== 1 || !/^\d+$/.test(times[0][1] || '')) return false;
  const timestamp = times[0][1];
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  return signatures.some(([, value]) => /^[a-fA-F0-9]{64}$/.test(value || '')
    && timingSafeEqual(expected, Buffer.from(value, 'hex')));
}

export function ycloudSendPayload(payload, from) {
  const { messaging_product, recipient_type, ...message } = payload;
  if (message.to && /^[1-9]\d{7,14}$/.test(message.to)) message.to = `+${message.to}`;
  return { ...message, from };
}

export function ycloudPricing(message) {
  const final = ['delivered', 'read'].includes(message.status);
  return {
    category: message.pricingCategory,
    type: 'ycloud',
    ...(final && typeof message.totalPrice === 'number' && Number.isFinite(message.totalPrice)
      ? { billable: message.totalPrice > 0 } : {}),
  };
}
