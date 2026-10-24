import type { LeadFilters } from '@/api/endpoints/leads'

/**
 * Saved views — named filter presets for the Leads table.
 *
 * Stored per account in this browser: there is no server-side route for
 * them, and an operator's working set ("my hot leads this week") is personal
 * anyway. If a route appears later, this module is the only thing that has to
 * change.
 */

export interface SavedView {
  id: string
  name: string
  /** Only the filter fields — never `page`, which would pin a view to a page. */
  filters: Omit<LeadFilters, 'page'>
}

const storageKey = (scope: string) => `outboundos_leads_views:v2:${encodeURIComponent(scope)}`

/** Fields that make up a view. `page` is deliberately excluded. */
export function viewFiltersFrom(filters: LeadFilters): Omit<LeadFilters, 'page'> {
  const rest = { ...filters }
  delete rest.page
  return rest
}

export function loadViews(scope: string): SavedView[] {
  try {
    const raw = localStorage.getItem(storageKey(scope))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    // Anything could be in storage — another tab, an older build, a person
    // editing it by hand. Validate rather than trusting the shape.
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (v): v is SavedView =>
        !!v &&
        typeof v === 'object' &&
        typeof (v as SavedView).id === 'string' &&
        typeof (v as SavedView).name === 'string' &&
        !!(v as SavedView).filters &&
        typeof (v as SavedView).filters === 'object',
    )
  } catch {
    return []
  }
}

export function saveViews(views: SavedView[], scope: string): void {
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(views))
  } catch {
    // Storage blocked or full — views stay in memory for this session.
  }
}

/** True when two filter sets would produce the same query. */
export function sameFilters(a: Omit<LeadFilters, 'page'>, b: Omit<LeadFilters, 'page'>): boolean {
  const norm = (f: Omit<LeadFilters, 'page'>) =>
    JSON.stringify(
      Object.entries(f)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .sort(([x], [y]) => x.localeCompare(y)),
    )
  return norm(a) === norm(b)
}
