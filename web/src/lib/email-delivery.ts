import type { InboxMessage } from '@/api/types'

export function describeEmailDelivery(
  message: Pick<InboxMessage, 'status' | 'providerDeliveryStatus'>,
) {
  const temporary = ['soft_bounce', 'deferred'].includes(message.providerDeliveryStatus || '')
  const failed = ['hard_bounce', 'invalid', 'blocked', 'error'].includes(
    message.providerDeliveryStatus || '',
  )
  const label = failed
    ? 'Delivery failed'
    : temporary
      ? 'Temporary delivery issue'
      : message.providerDeliveryStatus === 'sent'
        ? 'Accepted by Brevo'
        : message.providerDeliveryStatus === 'opened'
          ? 'Tracked open'
          : message.providerDeliveryStatus === 'click'
            ? 'Link clicked'
            : message.status
  return {
    label,
    temporary,
    failed,
    detail: failed
      ? 'Brevo reported a delivery failure. Review the sender and recipient before trying again.'
      : temporary
        ? 'Brevo reported a temporary delivery problem. This email has not been confirmed delivered.'
        : null,
  }
}
