/**
 * Shared pieces of the lead insight display.
 *
 * Extracted from leads.tsx, which had grown to 2,195 lines — large enough that
 * every change to the table meant scrolling past six hundred lines of drawer.
 * These are the parts both the drawer and the communications panel need.
 */
import type { LeadInsightEntities } from '@/api/types'
export type InsightEntityKey = keyof LeadInsightEntities

export const INSIGHT_ENTITY_LABELS: Record<InsightEntityKey, string> = {
  productMentioned: 'Product',
  quantityMentioned: 'Quantity',
  locationMentioned: 'Location',
  priceMentioned: 'Price',
  objection: 'Objection',
}

export const URGENCY_STYLES = {
  high: 'bg-danger-muted text-danger',
  medium: 'bg-warning-muted text-warning',
  low: 'bg-success-muted text-success',
} as const

export const CONFIDENCE_STYLES = {
  high: 'bg-success-muted text-success',
  medium: 'bg-warning-muted text-warning',
  low: 'bg-surface text-text-muted',
} as const

export function safeParseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function prettifyToken(value: string | null | undefined) {
  if (!value) return '—'
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function normalizeWebsiteUrl(value: string | null | undefined) {
  if (!value) return null
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

export function InsightMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-2 text-sm font-medium text-text-primary">{value}</p>
    </div>
  )
}
