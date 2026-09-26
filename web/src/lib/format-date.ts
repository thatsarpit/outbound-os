/**
 * Unified date formatting.
 *
 * Every page in the dashboard should call `formatDate(date, style)` instead
 * of reaching for `toLocaleDateString`, ad-hoc `format()` calls, or inline
 * "22 May" strings. That way the workspace reads consistently:
 *
 *   relative "just now", "5m ago", "2h ago", "3d ago", "22 May" (older)
 *   short "22 May"
 *   medium "22 May 2026"
 *   long "22 May 2026, 4:32 PM"
 *   datetime "22 May 2026 · 4:32 PM IST"
 *   time "4:32 PM"
 *   iso       2026-05-22T16:32:00.000Z
 *
 * `null` / `undefined` / unparseable input returns the optional fallback
 * (default empty string) — so call sites don't have to guard before passing.
 */

export type DateStyle = 'relative' | 'short' | 'medium' | 'long' | 'datetime' | 'time' | 'iso'

const LOCALE = 'en-IN'
const TZ_LABEL = 'IST'

function toDate(input: string | number | Date | null | undefined): Date | null {
  if (input == null) return null
  const d = input instanceof Date ? input : new Date(input)
  return isNaN(d.getTime()) ? null : d
}

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })
}

export function formatDate(
  input: string | number | Date | null | undefined,
  style: DateStyle = 'short',
  fallback = '',
): string {
  const d = toDate(input)
  if (!d) return fallback

  switch (style) {
    case 'relative':
      return formatRelative(d)
    case 'short':
      return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })
    case 'medium':
      return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
    case 'long':
      return d.toLocaleString(LOCALE, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    case 'datetime': {
      const date = d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
      const time = d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' })
      return `${date} · ${time} ${TZ_LABEL}`
    }
    case 'time':
      return d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' })
    case 'iso':
      return d.toISOString()
  }
}

/**
 * Back-compat alias for the old `formatRelativeTime(date)` import path.
 * New code should call `formatDate(date, 'relative')`.
 *
 * @deprecated Use `formatDate(date, 'relative')`.
 */
export function formatRelativeTime(date: string | number | Date | null | undefined): string {
  return formatDate(date, 'relative', 'Unknown')
}
