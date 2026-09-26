import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { leadsApi } from '@/api/endpoints/leads'
import {
  EMAIL_TEMPLATE_LIST_QUERY_KEY,
  templatesApi,
  type EmailTemplate,
} from '@/api/endpoints/templates'
import { emailSendersApi } from '@/api/endpoints/email'
import { SenderAccountSelect } from '@/components/inbox/sender-account-select'
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
} from '@/components/ui'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { TemplateBodyEditor } from '@/components/templates/template-body-editor'
import { stripMarkup } from '@/lib/email-compose'
import { substituteVariables, extractVariables } from '@/lib/template-variables'
import { cn, formatCount, formatRelativeTime } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import { Copy, Eye, FileText, Inbox, Pencil, Plus, Send, Trash2 } from 'lucide-react'

/* ── Templates ──
 * A list of templates is a data surface, not a set of marketing cards. This
 * page used to be a three-column grid of glass cards, each carrying an icon
 * tile, a category pill, two bordered sub-panels and a row of variable pills —
 * roughly 320px per template, so four of them filled a screen and every card
 * repeated the same chrome. It is now a dense list on the Activity/Inbox
 * rhythm: three lines per row (name + category, subject, body preview) with
 * the numbers right-aligned and the actions revealed on hover or focus.
 */

