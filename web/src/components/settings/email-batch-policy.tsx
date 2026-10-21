import { useEffect, useId, useState } from 'react'
import { Button, Input } from '@/components/ui'
import type { dailyEmailApi, DailyEmailStatus } from '@/api/endpoints/email'
import { toast } from '@/stores/toast-store'

type PolicySettings = Parameters<typeof dailyEmailApi.update>[0]

export function BatchPolicyForm({
  status,
  pending,
  canManage,
  onSave,
  onDirty,
}: {
  status: DailyEmailStatus
  pending: boolean
  canManage: boolean
  onSave: (settings: PolicySettings) => Promise<DailyEmailStatus>
  onDirty: (dirty: boolean) => void
}) {
  const templateField = useId()
  const [countries, setCountries] = useState(status.countries.join(', '))
  const [templateId, setTemplateId] = useState(status.templateId ? String(status.templateId) : '')
  const [senderIds, setSenderIds] = useState(status.senderIds)
  const [batchSize, setBatchSize] = useState(String(status.batchSize))
  const [quota, setQuota] = useState(String(status.perSenderQuota))
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (dirty) return
    setCountries(status.countries.join(', '))
    setTemplateId(status.templateId ? String(status.templateId) : '')
    setSenderIds(status.senderIds)
    setBatchSize(String(status.batchSize))
    setQuota(String(status.perSenderQuota))
  }, [
    status.countries,
    status.templateId,
    status.senderIds,
    status.batchSize,
    status.perSenderQuota,
    dirty,
  ])
  const edited = () => {
    setDirty(true)
    onDirty(true)
  }
  const save = async () => {
    const size = Number(batchSize)
    const perSenderQuota = Number(quota)
    if (
      !Number.isInteger(size) ||
      size < 1 ||
      size > 200 ||
      !Number.isInteger(perSenderQuota) ||
      perSenderQuota < 1 ||
      perSenderQuota > 150
    ) {
      toast.error('Use 1–200 recipients per batch and 1–150 per sender')
      return
    }
    try {
      await onSave({
        countries: countries
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        templateId: templateId ? Number(templateId) : null,
        senderIds,
        batchSize: size,
        perSenderQuota,
      })
      setDirty(false)
      onDirty(false)
      toast.success('Batch policy saved. Preview it before sending.')
    } catch {
      /* The mutation shows the server error and preserves the draft. */
    }
  }
  return (
    <fieldset disabled={!canManage || pending} className="space-y-5 disabled:opacity-70">
      <legend className="mb-3 text-sm font-medium text-text-primary">
        Audience, template and senders
      </legend>
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          className="min-h-11 text-base sm:min-h-10 sm:text-sm"
          label="Allowed countries"
          value={countries}
          placeholder="US, UK, Australia"
          description="Comma-separated names or country codes. Blank countries and every other country are excluded."
          onChange={(event) => {
            setCountries(event.target.value)
            edited()
          }}
        />
        <div className="space-y-1.5">
          <label htmlFor={templateField} className="text-xs font-medium text-text-secondary">
            Saved email template
          </label>
          <select
            id={templateField}
            value={templateId}
            onChange={(event) => {
              setTemplateId(event.target.value)
              edited()
            }}
            className="min-h-11 w-full rounded-md border border-border bg-surface-raised px-3 text-base text-text-primary sm:text-sm"
          >
            <option value="">Choose a saved template</option>
            {status.templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
        <Input
          className="min-h-11 text-base sm:min-h-10 sm:text-sm"
          label="Recipients per batch"
          type="number"
          min={1}
          max={200}
          value={batchSize}
          onChange={(event) => {
            setBatchSize(event.target.value)
            edited()
          }}
        />
        <Input
          className="min-h-11 text-base sm:min-h-10 sm:text-sm"
          label="Maximum per sender"
          type="number"
          min={1}
          max={150}
          value={quota}
          onChange={(event) => {
            setQuota(event.target.value)
            edited()
          }}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-medium text-text-secondary">
          Selected Brevo senders
        </legend>
        {status.accounts
          .filter((account) => account.provider === 'brevo')
          .map((account) => (
            <label
              key={account.id}
              className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto]"
            >
              <input
                type="checkbox"
                checked={senderIds.includes(account.id)}
                onChange={(event) => {
                  setSenderIds(
                    event.target.checked
                      ? [...senderIds, account.id]
                      : senderIds.filter((id) => id !== account.id),
                  )
                  edited()
                }}
              />
              <span className="min-w-0 flex-1 break-all">{account.email}</span>
              <span className="col-start-2 text-xs text-text-secondary sm:col-auto">
                {account.enabled ? account.status : 'disabled'} · {account.sentToday}/
                {account.dailyLimit} today
              </span>
            </label>
          ))}
        {!status.accounts.some((account) => account.provider === 'brevo') && (
          <p className="text-sm text-text-secondary">
            Connect a Brevo sender in Integrations first.
          </p>
        )}
      </fieldset>
      <Button className="min-h-11 sm:min-h-9" onClick={save} pending={pending} disabled={!dirty}>
        Save batch policy
      </Button>
    </fieldset>
  )
}
