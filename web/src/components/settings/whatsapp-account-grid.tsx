import { cn } from '@/lib/utils'
import type { WhatsAppAccount } from '@/api/types'

/**
 * Selectable card grid of WhatsApp accounts (name, phone, connection status,
 * sent-today).
 */
export function WhatsAppAccountGrid({
  accounts,
  selectedAccountId,
  onSelect,
}: {
  accounts: WhatsAppAccount[]
  selectedAccountId: number | null
  onSelect: (id: number) => void
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {accounts.map((account) => {
        const active = account.id === selectedAccountId
        return (
          <button
            key={account.id}
            onClick={() => onSelect(account.id)}
            className={cn(
              'rounded-md border p-4 text-left transition-all',
              active
                ? 'border-accent bg-accent-muted/30'
                : 'border-border bg-surface hover:border-accent/30 hover:bg-surface-raised',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{account.name}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {account.phone || 'No phone connected yet'}
                </p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                  account.enabled
                    ? 'bg-success-muted text-success'
                    : 'bg-surface-raised text-text-muted',
                )}
              >
                {account.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-text-muted">
              <span className="rounded-full bg-surface-raised px-2 py-1">
                {account.provider === 'aisensy' ? 'AiSensy' : 'Meta Cloud API'}
              </span>
              <span className="rounded-full bg-surface-raised px-2 py-1">{account.status}</span>
              <span className="rounded-full bg-surface-raised px-2 py-1">
                {account.messagesSentToday} sent today
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
