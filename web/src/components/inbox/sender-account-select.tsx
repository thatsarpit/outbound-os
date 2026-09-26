import type { InboxSenderAccount } from '@/api/types'
import { cn } from '@/lib/utils'

export function SenderAccountSelect({
  accounts,
  value,
  onChange,
  disabled = false,
  className,
}: {
  accounts: InboxSenderAccount[]
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <select
      value={value != null ? String(value) : ''}
      onChange={(event) => {
        const nextValue = event.target.value
        onChange(nextValue ? Number(nextValue) : null)
      }}
      disabled={disabled}
      className={cn(
        'min-h-11 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none transition-colors',
        'focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {accounts.length === 0 ? (
        <option value="">No sender available</option>
      ) : (
        <>
          <option value="">Select sender</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.senderName || account.name || account.email}
              {account.email ? ` (${account.email})` : ''}
              {account.enabled ? '' : ' · disabled'}
              {account.enabled && (account.isVerified ?? account.status === 'verified')
                ? ' · verified'
                : ''}
            </option>
          ))}
        </>
      )}
    </select>
  )
}
