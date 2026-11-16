/** The campaign creation modal. Extracted from campaigns.tsx. */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, Check, FilePlus2 } from 'lucide-react'
import { campaignsApi } from '@/api/endpoints/campaigns'
import { emailSendersApi } from '@/api/endpoints/email'
import { whatsappApi } from '@/api/endpoints/whatsapp'
import type { WhatsAppAccount } from '@/api/types'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingState,
} from '@/components/ui'
import { stripMarkup } from '@/lib/email-compose'
import { cn, formatCount } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import { num, Field, Panel, inputClass, textareaClass } from './campaign-shared'
import { AudienceFilters, parseAudienceFilter } from './audience-filters'

const exclusionLabels: Record<string, string> = {
  customer_replied: 'Already replied',
  lead_replied: 'Already replied',
  lead_engaged: 'Engaged lead',
  lead_paused: 'Paused lead',
  lead_closed: 'Closed lead',
  lead_opted_out: 'Opted out',
  lead_wa_unavailable: 'WhatsApp unavailable',
  email_opted_out: 'Opted out of email',
  email_bounced: 'Email bounced',
  email_complained: 'Spam complaint',
  email_unsubscribed: 'Unsubscribed',
  email_suppressed: 'Email suppressed',
  email_verification_required: 'Email check required',
  no_email_address: 'No valid email address',
  whatsapp_unavailable: 'WhatsApp unavailable',
  no_whatsapp_address: 'No WhatsApp destination',
  no_phone_number: 'No phone number',
}

