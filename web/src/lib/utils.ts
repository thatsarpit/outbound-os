import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Compact form for tight spaces (chips, axis ticks, inline counts).
 * Do NOT use for a headline figure a person needs to read exactly — "1.4K"
 * hides whether that is 1,392 or 1,449. Use `formatCount` there.
 */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/** Exact, thousands-separated. The default for metrics and table cells. */
export function formatCount(n: number): string {
  return n.toLocaleString()
}

/** Whole-unit money for summaries. Pass the workspace currency (useHomeCurrency). */
export function formatCurrency(n: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`
  }
}

// Date formatting now lives in `@/lib/format-date`. This re-export keeps
// the old import path working — prefer `formatDate(date, 'relative')` going forward.
export { formatDate, formatRelativeTime } from './format-date'
export type { DateStyle } from './format-date'

export function getLeadTierColor(tier: string | null): string {
  switch (tier) {
    case 'HOT':
      return 'text-hot'
    case 'WARM':
      return 'text-warm'
    case 'COLD':
      return 'text-cold'
    default:
      return 'text-text-muted'
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'new':
      return 'bg-info-muted text-info'
    case 'contacted':
      return 'bg-warning-muted text-warning'
    case 'replied':
      return 'bg-accent-muted text-accent'
    case 'engaged':
      return 'bg-success-muted text-success'
    case 'closed':
      return 'bg-success-muted text-success'
    case 'paused':
      return 'bg-danger-muted text-danger'
    case 'wa_unavailable':
      return 'bg-danger-muted text-danger'
    default:
      return 'bg-surface-raised text-text-secondary'
  }
}
