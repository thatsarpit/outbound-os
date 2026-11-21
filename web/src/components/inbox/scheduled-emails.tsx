import type { ScheduledInboxEmail } from '@/api/types'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { inboxApi } from '@/api/endpoints/inbox'
import { Button, Input } from '@/components/ui'
import { ConfirmDialog } from '@/components/ui/dialog'
import { emailScheduleDate } from '@/lib/email-compose'
import { taskDateInput } from '@/lib/task-date'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'

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

export function ScheduledEmails({ emails = [], leadId }: { emails?: ScheduledInboxEmail[]; leadId: number | undefined }) {
  const canEdit = useAuthStore((state) => Boolean(state.user && state.user.role !== 'viewer'))
  const queryClient = useQueryClient()
  const [action, setAction] = useState<{ email: ScheduledInboxEmail; cancel: boolean } | null>(null)
  const [time, setTime] = useState('')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const change = useMutation({
    mutationFn: async ({ email, cancel }: NonNullable<typeof action>) => {
      if (!leadId) throw new Error('Conversation is unavailable.')
      return cancel
        ? inboxApi.cancelScheduledEmail(leadId, email.id)
        : inboxApi.rescheduleEmail(leadId, email.id, emailScheduleDate(time, timezone))
    },
    onSuccess: (_result, { cancel }) => {
      toast.success(cancel ? 'Scheduled email cancelled' : 'Email rescheduled')
      setAction(null)
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['inbox-thread', leadId] }),
      queryClient.invalidateQueries({ queryKey: ['delivery-review'] }),
    ]),
    meta: { silent: true },
  })
  function choose(email: ScheduledInboxEmail, cancel: boolean) {
    change.reset()
    setTime(taskDateInput(email.scheduledAt, timezone))
    setAction({ email, cancel })
  }

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
              {email.status === 'queued' && canEdit && (
                <div className="mt-1 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => choose(email, false)}>Reschedule</Button>
                  <Button size="sm" variant="ghost" onClick={() => choose(email, true)}>Cancel email</Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {action && (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open && !change.isPending) setAction(null) }}
          title={action.cancel ? 'Cancel scheduled email?' : 'Reschedule email'}
          description={action.email.emailSubject || 'No subject'}
          confirmLabel={action.cancel ? 'Cancel email' : 'Save new time'}
          cancelLabel="Back"
          destructive={action.cancel}
          isLoading={change.isPending}
          onConfirm={() => change.mutate(action)}
        >
          {!action.cancel && <Input label={`Send time in ${timezone}`} type="datetime-local" value={time}
            onChange={(event) => setTime(event.target.value)} disabled={change.isPending} />}
          {change.error && <p role="alert" className="mt-2 text-sm text-danger">{change.error.message}</p>}
        </ConfirmDialog>
      )}
    </details>
  )
}
