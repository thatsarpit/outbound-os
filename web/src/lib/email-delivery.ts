import type { InboxMessage } from '@/api/types'

export function describeEmailDelivery(
  message: Pick<InboxMessage, 'status' | 'providerDeliveryStatus' | 'emailInboundKind'>,
) {
  const inbound = message.emailInboundKind
  if (inbound && inbound !== 'human') {
    return {
      label:
        inbound === 'delivery_report'
          ? 'Delivery report'
          : inbound === 'automatic_reply'
            ? 'Automatic reply'
            : 'Awaiting classification',
      temporary: false,
      failed: false,
      detail:
        inbound === 'pending'
          ? 'This email is still downloading. It has not been counted as a customer reply.'
          : 'Recorded in the conversation; excluded from customer reply counts.',
    }
  }
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

export function isReplyableEmail(
  message: Pick<InboxMessage, 'channel' | 'direction' | 'status' | 'emailInboundKind'>,
) {
  return (
    message.channel === 'email' &&
    (message.direction === 'outbound' ||
      (message.status !== 'partial' &&
        (!message.emailInboundKind || message.emailInboundKind === 'human')))
  )
}
