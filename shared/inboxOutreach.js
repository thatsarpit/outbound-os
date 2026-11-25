export const OUTREACH_CHANNELS = ['whatsapp', 'email', 'imessage', 'telegram'];
export const ACCEPTED_OUTREACH_STATUSES = ['sent', 'delivered', 'read'];
export const OUTREACH_DELIVERY_EXCEPTIONS = ['soft_bounce', 'deferred', 'hard_bounce', 'invalid', 'blocked', 'error'];

export function hasConfirmedOutreach(message) {
  return message.direction === 'outbound' &&
    ACCEPTED_OUTREACH_STATUSES.includes(message.status) &&
    !OUTREACH_DELIVERY_EXCEPTIONS.includes(message.providerDeliveryStatus);
}
