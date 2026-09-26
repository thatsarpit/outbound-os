import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Mail, Search, User, X } from 'lucide-react'
import type { Lead, MediaFile } from '@/api/types'
import { inboxApi } from '@/api/endpoints/inbox'
import { leadsApi } from '@/api/endpoints/leads'
import { EMAIL_TEMPLATE_LIST_QUERY_KEY, templatesApi } from '@/api/endpoints/templates'
import { DrawerShell } from '@/components/ui/drawer-shell'
import { EmailEditor } from './email-editor'
import { AttachmentPicker } from './attachment-picker'
import { SenderAccountSelect } from './sender-account-select'
import { TemplatePicker } from './template-picker'
import { getRenderedTemplateText } from '@/lib/email-compose'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'

type ComposeEmailDrawerProps = {
  onClose: () => void
  /** Pre-select a lead (e.g. from inbox thread) */
  initialLeadId?: number | null
}

export function ComposeEmailDrawer({ onClose, initialLeadId }: ComposeEmailDrawerProps) {
  const [search, setSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showLeadPicker, setShowLeadPicker] = useState(!initialLeadId)
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [plainBody, setPlainBody] = useState('')
  const [senderAccountId, setSenderAccountId] = useState<number | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [attachments, setAttachments] = useState<MediaFile[]>([])
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Lead search
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['lead-search-compose', search],
    queryFn: () => leadsApi.getLeads({ search, limit: 8 }),
    enabled: search.length >= 2,
    staleTime: 10_000,
  })

  // Load initial lead if provided
  const { data: initialLead } = useQuery({
    queryKey: ['lead', initialLeadId],
    queryFn: () => leadsApi.getLead(initialLeadId!),
    enabled: !!initialLeadId && !selectedLead,
  })

  useEffect(() => {
    if (initialLead && !selectedLead) {
      setSelectedLead(initialLead)
      setShowLeadPicker(false)
    }
  }, [initialLead, selectedLead])

  // Sender accounts for selected lead
  const { data: senderAccounts = [] } = useQuery({
    queryKey: ['inbox-senders', selectedLead?.id],
    queryFn: async () => {
      const res = await inboxApi.listSenderAccounts(selectedLead?.id)
      return Array.isArray(res) ? res : []
    },
    enabled: !!selectedLead,
  })

  // Templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: EMAIL_TEMPLATE_LIST_QUERY_KEY,
    queryFn: async () => {
      const res = await templatesApi.list()
      return Array.isArray(res) ? res : []
    },
  })

  // Apply template
  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      if (!selectedLead) throw new Error('Select a lead first')
      return templatesApi.render(templateId, { leadId: selectedLead.id })
    },
    onSuccess: (data) => {
      if (!data) return
      const plainText = getRenderedTemplateText(data)
      setPlainBody(plainText)
      setHtmlBody(data.htmlBody || `<p>${plainText.replace(/\n/g, '</p><p>')}</p>`)
      if (data.subject) setSubject(data.subject)
      toast.success('Template applied')
    },
    onError: (error: Error) => toast.error(`Template apply failed: ${error.message}`),
  })

  // Send
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLead) throw new Error('Select a recipient lead')
      if (!selectedLead.email) throw new Error('Selected lead has no email address')
      if (!plainBody.trim()) throw new Error('Email body cannot be empty')

      const emailHtml = htmlBody.trim()
      return inboxApi.send({
        leadId: selectedLead.id,
        channel: 'email',
        text: plainBody.trim(),
        body: plainBody.trim(),
        htmlBody: emailHtml || undefined,
        subject: subject.trim() || undefined,
        accountId: senderAccountId ?? undefined,
        attachmentIds: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        scheduledAt: scheduleDate ? new Date(scheduleDate).toISOString() : undefined,
      })
    },
    onSuccess: () => {
      const action = scheduleDate ? 'scheduled' : 'sent'
      toast.success(`Email ${action} to ${selectedLead?.name || selectedLead?.email}`)
      onClose()
    },
    onError: (error: Error) => toast.error(`Send failed: ${error.message}`),
  })

  const handleSelectLead = useCallback((lead: Lead) => {
    setSelectedLead(lead)
    setShowLeadPicker(false)
    setSearch('')
  }, [])

  const canSend = !!selectedLead?.email && !!plainBody.trim() && !sendMutation.isPending

  return (
    <DrawerShell onClose={onClose} panelClassName="lg:max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-info-muted p-2">
            <Mail className="h-5 w-5 text-info" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">New Email</h2>
            <p className="text-xs text-text-muted">Compose a fresh email to any lead</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-secondary"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        {/* To field */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-muted">To</label>
          {selectedLead && !showLeadPicker ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2.5">
              <User className="h-4 w-4 text-text-muted" />
              <span className="flex-1 text-sm text-text-primary">
                {selectedLead.name}
                {selectedLead.email && (
                  <span className="ml-2 text-text-muted">&lt;{selectedLead.email}&gt;</span>
                )}
                {selectedLead.company && (
                  <span className="ml-2 text-xs text-text-secondary">· {selectedLead.company}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedLead(null)
                  setShowLeadPicker(true)
                  setTimeout(() => searchInputRef.current?.focus(), 50)
                }}
                className="rounded p-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-secondary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                ref={searchInputRef}
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, company..."
                className={cn(
                  'w-full rounded-md border border-border bg-surface-raised py-2.5 pl-9 pr-3 text-sm text-text-primary',
                  'placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30',
                )}
              />

              {/* Dropdown results */}
              {search.length >= 2 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-surface-raised shadow-md">
                  {searchLoading ? (
                    <div className="flex items-center gap-2 px-4 py-3 text-sm text-text-muted">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </div>
                  ) : !searchResults?.data.length ? (
                    <div className="px-4 py-3 text-sm text-text-muted">
                      No leads found for "{search}"
                    </div>
                  ) : (
                    searchResults.data.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => handleSelectLead(lead)}
                        disabled={!lead.email}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                          lead.email ? 'hover:bg-surface-raised' : 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-xs font-semibold text-text-secondary">
                          {lead.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-text-primary">{lead.name}</div>
                          <div className="truncate text-xs text-text-muted">
                            {lead.email || 'No email'}
                            {lead.company && ` · ${lead.company}`}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {selectedLead && !selectedLead.email && (
            <p className="mt-1.5 text-xs text-danger">This lead has no email address.</p>
          )}
        </div>

        {/* Subject */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-muted">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject line..."
            className={cn(
              'w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary',
              'placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30',
            )}
          />
        </div>

        {/* CC/BCC */}
        {!showCcBcc ? (
          <button
            type="button"
            onClick={() => setShowCcBcc(true)}
            className="text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            + CC / BCC
          </button>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-muted">CC</label>
              <input
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="Comma-separated emails"
                className={cn(
                  'w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary',
                  'placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30',
                )}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-muted">BCC</label>
              <input
                type="text"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="Comma-separated emails"
                className={cn(
                  'w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary',
                  'placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30',
                )}
              />
            </div>
          </div>
        )}

        {/* Sender account */}
        {selectedLead && senderAccounts.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-muted">From</label>
            <SenderAccountSelect
              accounts={senderAccounts}
              value={senderAccountId}
              onChange={setSenderAccountId}
            />
          </div>
        )}

        {/* Template picker */}
        {selectedLead && templates.length > 0 && (
          <TemplatePicker
            templates={templates.map((t) => ({ id: t.id, name: t.name }))}
            value={selectedTemplateId}
            onChange={setSelectedTemplateId}
            onApply={() => {
              if (selectedTemplateId) applyTemplateMutation.mutate(selectedTemplateId)
            }}
            loading={templatesLoading}
            applyPending={applyTemplateMutation.isPending}
            label="Template"
            description="Apply a template to pre-fill the email body"
          />
        )}

        {/* Editor */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-muted">Body</label>
          <EmailEditor
            content={htmlBody}
            onChange={setHtmlBody}
            onPlainTextChange={setPlainBody}
            placeholder="Write your email..."
            disabled={!selectedLead}
          />
        </div>

        {/* Attachments */}
        <AttachmentPicker
          attachments={attachments}
          onAdd={(file) => setAttachments((prev) => [...prev, file])}
          onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
          disabled={!selectedLead}
        />
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <p className="text-xs text-text-muted">
            {selectedLead?.email
              ? `Sending to ${selectedLead.email}`
              : 'Select a recipient to send'}
          </p>
          {/* Schedule option */}
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className={cn(
                'rounded-lg border border-border bg-surface-overlay px-2 py-1.5 text-xs text-text-secondary',
                'focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30',
              )}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => sendMutation.mutate()}
          disabled={!canSend}
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition-all',
            canSend
              ? 'bg-accent text-accent-fg shadow-md shadow-accent/20 hover:bg-accent-hover hover:shadow-md hover:shadow-accent/30'
              : 'bg-surface-raised text-text-muted cursor-not-allowed',
          )}
        >
          {sendMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {scheduleDate ? 'Scheduling...' : 'Sending...'}
            </>
          ) : (
            <>
              <Mail className="h-4 w-4" />
              {scheduleDate ? 'Schedule Send' : 'Send Email'}
            </>
          )}
        </button>
      </div>
    </DrawerShell>
  )
}
