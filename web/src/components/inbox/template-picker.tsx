import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TemplatePickerOption = {
  id: number
  name: string
  category?: string | null
}

type TemplatePickerProps = {
  templates: TemplatePickerOption[]
  value: number | null
  onChange: (value: number | null) => void
  onApply: () => void
  loading?: boolean
  applyPending?: boolean
  disabled?: boolean
  label?: string
  description?: string
  className?: string
}

export function TemplatePicker({
  templates,
  value,
  onChange,
  onApply,
  loading = false,
  applyPending = false,
  disabled = false,
  label = 'Email template',
  description = 'Apply a rendered template to the composer with live lead context.',
  className,
}: TemplatePickerProps) {
  return (
    <div className={cn('rounded-md border border-border bg-surface-raised/70 p-4', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            {label}
          </p>
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <select
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
          disabled={disabled || loading}
          className="form-input disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Select template</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} {template.category ? `(${template.category})` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onApply}
          disabled={!value || applyPending || disabled}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-background disabled:opacity-50"
        >
          {applyPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 text-accent" />
          )}
          Apply template
        </button>
      </div>
    </div>
  )
}
