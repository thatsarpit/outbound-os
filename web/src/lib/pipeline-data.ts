export const PIPELINE_STAGES = [
  { key: 'new', label: 'New', hint: 'New leads awaiting the first contact.' },
  { key: 'contacted', label: 'Contacted', hint: 'Leads already reached by the team.' },
  { key: 'replied', label: 'Replied', hint: 'Customer replies ready for a response.' },
  { key: 'engaged', label: 'Engaged', hint: 'Active sales conversations.' },
  { key: 'closed', label: 'Closed', hint: 'Closed opportunities; automation has stopped.' },
] as const
export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]['key']

export const OUTSIDE_PIPELINE_STAGES = [
  { key: 'paused', label: 'Paused' },
  { key: 'wa_unavailable', label: 'WhatsApp unavailable' },
  { key: 'wa_undelivered', label: 'WhatsApp undelivered' },
] as const

export interface PipelinePage<T> {
  leads: T[]
  total: number
  page: number
  pages: number
}

/** A failed/malformed response must not become a convincing zero-lead stage. */
export function pipelinePage<T>(value: unknown): PipelinePage<T> {
  if (!value || typeof value !== 'object') throw new Error('Pipeline data is unavailable.')
  const row = value as Record<string, unknown>
  if (
    !Array.isArray(row.leads) ||
    !Number.isSafeInteger(row.total) ||
    Number(row.total) < 0 ||
    !Number.isSafeInteger(row.page) ||
    Number(row.page) < 1 ||
    !Number.isSafeInteger(row.pages) ||
    Number(row.pages) < 0
  )
    throw new Error('Pipeline data could not be verified. Try again.')
  return {
    leads: row.leads as T[],
    total: Number(row.total),
    page: Number(row.page),
    pages: Number(row.pages),
  }
}

/** Offset pages can overlap when leads move during a background refresh. */
export function loadedPipelineLeads<T extends { id: number }>(pages: PipelinePage<T>[]): T[] {
  const leads = new Map<number, T>()
  for (const page of pages) for (const lead of page.leads) leads.set(lead.id, lead)
  return [...leads.values()]
}

export function nextPipelinePage(page: PipelinePage<unknown>): number | undefined {
  return page.page < page.pages ? page.page + 1 : undefined
}
