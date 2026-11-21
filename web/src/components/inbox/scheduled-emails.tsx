import type { ScheduledInboxEmail } from '@/api/types'

const LABELS: Record<ScheduledInboxEmail['status'], string> = {
  queued: 'Scheduled',
  sending: 'Sending',
  unconfirmed: 'Confirmation unknown',
  permanently_failed: 'Failed',
  cancelled: 'Cancelled',
}

function guidance(email: ScheduledInboxEmail) {
  if (email.status === 'unconfirmed') return 'Check the sender’s history before sending again.'
  if (email.providerStatusReason === 'email_attachment_unavailable')
    return 'A file is missing. Create a new email with the file attached.'
  if (email.providerStatusReason === 'email_attachments_unsupported')
    return 'This sender cannot send attachments. Choose an SMTP sender for a new email.'
  if (
    email.providerStatusReason === 'scheduled_email_conversation_changed' ||
    email.providerStatusReason === 'human_reply_received'
  )
    return 'Review the current conversation before scheduling another email.'
  if (email.providerStatusReason === 'recipient_suppressed')
    return 'This address is suppressed for email.'
  if (email.status === 'permanently_failed')
    return 'Review the sender and delivery status before creating a new email.'
  return null
}

export function ScheduledEmails({ emails = [] }: { emails?: ScheduledInboxEmail[] }) {
  if (!emails.length) return null
  return (
    <details className="shrink-0 border-b border-border px-4 py-2 text-sm">
      <summary className="cursor-pointer py-1 font-medium text-text-secondary">
        Scheduled email activity ({emails.length})
      </summary>
      <ul className="max-h-40 divide-y divide-border-subtle overflow-y-auto">
        {emails.map((email) => {
          const detail = guidance(email)
          return (
            <li key={email.id} className="space-y-0.5 py-2">
              <p className="break-words font-medium text-text-primary">
                {email.emailSubject || 'No subject'}
              </p>
              <p className="text-xs text-text-secondary">
                {LABELS[email.status]}
                {email.scheduledAt && (
                  <>
                    {' '}
                    ·{' '}
                    <time dateTime={email.scheduledAt}>
                      {new Date(email.scheduledAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </time>
                  </>
                )}
              </p>
              {detail && <p className="text-xs text-text-secondary">{detail}</p>}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
