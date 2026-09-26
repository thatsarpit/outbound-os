import { Input, Textarea, SwitchField, SelectField as UISelectField } from '@/components/ui'

/**
 * Thin field wrappers shared across every Settings section. Each is a small
 * adapter over a `@/components/ui` primitive that fixes the label/onChange
 * signature the section pages expect. Extracted from the former settings.tsx.
 */

export function SettingsField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  onBlur,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  error?: string
  onBlur?: () => void
}) {
  return (
    <Input
      label={label}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      error={error}
    />
  )
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return <UISelectField label={label} value={value} onValueChange={onChange} options={options} />
}

export function TextareaField({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <Textarea
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
    />
  )
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-text-secondary">{label}</span>
      <div className="rounded-md border border-border bg-surface-raised px-3.5 py-2.5 text-sm text-text-secondary">
        {value}
      </div>
    </div>
  )
}

export function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <SwitchField
      label={label}
      description={description}
      checked={checked}
      onCheckedChange={onChange}
    />
  )
}
