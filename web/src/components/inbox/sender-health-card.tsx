import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { InboxSenderAccount } from '@/api/types'
import { cn } from '@/lib/utils'

type SenderHealthCardProps = {
  leadEmail?: string | null
  emailStatus?: string | null
  accounts: InboxSenderAccount[]
  selectedAccountId: number | null
  assignedAccountId?: number | null
  className?: string
}

function isVerified(account: InboxSenderAccount) {
  return account.enabled && (account.isVerified ?? account.status === 'verified')
}

export function SenderHealthCard({
  leadEmail,
  emailStatus,
  accounts,
  selectedAccountId,
  className,
}: SenderHealthCardProps) {
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null
  const verifiedAccounts = accounts.filter(isVerified)

  const state = !leadEmail
    ? 'missing_email'
    : !accounts.length
      ? 'missing_sender'
      : !selectedAccount
        ? 'no_selection'
        : !selectedAccount.enabled
          ? 'disabled'
          : !isVerified(selectedAccount)
            ? 'unverified'
            : 'ready'

  const toneClasses =
    state === 'ready'
      ? 'border-success/20 bg-success-muted/20'
      : 'border-warning/30 bg-warning-muted/30'
  const icon =
    state === 'ready' ? (
      <CheckCircle2 className="h-4 w-4 text-success" />
    ) : (
      <AlertCircle className="h-4 w-4 text-warning" />
    )

  const title =
    state === 'missing_email'
      ? 'Lead email missing'
      : state === 'missing_sender'
        ? 'No sender mailbox available'
        : state === 'no_selection'
          ? 'Select a sender mailbox'
          : state === 'disabled'
            ? 'Selected mailbox is disabled'
            : state === 'unverified'
              ? 'Selected mailbox is not verified'
              : 'Email route is ready'

  const description =
    state === 'missing_email'
      ? 'Add an email address to this lead before replying by email.'
      : state === 'missing_sender'
        ? 'Add and verify a sender mailbox in Integrations before the team can send email from this workspace.'
        : state === 'no_selection'
          ? `Choose one of the ${verifiedAccounts.length} verified mailbox${verifiedAccounts.length === 1 ? '' : 'es'} available for this lead before sending.`
          : state === 'disabled'
            ? 'Choose another sender mailbox or re-enable this mailbox in Integrations.'
            : state === 'unverified'
              ? 'Use a verified mailbox before sending email replies or campaigns.'
              : `Replies will send from ${selectedAccount?.senderName || selectedAccount?.name || selectedAccount?.email}.`

  return (
    <div className={cn('rounded-md border px-3 py-2', toneClasses, className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon}
            <p
              className={cn(
                'text-sm font-medium',
                state === 'ready' ? 'text-success' : 'text-warning',
              )}
            >
              {title}
            </p>
          </div>
          <p className="mt-1 text-xs leading-5 text-text-secondary">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {emailStatus && (
            <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-text-secondary">
              Lead email: {emailStatus}
            </span>
          )}
          {!!accounts.length && (
            <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-text-secondary">
              {verifiedAccounts.length} verified
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
