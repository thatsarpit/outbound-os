/**
 * Pieces shared by the campaigns page, its create modal and its detail drawer.
 *
 * Extracted from campaigns.tsx, which had reached 1,414 lines — the largest
 * file in the dashboard. These are the parts more than one of those three
 * consumers needs; anything used by only one moved with that consumer.
 */
import { getChannel } from '@/lib/channels'
import { cn } from '@/lib/utils'
export function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function percent(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0
}

export type CampaignStatusKey = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed'

/** The server has used both `running` and `active` for a live campaign. */
export function normalizeStatus(status: string | null | undefined): CampaignStatusKey {
  switch (status) {
    case 'active':
    case 'live':
    case 'running':
      return 'running'
    case 'scheduled':
      return 'scheduled'
    case 'paused':
      return 'paused'
    case 'completed':
      return 'completed'
    default:
      return 'draft'
  }
}

/* Status was a filled Badge on every card. Stacked down a list, filled pills
   read as a wall of colour; a dot plus a label carries the same state in a mark
   small enough to scan past. Same treatment as the Leads table. */
export const STATUS_META: Record<CampaignStatusKey, { label: string; dot: string }> = {
  running: { label: 'Live', dot: 'bg-success' },
  scheduled: { label: 'Queued', dot: 'bg-info' },
  paused: { label: 'Paused', dot: 'bg-warning' },
  draft: { label: 'Draft', dot: 'bg-text-muted' },
  completed: { label: 'Completed', dot: 'bg-accent' },
}

export function StatusMark({
  status,
  className,
}: {
  status: string | null | undefined
  className?: string
}) {
  const meta = STATUS_META[normalizeStatus(status)]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-[13px] text-text-secondary', className)}
    >
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

/** Channel identity comes from lib/channels — icon first, colour second. */
export function ChannelMark({
  channel,
  className,
}: {
  channel: string | null
  className?: string
}) {
  const base = cn('inline-flex items-center gap-1.5 text-[13px] text-text-secondary', className)

  if (channel === 'both') {
    const wa = getChannel('whatsapp')
    const email = getChannel('email')
    const WaIcon = wa.icon
    const EmailIcon = email.icon
    return (
      <span className={base}>
        <WaIcon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', wa.text)} />
        <EmailIcon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', email.text)} />
        <span className="truncate">WA + Email</span>
      </span>
    )
  }

  const meta = getChannel(channel)
  const Icon = meta.icon
  return (
    <span className={base}>
      <Icon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', meta.text)} />
      <span className="truncate">{meta.label}</span>
    </span>
  )
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1 overflow-hidden rounded-full bg-surface-raised', className)}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export function campaignLeadDot(status: string): string {
  switch (status) {
    case 'replied':
      return 'bg-success'
    case 'sent':
      return 'bg-info'
    case 'failed':
      return 'bg-danger'
    default:
      return 'bg-text-muted'
  }
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-text-secondary">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        )}
      </span>
      <div className="mt-1">{children}</div>
      {error ? (
        <p role="alert" className="mt-1 text-[11px] text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>
      )}
    </label>
  )
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-md border border-border bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          {title}
        </h3>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/* ── Form chrome ──
   Matches the field pattern on the Account page: 36px control, 7px radius,
   hairline border, and the focus ring in the one blue the system allows. */
export const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] text-text-primary placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted disabled:opacity-60'
export const textareaClass =
  'w-full rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] leading-5 text-text-primary placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted'
