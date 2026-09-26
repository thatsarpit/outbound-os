import { useRef, useState, type KeyboardEvent } from 'react'
import { Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { TEMPLATE_VARIABLES, type TemplateVariable } from '@/lib/template-variables'

/**
 * Body editor for message/email templates: a raw-source textarea (templates are
 * HTML + `{{merge}}` fields, so raw source is the correct surface) augmented
 * with merge-variable affordances —
 *   - click-to-insert chips below the field, and
 *   - a `{{`-triggered autocomplete dropdown with keyboard nav.
 *
 * Both insert at the caret and keep the value controlled by the parent.
 */
export function TemplateBodyEditor({
  label = 'Body',
  value,
  onChange,
  rows = 11,
  placeholder,
  description,
  required,
}: {
  label?: string
  value: string
  onChange: (next: string) => void
  rows?: number
  placeholder?: string
  description?: string
  required?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // Active `{{partial` autocomplete: the partial token text + the index where
  // the `{{` starts, so we can replace from there on accept. null = closed.
  const [trigger, setTrigger] = useState<{ partial: string; start: number } | null>(null)
  const [highlight, setHighlight] = useState(0)

  const matches: TemplateVariable[] = trigger
    ? TEMPLATE_VARIABLES.filter((v) => v.token.startsWith(trigger.partial.toLowerCase()))
    : []

  /** Recompute the autocomplete trigger from the text + caret position. */
  function syncTrigger(text: string, caret: number) {
    // Look at the text immediately before the caret for an unclosed `{{partial`.
    const before = text.slice(0, caret)
    const m = before.match(/\{\{\s*([\w]*)$/)
    if (m) {
      setTrigger({ partial: m[1], start: caret - m[0].length })
      setHighlight(0)
    } else {
      setTrigger(null)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value
    onChange(text)
    syncTrigger(text, e.target.selectionStart ?? text.length)
  }

  /** Insert `{{token}}` at the caret (or replace the active `{{partial`). */
  function insertToken(token: string) {
    const el = ref.current
    const snippet = `{{${token}}}`
    if (!el) {
      onChange(value + snippet)
      return
    }
    const caret = el.selectionStart ?? value.length
    const from = trigger ? trigger.start : caret
    const to = caret
    const next = value.slice(0, from) + snippet + value.slice(to)
    onChange(next)
    setTrigger(null)
    // Restore caret just after the inserted token.
    const pos = from + snippet.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!trigger || matches.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % matches.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h - 1 + matches.length) % matches.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertToken(matches[highlight].token)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setTrigger(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={ref}
          label={label}
          required={required}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setTrigger(null), 120)}
          rows={rows}
          placeholder={placeholder}
          className="font-mono text-xs leading-6"
          description={description}
        />

        {trigger && matches.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-surface-overlay shadow-md"
          >
            {matches.map((v, i) => (
              <li key={v.token} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  // onMouseDown (not onClick) so it fires before the textarea blur.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertToken(v.token)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors',
                    // Active option uses the selection treatment from
                    // data-table, so "what Enter will insert" reads the same
                    // here as "what row is selected" elsewhere.
                    i === highlight
                      ? 'bg-focus-muted text-text-primary'
                      : 'text-text-secondary hover:bg-surface-raised',
                  )}
                >
                  <span className="font-mono">{`{{${v.token}}}`}</span>
                  <span className="text-[10px] text-text-muted">{v.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          Insert
        </span>
        {TEMPLATE_VARIABLES.map((v) => (
          <button
            key={v.token}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              insertToken(v.token)
            }}
            title={v.label}
            className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {`{{${v.token}}}`}
          </button>
        ))}
      </div>
    </div>
  )
}