export function CreateCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const queryClient = useQueryClient()
  const isPreview = useAuthStore((state) => state.dashboardScope === 'demo')
  const [showPreflight, setShowPreflight] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    channel: 'whatsapp' as Campaign['channel'],
    messageTemplate: '',
    emailSubject: '',
    targetFilter: '',
    senderAccountId: null as number | null,
    whatsappSenderAccountId: null as number | null,
    waCampaignName: '',
    variantBTemplate: '',
    variantBSubject: '',
    selectedTemplateId: null as number | null,
  })

  const parsedTargetFilter = useMemo(
    () => parseAudienceFilter(form.targetFilter),
    [form.targetFilter],
  )
  const filterLooksInvalid = Boolean(form.targetFilter.trim()) && !parsedTargetFilter
  const requiresEmail = form.channel === 'email' || form.channel === 'both'
  const requiresWhatsApp = form.channel === 'whatsapp' || form.channel === 'both'
  const whatsappQuery = useQuery<WhatsAppAccount[]>({
    queryKey: ['campaign-whatsapp-senders'],
    queryFn: async () => (await whatsappApi.list()) || [],
    enabled: requiresWhatsApp,
  })
  const whatsappAccounts = whatsappQuery.data ?? []

  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: EMAIL_TEMPLATE_LIST_QUERY_KEY,
    queryFn: async () => {
      const res = await templatesApi.list()
      return Array.isArray(res) ? res : []
    },
    enabled: requiresEmail,
  })

  const senderQuery = useQuery<SenderOption[]>({
    queryKey: ['campaign-senders'],
    queryFn: async () => {
      const res = await emailSendersApi.list()
      return Array.isArray(res) ? res : []
    },
    enabled: requiresEmail,
  })
  const senderOptions = senderQuery.data ?? []
  const selectedWhatsAppSender = whatsappAccounts.find(account => account.id === form.whatsappSenderAccountId)
  const whatsappReady = !requiresWhatsApp || (!whatsappQuery.isError && whatsappAccounts.some(account =>
    account.enabled && (account.sessionReady || account.templatesReady) &&
    (form.whatsappSenderAccountId == null || account.id === form.whatsappSenderAccountId),
  ))

  const selectedSender = senderOptions.find((sender) => sender.id === form.senderAccountId) ?? null
  const senderReady =
    (!requiresEmail ||
    Boolean(selectedSender && selectedSender.enabled && selectedSender.status === 'verified')
    ) && whatsappReady
  const variantBSubjectReady =
    !requiresEmail || !form.variantBTemplate.trim() || Boolean(form.variantBSubject.trim())

  const previewMutation = useMutation({
    mutationFn: ({ filter, channel }: { filter: string; channel: Campaign['channel'] }) =>
      campaignsApi.previewLeads(parseAudienceFilter(filter) || {}, channel),
  })
  const previewCurrent =
    previewMutation.variables?.filter === form.targetFilter &&
    previewMutation.variables?.channel === form.channel
  const preview = previewCurrent ? previewMutation.data : null
  const previewCount = preview ? num(preview.count) : null
  const previewSample: Lead[] =
    Array.isArray(preview?.sample) ? preview.sample : []
  const exclusions = Object.entries(preview?.exclusionCounts ?? {}).sort(([, a], [, b]) => b - a)
  const audienceReady = previewCount !== null && previewCount > 0
  const createMutation = useMutation({
    mutationFn: async () => {
      if (filterLooksInvalid) throw new Error('Target filter must be a JSON object')
      const campaign = await campaignsApi.create({
        name: form.name,
        description: form.description || null,
        channel: form.channel,
        messageTemplate: form.messageTemplate,
        emailSubject: form.emailSubject || null,
        targetFilter: parsedTargetFilter || null,
        emailSenderAccountId: requiresEmail ? form.senderAccountId : null,
        whatsappSenderAccountId: requiresWhatsApp ? form.whatsappSenderAccountId : null,
        waCampaignName: requiresWhatsApp ? form.waCampaignName || null : null,
        variantBTemplate: form.variantBTemplate || null,
        variantBSubject: form.variantBSubject || null,
      })
      if (!campaign?.id) throw new Error('Campaign creation returned an incomplete response.')
      return campaign
    },
    onSuccess: (campaign) => {
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Draft created')
      onClose()
      onCreated(campaign.id)
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
      ? `${formatCount(previewCount)} eligible lead${previewCount === 1 ? '' : 's'}`
      : form.targetFilter.trim()
        ? 'Run audience preview before creating'
        : 'Preview the audience before creating'

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
      <DialogContent size="2xl" className="flex max-h-[92dvh] flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 gap-1 border-b border-border bg-surface px-5 py-4 pr-12 sm:px-6 sm:pr-12">
          <DialogTitle className="text-base font-semibold">{showPreflight ? 'Review your campaign' : 'New campaign'}</DialogTitle>
          <DialogDescription>
            {showPreflight ? 'Save your draft, then review its recipients and choose a launch time.' : 'Choose your audience and write the message you want them to receive.'}
          </DialogDescription>
        </DialogHeader>

        {!showPreflight && <div className="grid min-h-0 gap-6 overflow-y-auto px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px]">
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

            {requiresWhatsApp && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <Field label="WhatsApp sender">
                  <select
                    className={inputClass}
                    value={form.whatsappSenderAccountId ?? ''}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        whatsappSenderAccountId: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                  >
                    <option value="">Use lead assignment or an available sender</option>
                    {whatsappAccounts
                      .filter((account) => account.enabled && (account.sessionReady || account.templatesReady))
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} · {account.phone}
                        </option>
                      ))}
                  </select>
                  {whatsappQuery.isError && (
                    <Button size="sm" variant="secondary" onClick={() => void whatsappQuery.refetch()}>Retry loading WhatsApp senders</Button>
                  )}
                  {!whatsappQuery.isPending && !whatsappQuery.isError && !whatsappReady && (
                    <p role="status" className="text-xs text-warning">Connect an enabled WhatsApp sender in Integrations to continue.</p>
                  )}
                </Field>
                <Field
                  label="Approved Meta template name"
                  hint="Use the exact approved name for this sender. Leave empty only for replies within the customer's open 24-hour window; closed windows will be skipped."
                >
                  <input
                    className={inputClass}
                    value={form.waCampaignName}
                    onChange={(event) => setForm({ ...form, waCampaignName: event.target.value })}
                    placeholder="new_enquiry"
                  />
                </Field>
              </div>
            )}

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
                {senderQuery.isError && (
                  <Button size="sm" variant="secondary" onClick={() => void senderQuery.refetch()}>Retry loading mailboxes</Button>
                )}

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
                      : 'No sender mailboxes are available. Add and verify one in Integrations before launching email outreach.'}
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

            <AudienceFilters value={form.targetFilter} onChange={targetFilter => setForm({ ...form, targetFilter })} />

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

          <div className="space-y-4 self-start lg:sticky lg:top-0">
            <Panel title="Draft checklist">
              <div className="space-y-1.5">
                <ValidationRow ok={Boolean(form.name.trim())} label="Campaign name" />
                <ValidationRow ok={Boolean(form.messageTemplate.trim())} label="Message body" />
                <ValidationRow ok={!filterLooksInvalid} label="Audience filters ready" />
                <ValidationRow
                  ok={!requiresEmail || Boolean(form.emailSubject.trim())}
                  label="Email subject present"
                />
                <ValidationRow ok={senderReady} label="Sender ready" />
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
                  onClick={() =>
                    previewMutation.mutate({ filter: form.targetFilter, channel: form.channel })
                  }
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
              ) : previewCurrent && previewMutation.isError ? (
                <p role="alert" className="text-[13px] text-danger">{previewMutation.error.message}</p>
              ) : preview && previewCount !== null ? (
                <div className="space-y-3">
                  <p role="status" className="text-[13px] tabular-nums text-text-primary">
                    <strong>{formatCount(previewCount)} eligible</strong>
                    {preview.matchedCount != null && ` of ${formatCount(preview.matchedCount)} matching leads`}
                    {preview.excludedCount != null && ` · ${formatCount(preview.excludedCount)} excluded`}
                  </p>
                  {isPreview && <p className="text-[12px] text-text-muted">Sample audience for this channel.</p>}
                  {exclusions.length > 0 && (
                    <details open className="rounded-md border border-border bg-surface p-3">
                      <summary className="cursor-pointer text-[12px] font-medium text-text-primary">
                        Why leads were excluded
                      </summary>
                      <dl className="mt-2 space-y-1">
                        {exclusions.map(([key, count]) => {
                          const [channel, reason] = key.split(':')
                          return (
                            <div key={key} className="flex justify-between gap-2 text-[12px]">
                              <dt className="text-text-secondary">
                                {exclusionLabels[reason] ?? reason?.replace(/_/g, ' ') ?? key}
                                {form.channel === 'both' && ` · ${formatCampaignChannel(channel as Campaign['channel'])}`}
                              </dt>
                              <dd className="tabular-nums text-text-primary">{formatCount(count)}</dd>
                            </div>
                          )
                        })}
                      </dl>
                      {form.channel === 'both' && (
                        <p className="mt-2 text-[11px] text-text-muted">A lead can count under both channels.</p>
                      )}
                    </details>
                  )}
                  {preview.emailVerificationRequired && (
                    <p className="text-[12px] text-text-muted">
                      Email audiences include only addresses with current checks. Verify recipients in Email integrations.
                    </p>
                  )}
                  {previewSample.length > 0 && <ul aria-label="Sample eligible recipients" className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
                    {previewSample.slice(0, 5).map((lead) => (
                      <li key={lead.id} className="px-3 py-2">
                        <p className="truncate text-[13px] text-text-primary">{lead.name}</p>
                        <p className="truncate text-[11px] text-text-muted">
                          {lead.company || lead.product || lead.email || lead.mobile || '—'}
                        </p>
                      </li>
                    ))}
                  </ul>}
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
        </div>}

        {showPreflight && (
          <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="rounded-lg border border-border p-4">
              <p className="text-lg font-semibold text-text-primary">{form.name}</p>
              {form.description && <p className="mt-1 text-sm text-text-muted">{form.description}</p>}
            </div>
            <Panel title="Audience and delivery">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-[13px]">
                <dt className="text-text-muted">Channel</dt>
                <dd className="text-text-primary">{formatCampaignChannel(form.channel)}</dd>
                <dt className="text-text-muted">Audience</dt>
                <dd className="text-text-primary">{audienceSummary}</dd>
                {requiresWhatsApp && <>
                  <dt className="text-text-muted">WhatsApp sender</dt>
                  <dd className="break-words text-text-primary">{selectedWhatsAppSender?.name || 'Lead assignment or available sender'}</dd>
                  <dt className="text-text-muted">Meta template</dt>
                  <dd className="break-words text-text-primary">{form.waCampaignName || 'Free text within an open reply window'}</dd>
                </>}
                {requiresEmail && (
                  <>
                    <dt className="text-text-muted">Email sender</dt>
                    <dd className="break-words text-text-primary">{selectedSender?.email}</dd>
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
            <Panel title="Message">
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">{form.messageTemplate}</p>
            </Panel>
            {form.variantBTemplate.trim() && <Panel title="Variant B">
              {requiresEmail && <p className="mb-2 text-sm font-medium">{form.variantBSubject}</p>}
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">{form.variantBTemplate}</p>
            </Panel>}
            <p className="text-xs leading-5 text-text-muted">The audience preview reflects current eligibility. Populate the draft to save its recipients, then review them before sending.</p>
          </div>
        )}

        <DialogFooter className="shrink-0 flex-row items-center border-t border-border bg-surface px-5 py-3 sm:px-6">
          <Button variant="ghost" disabled={createMutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          {showPreflight && (
            <Button variant="secondary" disabled={createMutation.isPending} leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => setShowPreflight(false)}>
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
            leftIcon={showPreflight ? <FilePlus2 className="h-4 w-4" /> : undefined}
          >
            {showPreflight ? 'Create draft' : 'Review'}
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
