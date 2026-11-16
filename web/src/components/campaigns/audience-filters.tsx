import { Input } from '@/components/ui'
import { inputClass, textareaClass } from './campaign-shared'

export function parseAudienceFilter(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return {}
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

export function AudienceFilters({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const filter = parseAudienceFilter(value)
  const setFilter = (key: string, next: string | number) => {
    const updated = { ...filter }
    if (next === '') delete updated[key]
    else updated[key] = next
    onChange(Object.keys(updated).length ? JSON.stringify(updated, null, 2) : '')
  }
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold text-text-primary">Who should receive it?</legend>
      <p className="text-xs leading-5 text-text-muted">
        Combine filters to narrow the audience. Replies, pauses and channel eligibility are checked in the preview.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-medium text-text-secondary">
          <span>Lead status</span>
          <select
            className={inputClass}
            disabled={!filter}
            value={typeof filter?.status === 'string' ? filter.status : ''}
            onChange={event => setFilter('status', event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="replied">Replied</option>
            <option value="engaged">Engaged</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </select>
          {Array.isArray(filter?.status) && <span className="block text-text-muted">Multiple statuses selected in advanced filters.</span>}
        </label>
        <Input
          label="Country"
          placeholder="e.g. United Kingdom"
          disabled={!filter}
          value={String(filter?.country ?? '')}
          onChange={event => setFilter('country', event.target.value)}
        />
        <Input
          label="Tags"
          placeholder="e.g. distributor, autumn"
          description="Leads must have every listed tag."
          disabled={!filter}
          value={Array.isArray(filter?.tags) ? filter.tags.join(', ') : String(filter?.tags ?? '')}
          onChange={event => setFilter('tags', event.target.value)}
        />
        <Input
          label="Minimum score"
          type="number"
          min={0}
          max={100}
          placeholder="Any score"
          disabled={!filter}
          value={typeof filter?.minScore === 'number' ? filter.minScore : ''}
          onChange={event => setFilter('minScore', event.target.value === '' ? '' : Number(event.target.value))}
        />
      </div>
      <details className="border-t border-border-subtle pt-3">
        <summary className="cursor-pointer text-xs font-medium text-text-secondary">Advanced filters</summary>
        <label className="mt-3 block space-y-2 text-xs text-text-muted">
          <span>JSON filter for source, product, score range or multiple statuses.</span>
          <textarea
            className={textareaClass + ' font-mono text-xs'}
            rows={5}
            value={value}
            onChange={event => onChange(event.target.value)}
            aria-label="Advanced audience filter"
            aria-invalid={!filter}
            aria-describedby={!filter ? 'audience-filter-error' : undefined}
            placeholder='{"source":"website","olderThanDays":30}'
          />
        </label>
      </details>
      {!filter && <p id="audience-filter-error" role="alert" className="text-xs text-danger">Correct the JSON object in advanced filters to continue.</p>}
    </fieldset>
  )
}
