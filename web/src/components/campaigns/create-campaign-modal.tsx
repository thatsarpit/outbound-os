/** The campaign creation modal. Extracted from campaigns.tsx. */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Send } from 'lucide-react'
import { campaignsApi } from '@/api/endpoints/campaigns'
import { emailSendersApi } from '@/api/endpoints/email'
import {
  EMAIL_TEMPLATE_LIST_QUERY_KEY,
  templatesApi,
  type EmailTemplate,
} from '@/api/endpoints/templates'
import type { Campaign, Lead, SenderOption } from '@/api/types'
import { SenderAccountSelect } from '@/components/inbox/sender-account-select'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingState,
} from '@/components/ui'
import { stripMarkup } from '@/lib/email-compose'
import { cn, formatCount } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import { num, Field, Panel, inputClass, textareaClass } from './campaign-shared'

function parseTargetFilter(raw: string) {
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Sortable fields, keyed by the table column that offers them. */

export function CreateCampaignModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [showPreflight, setShowPreflight] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    channel: 'whatsapp' as Campaign['channel'],
    messageTemplate: '',
    emailSubject: '',
    targetFilter: '',
    senderAccountId: null as number | null,
    variantBTemplate: '',
    variantBSubject: '',
    selectedTemplateId: null as number | null,
  })

  const parsedTargetFilter = useMemo(
    () => parseTargetFilter(form.targetFilter),
    [form.targetFilter],
  )
  const filterLooksInvalid = Boolean(form.targetFilter.trim()) && !parsedTargetFilter
  const requiresEmail = form.channel === 'email' || form.channel === 'both'

  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: EMAIL_TEMPLATE_LIST_QUERY_KEY,
    queryFn: async () => {
      const res = await templatesApi.list()
      return Array.isArray(res) ? res : []
    },
    enabled: requiresEmail,
  })

  const { data: senderOptions = [] } = useQuery<SenderOption[]>({
    queryKey: ['campaign-senders'],
    queryFn: async () => {
      const res = await emailSendersApi.list()
      return Array.isArray(res) ? res : []
    },
    enabled: requiresEmail,
  })

  const selectedSender = senderOptions.find((sender) => sender.id === form.senderAccountId) ?? null
  const senderReady =
    !requiresEmail ||
    Boolean(selectedSender && selectedSender.enabled && selectedSender.status === 'verified')
  const variantBSubjectReady =
    !requiresEmail || !form.variantBTemplate.trim() || Boolean(form.variantBSubject.trim())

  const previewMutation = useMutation({
    mutationFn: () => campaignsApi.previewLeads(parsedTargetFilter || {}),
    onError: (error: Error) => toast.error(`Audience preview failed: ${error.message}`),
  })
  const previewCount = previewMutation.data ? num(previewMutation.data.count) : null
  const previewSample: Lead[] = Array.isArray(previewMutation.data?.sample)
    ? previewMutation.data.sample
    : []
  const audienceReady = previewCount === null ? !form.targetFilter.trim() : previewCount > 0
  const selectedTemplate =
    templates.find((template) => template.id === form.selectedTemplateId) ?? null

  const createMutation = useMutation({
    mutationFn: async () => {
      if (filterLooksInvalid) throw new Error('Target filter must be valid JSON')
      return campaignsApi.create({
        name: form.name,
        description: form.description || null,
        channel: form.channel,
        messageTemplate: form.messageTemplate,
        emailSubject: form.emailSubject || null,
        targetFilter: parsedTargetFilter || null,
        senderAccountId: requiresEmail ? form.senderAccountId : null,
        variantBTemplate: form.variantBTemplate || null,
        variantBSubject: form.variantBSubject || null,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign created')
      onClose()
    },
    onError: (error: Error) => toast.error(`Failed to create: ${error.message}`),
  })

  const launchReady =
    Boolean(form.name.trim()) &&
    Boolean(form.messageTemplate.trim()) &&
    !filterLooksInvalid &&
    (!requiresEmail || Boolean(form.emailSubject.trim())) &&
    senderReady &&
    variantBSubjectReady &&
    audienceReady

  const audienceSummary =
    previewCount != null
      ? `${formatCount(previewCount)} matching lead${previewCount === 1 ? '' : 's'}`
      : form.targetFilter.trim()
        ? 'Run audience preview before creating'
        : 'Broad send without a saved preview'

  const applyTemplate = (templateId: number | null) => {
    setForm((current) => {
      const template = templates.find((item) => item.id === templateId)
      if (!template) return { ...current, selectedTemplateId: null }

      return {
        ...current,
        selectedTemplateId: templateId,
        messageTemplate: stripMarkup(template.textBody || template.htmlBody),
        emailSubject: template.subject || current.emailSubject,
      }
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent size="2xl" className="max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 z-10 gap-1 border-b border-border bg-surface px-5 py-4 sm:px-6">
          <DialogTitle className="text-sm font-semibold">New campaign</DialogTitle>
          <p className="text-[13px] text-text-secondary">
            Channel, sender, audience and variants — checked before anything sends.
          </p>
        </DialogHeader>

        <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-3">
            <Field label="Campaign name" required>
              <input
                className={inputClass}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Q1 distributor outreach"
              />
            </Field>

            <Field label="Description" hint="Optional. Shown under the name in the campaign list.">
              <input
                className={inputClass}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="What this send is for"
              />
            </Field>

            <Field label="Channel">
              <select
                className={inputClass}
                value={form.channel}
                onChange={(event) =>
                  setForm({ ...form, channel: event.target.value as Campaign['channel'] })
                }
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="imessage">iMessage (BlueBubbles)</option>
                <option value="both">WhatsApp + Email</option>
              </select>
            </Field>

            {requiresEmail && (
              <>
                <Field label="Sender mailbox" required>
                  <SenderAccountSelect
                    accounts={senderOptions}
                    value={form.senderAccountId}
                    onChange={(value) => setForm({ ...form, senderAccountId: value })}
                    className={cn(inputClass, 'min-h-9')}
                  />
                </Field>

                {selectedSender && (
                  <div className="rounded-md border border-border bg-surface-raised p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-text-primary">
                        {selectedSender.senderName || selectedSender.name || selectedSender.email}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-[11px] font-medium',
                          selectedSender.enabled && selectedSender.status === 'verified'
                            ? 'text-success'
                            : 'text-warning',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            selectedSender.enabled && selectedSender.status === 'verified'
                              ? 'bg-success'
                              : 'bg-warning',
                          )}
                        />
                        {selectedSender.enabled ? selectedSender.status : 'disabled'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-text-muted">
                      {selectedSender.email || 'No sender email available'}
                    </p>
                  </div>
                )}

                {!senderReady && (
                  <p className="text-[11px] text-warning">
                    {senderOptions.length
                      ? 'Select an enabled, verified mailbox before creating this campaign.'
                      : 'No sender mailboxes are available. Add and verify one in Settings before launching email outreach.'}
                  </p>
                )}

                <Field
                  label="Template shortcut"
                  hint="Pre-fills the body and subject from a saved email template."
                >
                  <select
                    className={inputClass}
                    value={form.selectedTemplateId != null ? String(form.selectedTemplateId) : ''}
                    onChange={(event) =>
                      applyTemplate(event.target.value ? Number(event.target.value) : null)
                    }
                  >
                    <option value="">Custom campaign copy</option>
                    {templates.map((template) => (
                      <option key={template.id} value={String(template.id)}>
                        {template.name}
                        {template.category ? ` (${template.category})` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            <Field
              label="Message template"
              required
              hint="Use {{placeholders}} so operators can see what gets personalised."
            >
              <textarea
                className={textareaClass}
                rows={5}
                value={form.messageTemplate}
                onChange={(event) => setForm({ ...form, messageTemplate: event.target.value })}
                placeholder="Hi {{name}}, we have {{product}} available…"
              />
            </Field>

            {requiresEmail && (
              <Field label="Email subject" required>
                <input
                  className={inputClass}
                  value={form.emailSubject}
                  onChange={(event) => setForm({ ...form, emailSubject: event.target.value })}
                  placeholder="Subject line"
                />
              </Field>
            )}

            <Field
              label="Target filter (JSON)"
              hint="Keep this valid JSON so the backend targets the right lead slice."
              error={filterLooksInvalid ? 'Target filter must be valid JSON.' : undefined}
            >
              <textarea
                className={cn(
                  textareaClass,
                  'font-mono text-[12px]',
                  filterLooksInvalid && 'border-danger',
                )}
                rows={4}
                value={form.targetFilter}
                onChange={(event) => setForm({ ...form, targetFilter: event.target.value })}
                placeholder='{"status":"new","country":"United States Of America"}'
              />
            </Field>

            <details className="rounded-md border border-border bg-surface-raised p-3">
              <summary className="cursor-pointer text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary">
                A/B testing (optional)
              </summary>
              <div className="mt-3 space-y-3">
                <Field label="Variant B template">
                  <textarea
                    className={textareaClass}
                    rows={3}
                    value={form.variantBTemplate}
                    onChange={(event) => setForm({ ...form, variantBTemplate: event.target.value })}
                  />
                </Field>
                {requiresEmail && (
                  <Field
                    label="Variant B subject"
                    error={
                      form.variantBTemplate.trim() && !form.variantBSubject.trim()
                        ? 'Variant B needs its own subject when email is enabled.'
                        : undefined
                    }
                  >
                    <input
                      className={inputClass}
                      value={form.variantBSubject}
                      onChange={(event) =>
                        setForm({ ...form, variantBSubject: event.target.value })
                      }
                    />
                  </Field>
                )}
              </div>
            </details>
          </div>

          <div className="space-y-4">
            <Panel title="Launch checks">
              <div className="space-y-1.5">
                <ValidationRow ok={Boolean(form.name.trim())} label="Campaign name" />
                <ValidationRow ok={Boolean(form.messageTemplate.trim())} label="Message body" />
                <ValidationRow ok={!filterLooksInvalid} label="Target filter is valid JSON" />
                <ValidationRow
                  ok={!requiresEmail || Boolean(form.emailSubject.trim())}
                  label="Email subject present"
                />
                <ValidationRow ok={senderReady} label="Verified sender selected" />
                <ValidationRow ok={variantBSubjectReady} label="Variant B subject present" />
                <ValidationRow ok={audienceReady} label="Audience is non-empty" />
              </div>
            </Panel>

            <Panel
              title="Audience"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => previewMutation.mutate()}
                  disabled={filterLooksInvalid}
                  pending={previewMutation.isPending}
                  pendingLabel="Previewing…"
                >
                  Preview
                </Button>
              }
            >
              {previewMutation.isPending ? (
                <LoadingState label="Matching leads…" />
              ) : previewMutation.data ? (
                <div className="space-y-2">
                  <p className="text-[13px] tabular-nums text-text-primary">
                    {formatCount(num(previewMutation.data.count))} leads match this filter.
                  </p>
                  <ul className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
                    {previewSample.slice(0, 5).map((lead) => (
                      <li key={lead.id} className="px-3 py-2">
                        <p className="truncate text-[13px] text-text-primary">{lead.name}</p>
                        <p className="truncate text-[11px] text-text-muted">
                          {lead.company || lead.product || lead.email || lead.mobile || '—'}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-[13px] text-text-secondary">
                  Run a preview to see which leads this filter selects.
                </p>
              )}
            </Panel>

            {requiresEmail && (
              <Panel title="Email preview">
                <dl className="space-y-3">
                  <div>
                    <dt className="text-[11px] text-text-muted">Subject</dt>
                    <dd className="mt-0.5 break-words text-[13px] text-text-primary">
                      {form.emailSubject || 'Subject preview appears here'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-text-muted">Body</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-5 text-text-secondary">
                      {form.messageTemplate || 'Body preview appears here'}
                    </dd>
                  </div>
                </dl>
              </Panel>
            )}
          </div>
        </div>

        {showPreflight && (
          <div className="border-t border-border px-5 py-4 sm:px-6">
            <Panel title="Preflight">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                <dt className="text-text-muted">Channel</dt>
                <dd className="text-text-primary">{formatCampaignChannel(form.channel)}</dd>
                <dt className="text-text-muted">Audience</dt>
                <dd className="text-text-primary">{audienceSummary}</dd>
                <dt className="text-text-muted">Sender</dt>
                <dd className="text-text-primary">
                  {requiresEmail
                    ? selectedSender?.senderName ||
                      selectedSender?.name ||
                      selectedSender?.email ||
                      'Not selected'
                    : 'Not required'}
                </dd>
                <dt className="text-text-muted">Template</dt>
                <dd className="text-text-primary">
                  {selectedTemplate?.name ||
                    (form.messageTemplate.trim() ? 'Custom campaign copy' : 'Missing')}
                </dd>
                {requiresEmail && (
                  <>
                    <dt className="text-text-muted">Email subject</dt>
                    <dd className="text-text-primary">{form.emailSubject || 'Missing'}</dd>
                    <dt className="text-text-muted">Variant B subject</dt>
                    <dd className="text-text-primary">
                      {form.variantBTemplate.trim()
                        ? form.variantBSubject || 'Missing'
                        : 'Not enabled'}
                    </dd>
                  </>
                )}
              </dl>
            </Panel>
          </div>
        )}

        <DialogFooter className="sticky bottom-0 border-t border-border bg-surface px-5 py-3 sm:px-6">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {showPreflight && (
            <Button variant="secondary" onClick={() => setShowPreflight(false)}>
              Back
            </Button>
          )}
          <Button
            onClick={() => {
              if (!showPreflight) {
                setShowPreflight(true)
                return
              }
              createMutation.mutate()
            }}
            disabled={!launchReady}
            pending={createMutation.isPending}
            pendingLabel="Creating…"
            leftIcon={<Send className="h-4 w-4" />}
          >
            {showPreflight ? 'Create campaign' : 'Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ValidationRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      {ok ? (
        <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-success" />
      ) : (
        <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-warning" />
      )}
      <span className={ok ? 'text-text-secondary' : 'text-text-primary'}>{label}</span>
      <span className="sr-only">{ok ? 'ready' : 'not ready'}</span>
    </div>
  )
}
function formatCampaignChannel(channel: Campaign['channel']) {
  if (channel === 'both') return 'WhatsApp + Email'
  if (channel === 'imessage') return 'iMessage'
  return channel === 'whatsapp' ? 'WhatsApp' : 'Email'
}
