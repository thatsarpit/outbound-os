import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RangeKey = '7d' | '14d' | '30d' | '90d' | 'custom'

export type RangeValue = {
  key: RangeKey
  /** ISO date (YYYY-MM-DD). Only set when key === 'custom'. */
  from?: string
  /** ISO date (YYYY-MM-DD). Only set when key === 'custom'. */
  to?: string
}

const PRESETS: { key: RangeKey; label: string; days?: number }[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '14d', label: 'Last 14 days', days: 14 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'custom', label: 'Custom range' },
]

function formatRange(value: RangeValue): string {
  const preset = PRESETS.find((p) => p.key === value.key)
  if (value.key === 'custom' && value.from && value.to) {
    return `${value.from} → ${value.to}`
  }
  return preset?.label ?? 'Last 30 days'
}

type RangePickerProps = {
  value: RangeValue
  onChange: (v: RangeValue) => void
  className?: string
  align?: 'left' | 'right'
}

export function RangePicker({ value, onChange, className, align = 'right' }: RangePickerProps) {
  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(value.from ?? '')
  const [customTo, setCustomTo] = useState(value.to ?? '')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const select = (k: RangeKey) => {
    if (k === 'custom') {
      // keep open so user can pick dates
      return
    }
    onChange({ key: k })
    setOpen(false)
  }

  const applyCustom = () => {
    if (!customFrom || !customTo) return
    onChange({ key: 'custom', from: customFrom, to: customTo })
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-raised"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Calendar aria-hidden="true" className="h-4 w-4 text-text-muted" />
        <span>{formatRange(value)}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn('h-4 w-4 text-text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute z-50 mt-2 w-72 overflow-hidden rounded-md border border-border bg-surface shadow-2xl animate-fade-in',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <div className="p-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                role="option"
                aria-selected={value.key === p.key}
                onClick={() => select(p.key)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors',
                  value.key === p.key
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
                )}
              >
                <span>{p.label}</span>
                {value.key === p.key && (
                  <span aria-hidden="true" className="text-xs">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>

          {value.key === 'custom' || PRESETS.every((p) => p.key !== value.key) ? (
            <div className="border-t border-border p-3">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                From
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-sm text-text-primary"
                />
              </label>
              <label className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                To
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-sm text-text-primary"
                />
              </label>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!customFrom || !customTo}
                className="mt-3 w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply custom range
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * Resolve a RangeValue to concrete from/to ISO dates (YYYY-MM-DD)
 * and day-count. Useful for query params.
 */
export function resolveRange(value: RangeValue): { from: string; to: string; days: number } {
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (value.key === 'custom' && value.from && value.to) {
    const from = new Date(value.from)
    const to = new Date(value.to)
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1)
    return { from: value.from, to: value.to, days }
  }
  const preset = PRESETS.find((p) => p.key === value.key)
  const days = preset?.days ?? 30
  const from = new Date(today)
  from.setDate(from.getDate() - (days - 1))
  return { from: iso(from), to: iso(today), days }
}