export default function TemplatesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showEditor, setShowEditor] = useState(false)
  const [editTemplate, setEditTemplate] = useState<EmailTemplate | null>(null)
  const [preview, setPreview] = useState<{
    html: string
    subject: string
    templateName: string
    leadName: string | null
    senderLabel: string | null
  } | null>(null)
  const [previewingId, setPreviewingId] = useState<number | null>(null)
  const [testSendingId, setTestSendingId] = useState<number | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null)
  const [selectedSenderId, setSelectedSenderId] = useState<number | null>(null)

  /* Every list-shaped query below normalises inside its own `queryFn`.
     A `= []` default on `useQuery` only covers `undefined`; when an endpoint
     answers with an object (an error envelope, a paginated wrapper, a proxy
     error page) the default never applies and the first `.find`/`.map` at the
     call site throws through to the error boundary and takes the page down.
     This has bitten three times, so the guard lives at the source. */

  const {
    data: templates = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: EMAIL_TEMPLATE_LIST_QUERY_KEY,
    queryFn: async () => {
      const res = await templatesApi.list()
      return Array.isArray(res) ? res : []
    },
  })

  const { data: previewLeads = [] } = useQuery({
    queryKey: ['template-preview-leads'],
    queryFn: async () => {
      const res = await leadsApi.getLeads({
        page: 1,
        limit: 30,
        sortBy: 'updatedAt',
        sortDir: 'desc',
      })
      return Array.isArray(res?.data) ? res.data : []
    },
  })

  const selectedLead = previewLeads.find((lead) => lead.id === selectedLeadId) ?? null

  const { data: senderOptions = [], isLoading: senderLoading } = useQuery({
    queryKey: ['template-preview-senders', selectedLeadId],
    queryFn: async () => {
      const res = await emailSendersApi.list(selectedLeadId ?? undefined)
      return Array.isArray(res) ? res : []
    },
  })

  const selectedSender = senderOptions.find((sender) => sender.id === selectedSenderId) ?? null
  const senderLabel =
    selectedSender?.senderName || selectedSender?.name || selectedSender?.email || null

  const openInInbox = (templateId: number) => {
    if (!selectedLeadId || !selectedLead?.email) return
    const params = new URLSearchParams({
      leadId: String(selectedLeadId),
      channel: 'email',
      templateId: String(templateId),
    })
    if (selectedSenderId) params.set('accountId', String(selectedSenderId))
    navigate(`/inbox?${params.toString()}`)
  }

  useEffect(() => {
    if (!senderOptions.length) {
      setSelectedSenderId(null)
      return
    }
    if (selectedSenderId && senderOptions.some((sender) => sender.id === selectedSenderId)) {
      return
    }
    setSelectedSenderId(senderOptions[0]?.id ?? null)
  }, [selectedSenderId, senderOptions])

  const templateCount = templates.length
  const categoryCount = new Set(templates.map((tpl) => tpl.category).filter(Boolean)).size

  const deleteMutation = useMutation({
    mutationFn: (id: number) => templatesApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: EMAIL_TEMPLATE_LIST_QUERY_KEY })
      toast.success('Template deleted')
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  })

  const previewMutation = useMutation({
    mutationFn: ({ id }: { id: number }) =>
      templatesApi.render(id, {
        leadId: selectedLead?.id,
        context: {
          name: selectedLead?.name || 'John Doe',
          product: selectedLead?.product || 'Stainless hex bolts M8',
          company: selectedLead?.company || 'Acme Trading',
          sender: selectedSender
            ? {
                name: selectedSender.senderName || selectedSender.name || selectedSender.email,
                email: selectedSender.email,
              }
            : undefined,
        },
      }),
    onMutate: ({ id }) => {
      setPreviewingId(id)
    },
    onSuccess: (data, variables) => {
      const template = templates.find((item) => item.id === variables.id)
      setPreview({
        html: data?.htmlBody ?? '<p>No preview available</p>',
        subject: data?.subject ?? 'Email preview',
        templateName: template?.name || 'Template preview',
        leadName: selectedLead?.name || null,
        senderLabel,
      })
    },
    onError: (err: Error) => toast.error(`Preview failed: ${err.message}`),
    onSettled: () => {
      setPreviewingId(null)
    },
  })

  const testSendMutation = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      if (!selectedLeadId) throw new Error('Select a lead before test sending')
      return leadsApi.sendEmailTemplate(selectedLeadId, {
        templateId: id,
        accountId: selectedSenderId ?? undefined,
      })
    },
    onMutate: ({ id }) => {
      setTestSendingId(id)
    },
    onSuccess: () => {
      toast.success('Template sent to selected lead')
      void queryClient.invalidateQueries({ queryKey: ['lead-thread', selectedLeadId] })
      void queryClient.invalidateQueries({ queryKey: ['inbox-thread', selectedLeadId] })
      void queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
    },
    onError: (err: Error) => toast.error(`Test send failed: ${err.message}`),
    onSettled: () => {
      setTestSendingId(null)
    },
  })

  const newTemplateButton = (
    <Button
      leftIcon={<Plus aria-hidden="true" className="h-4 w-4" />}
      onClick={() => {
        setEditTemplate(null)
        setShowEditor(true)
      }}
    >
      New template
    </Button>
  )

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Templates"
        description={
          isLoading ? (
            'Loading…'
          ) : (
            <>
              <span className="tabular-nums">{formatCount(templateCount)}</span>{' '}
              {templateCount === 1 ? 'template' : 'templates'} across{' '}
              <span className="tabular-nums">{formatCount(categoryCount)}</span>{' '}
              {categoryCount === 1 ? 'category' : 'categories'}
            </>
          )
        }
        actions={newTemplateButton}
      />

      <SectionCard
        title="Preview context"
        description="Preview, test send and Open in inbox all resolve variables against this lead and send from this mailbox."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
              Preview lead
            </span>
            <select
              value={selectedLeadId ?? ''}
              onChange={(event) =>
                setSelectedLeadId(event.target.value ? Number(event.target.value) : null)
              }
              className="form-input"
            >
              <option value="">Sample context</option>
              {previewLeads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.name}
                  {lead.company ? ` · ${lead.company}` : ''}
                  {lead.email ? ` · ${lead.email}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
              Sender mailbox
            </span>
            {/* SenderAccountSelect still carries the inbox's older control
                chrome (rounded-md, raised fill, accent focus ring). It is
                shared with the inbox, so rather than restyle it from here the
                geometry is aligned to `.form-input` next to it — otherwise the
                two selects in this row read as two different controls. */}
            <SenderAccountSelect
              accounts={senderOptions}
              value={selectedSenderId}
              onChange={setSelectedSenderId}
              disabled={senderLoading || senderOptions.length === 0}
              className="min-h-10 w-full rounded-md bg-surface focus:border-focus focus:ring-focus/30"
            />
          </label>
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-border-subtle pt-4 sm:grid-cols-3">
          <ContextItem
            label="Lead"
            value={selectedLead?.name ?? 'Sample context'}
            hint={
              selectedLead?.company || selectedLead?.product || 'Uses default placeholder values'
            }
          />
          <ContextItem
            label="Test send to"
            value={selectedLead?.email ?? 'No recipient'}
            hint={selectedLead?.email ? 'Sends a real email' : 'Pick a lead that has an email'}
          />
          <ContextItem
            label="From"
            value={senderLabel ?? 'Default sender'}
            hint={
              senderOptions.length === 0
                ? 'No mailbox connected yet'
                : selectedSender?.email || 'Chosen by the sending scope'
            }
          />
        </dl>
      </SectionCard>

      <SectionCard title="All templates">
        {isLoading ? (
          <LoadingState variant="table" rows={5} label="Loading templates" />
        ) : isError ? (
          <ErrorState
            title="Couldn't load templates"
            description={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
          />
        ) : templates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No email templates yet"
            description="Reusable copy for welcome, follow-up and nurture flows. Keep the first one simple and label its variables clearly."
            action={newTemplateButton}
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {templates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                canTestSend={Boolean(selectedLead?.email)}
                previewBusy={previewMutation.isPending && previewingId === template.id}
                sendBusy={testSendMutation.isPending && testSendingId === template.id}
                onPreview={() => previewMutation.mutate({ id: template.id })}
                onTestSend={() => testSendMutation.mutate({ id: template.id })}
                onOpenInInbox={() => openInInbox(template.id)}
                onEdit={() => {
                  setEditTemplate(template)
                  setShowEditor(true)
                }}
                onCopy={() => {
                  void navigator.clipboard
                    .writeText(template.htmlBody || template.textBody || '')
                    .then(() => toast.success('Template body copied'))
                    .catch(() => toast.error('Copy failed'))
                }}
                onDelete={() => {
                  if (confirm(`Delete "${template.name}"?`)) deleteMutation.mutate(template.id)
                }}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {showEditor && (
        <TemplateEditorModal
          template={editTemplate}
          onClose={() => {
            setShowEditor(false)
            setEditTemplate(null)
          }}
        />
      )}

      {preview && <TemplatePreviewModal preview={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

/** One label / value / hint cell in the preview-context readout. */
function ContextItem({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate text-[13px] font-medium text-text-primary" title={value}>
        {value}
      </dd>
      <dd className="mt-0.5 truncate text-[11px] text-text-muted" title={hint}>
        {hint}
      </dd>
    </div>
  )
}

/* ── One template ──
 * Three lines in a fixed rhythm — what it is, what it says, how it opens —
 * with the variable count and last edit right-aligned in tabular figures so
 * they form a readable column down the list. Category is a quiet neutral mark
 * plus a label, never a filled pill: it is a folder name, not a state, so it
 * has no colour of its own to spend. */
function TemplateRow({
  template,
  canTestSend,
  previewBusy,
  sendBusy,
  onPreview,
  onTestSend,
  onOpenInInbox,
  onEdit,
  onCopy,
  onDelete,
}: {
  template: EmailTemplate
  canTestSend: boolean
  previewBusy: boolean
  sendBusy: boolean
  onPreview: () => void
  onTestSend: () => void
  onOpenInInbox: () => void
  onEdit: () => void
  onCopy: () => void
  onDelete: () => void
}) {
  const variables = safeParseVariables(template.variables)

  return (
    <li className="group">
      <div className="-mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-raised">
        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-medium text-text-primary">
              {template.name}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-text-muted">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-border-strong" />
              {template.category || 'Uncategorised'}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-text-secondary">
            {template.subject}
          </span>
          <span className="mt-1 block truncate text-[11px] text-text-muted">
            {getTemplatePreview(template)}
          </span>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-3 text-[11px] tabular-nums text-text-muted">
            <span title={variables.length ? variables.map((v) => `{{${v}}}`).join(' ') : undefined}>
              {formatCount(variables.length)} {variables.length === 1 ? 'variable' : 'variables'}
            </span>
            <span>{formatRelativeTime(template.updatedAt)}</span>
          </div>
          {/* Actions stay in the layout at all sizes so nothing shifts; on
              pointer screens they fade in on hover or keyboard focus, which
              keeps a long list from reading as a wall of icons. */}
          <div className="flex items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <RowAction
              icon={Eye}
              label="Preview"
              busy={previewBusy}
              onClick={onPreview}
              title="Render with the selected lead"
            />
            <RowAction
              icon={Send}
              label="Test send"
              busy={sendBusy}
              disabled={!canTestSend}
              onClick={onTestSend}
              title={canTestSend ? 'Send to the selected lead' : 'Select a lead with an email'}
            />
            <RowAction
              icon={Inbox}
              label="Open in inbox"
              disabled={!canTestSend}
              onClick={onOpenInInbox}
              title={canTestSend ? 'Compose in the inbox' : 'Select a lead with an email'}
            />
            <RowAction icon={Pencil} label="Edit" onClick={onEdit} />
            <RowAction icon={Copy} label="Copy body" onClick={onCopy} />
            <RowAction
              icon={Trash2}
              label="Delete"
              onClick={onDelete}
              className="hover:bg-danger-muted hover:text-danger"
            />
          </div>
        </div>
      </div>
    </li>
  )
}

function RowAction({
  icon: Icon,
  label,
  busy,
  disabled,
  onClick,
  title,
  className,
}: {
  icon: React.ElementType
  label: string
  busy?: boolean
  disabled?: boolean
  onClick: () => void
  title?: string
  className?: string
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('h-7 w-7 px-0', className)}
      pending={busy}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
    >
      {!busy && <Icon aria-hidden="true" className="h-3.5 w-3.5" />}
    </Button>
  )
}

function TemplateEditorModal({
  template,
  onClose,
}: {
  template: EmailTemplate | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isEdit = !!template

  const [form, setForm] = useState({
    name: template?.name || '',
    subject: template?.subject || '',
    body: template?.htmlBody || template?.textBody || '',
    category: template?.category || '',
    variables: (() => {
      try {
        const parsed = JSON.parse(template?.variables || '[]')
        return Array.isArray(parsed) ? parsed.join(', ') : ''
      } catch {
        return ''
      }
    })(),
  })
  const variableList = splitVariableInput(form.variables)
  // Live preview substitutes sample values for {{tokens}} so the draft reads
  // like a real message instead of a template.
  const subjectPreview = substituteVariables(form.subject)
  const bodyPreview = getDraftPreview(substituteVariables(form.body))

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        name: data.name,
        subject: data.subject,
        htmlBody: data.body,
        textBody: data.body,
        category: data.category || null,
        variables: splitVariableInput(data.variables),
      }

      return isEdit ? templatesApi.update(template!.id, payload) : templatesApi.create(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: EMAIL_TEMPLATE_LIST_QUERY_KEY })
      toast.success(isEdit ? 'Template updated' : 'Template created')
      onClose()
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent size="2xl" className="flex max-h-[92vh] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit template' : 'New template'}</DialogTitle>
          <DialogDescription>
            Subject and body accept <span className="font-mono">{'{{variables}}'}</span>, resolved
            per lead at send time.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex-1 overflow-y-auto">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_280px]">
            <div className="space-y-4">
              <Input
                label="Name"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Welcome email"
              />
              <Input
                label="Subject"
                required
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
                placeholder="Re: Your inquiry about {{product}}"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Category"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  placeholder="e.g. follow-up, welcome"
                />
                <div className="space-y-1.5">
                  <Input
                    label="Variables"
                    value={form.variables}
                    onChange={(event) => setForm({ ...form, variables: event.target.value })}
                    placeholder="name, product, company"
                    className="font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        variables: extractVariables(form.subject, form.body).join(', '),
                      })
                    }
                    className="rounded-sm text-[11px] text-focus underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    Detect from subject &amp; body
                  </button>
                </div>
              </div>
              <TemplateBodyEditor
                required
                value={form.body}
                onChange={(next) => setForm({ ...form, body: next })}
                placeholder={'Hi {{name}},\n\nThank you for your interest in {{product}}...'}
                description="Type {{ to insert a merge variable, or use the chips below. Templates are raw HTML + merge fields."
              />
            </div>

            <div className="rounded-md border border-border bg-surface-raised p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                Live draft
              </p>
              <div className="mt-3 rounded-sm border border-border bg-surface p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Subject</p>
                <p className="mt-1.5 text-[13px] font-medium text-text-primary">
                  {subjectPreview || 'Subject preview will appear here'}
                </p>
              </div>
              <div className="mt-3 rounded-sm border border-border bg-surface p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Body</p>
                <p className="mt-1.5 max-h-44 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-text-secondary">
                  {bodyPreview}
                </p>
              </div>
              {variableList.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {variableList.slice(0, 8).map((variable) => (
                    <span
                      key={variable}
                      className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-secondary"
                    >
                      {`{{${variable}}}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate(form)}
            disabled={!form.name || !form.subject || !form.body}
            pending={mutation.isPending}
            pendingLabel="Saving…"
          >
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TemplatePreviewModal({
  preview,
  onClose,
}: {
  preview: {
    html: string
    subject: string
    templateName: string
    leadName: string | null
    senderLabel: string | null
  }
  onClose: () => void
}) {
  const context = [
    preview.leadName ? `Lead: ${preview.leadName}` : null,
    preview.senderLabel ? `Sender: ${preview.senderLabel}` : null,
  ].filter(Boolean)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent size="xl" className="flex max-h-[92vh] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{preview.templateName}</DialogTitle>
          <DialogDescription className="truncate">{preview.subject}</DialogDescription>
          {context.length > 0 && (
            <p className="text-[11px] text-text-muted">{context.join(' · ')}</p>
          )}
        </DialogHeader>
        {/* The iframe carries the email's own canvas, not app chrome: message
            HTML is authored against a white ground, so it stays white in both
            themes rather than inheriting a dark surface its text can't read on. */}
        <iframe
          title="Email preview"
          srcDoc={preview.html}
          sandbox=""
          className="h-[60vh] w-full flex-1 border-0 bg-white"
        />
      </DialogContent>
    </Dialog>
  )
}

function safeParseVariables(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function splitVariableInput(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function getTemplatePreview(template: EmailTemplate): string {
  const body = template.htmlBody || template.textBody || ''
  return stripMarkup(body).slice(0, 220) || 'No body preview available.'
}

function getDraftPreview(body: string): string {
  return stripMarkup(body).slice(0, 220) || 'Your draft preview will appear here.'
}
