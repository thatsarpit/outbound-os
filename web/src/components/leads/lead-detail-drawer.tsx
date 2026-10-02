/** The lead detail drawer. Extracted from leads.tsx. */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leadsApi } from '@/api/endpoints/leads'
import { crmApi } from '@/api/endpoints/crm'
import type { Lead, LeadAiInsight, LeadEnrichmentData } from '@/api/types'
import { toast } from '@/stores/toast-store'
import {
  DrawerShell,
  Button,
  Input,
  Textarea,
  Badge,
  ConfirmDialog,
  SelectField as UISelectField,
  leadStatusVariant,
  leadTierVariant,
} from '@/components/ui'
import { getLeadAutomationAction, invalidateLeadSurfaceQueries } from '@/lib/lead-automation'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  X,
  Phone,
  Mail,
  Tag,
  Loader2,
  Pencil,
  Trash2,
  Save,
  Check,
  Globe,
  Pause,
  Play,
  Clock3,
} from 'lucide-react'
import {
  type InsightEntityKey,
  INSIGHT_ENTITY_LABELS,
  URGENCY_STYLES,
  CONFIDENCE_STYLES,
  safeParseJson,
  prettifyToken,
  normalizeWebsiteUrl,
  InsightMetric,
} from './insight-helpers'
import { LeadCommunicationsPanel } from './lead-communications-panel'

interface LeadDetailDrawerProps {
  lead: Lead | null
  onClose: () => void
  onLeadUpdated: (lead: Lead) => void
  onToggleAutomation: (lead: Lead) => void
  automationPending: boolean
}

export function LeadDetailDrawer({
  lead,
  onClose,
  onLeadUpdated,
  onToggleAutomation,
  automationPending,
}: LeadDetailDrawerProps) {
  const queryClient = useQueryClient()

  const { data: leadDetail } = useQuery({
    queryKey: ['lead-detail', lead?.id],
    queryFn: () =>
      leadsApi.getLead(lead!.id) as Promise<
        { customer?: { id: number; name: string; totalOrders: number } | null } | undefined
      >,
    enabled: !!lead,
  })

  /**
   * A converted lead already has a Customer; converting again would collide on
   * the unique leadId, so the server returns the existing record rather than
   * erroring, and this only ever shows one of the two states.
   */
  const leadCustomer = leadDetail?.customer ?? null

  const convertMutation = useMutation({
    mutationFn: () => crmApi.convertLead(lead!.id),
    onSuccess: (customer) => {
      toast.success(`${customer?.name ?? 'Lead'} is now a customer`)
      invalidateLeadSurfaceQueries(queryClient)
      queryClient.invalidateQueries({ queryKey: ['lead-detail', lead!.id] })
    },
    onError: (e: Error) => toast.error(`Convert failed: ${e.message}`),
  })
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Lead>>({})
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // Whenever a new lead is opened, reset edit state
  useEffect(() => {
    setEditMode(false)
    setEditForm({})
  }, [lead?.id])

  const insightInitialData = lead
    ? {
        leadId: lead.id,
        lastReplyIntent: lead.lastReplyIntent,
        aiInsights: safeParseJson<LeadAiInsight>(lead.aiInsights),
      }
    : undefined

  const enrichedInitialData = lead
    ? {
        enrichedData: safeParseJson<LeadEnrichmentData>(lead.enrichedData),
      }
    : undefined

  const { data: insightData, isLoading: insightLoading } = useQuery({
    queryKey: ['lead-insights', lead?.id],
    queryFn: () => leadsApi.getLeadInsights(lead!.id),
    enabled: !!lead,
    initialData: insightInitialData,
  })

  const { data: enrichedData, isLoading: enrichmentLoading } = useQuery({
    queryKey: ['lead-enriched', lead?.id],
    queryFn: () => leadsApi.getLeadEnriched(lead!.id),
    enabled: !!lead,
    initialData: enrichedInitialData,
  })

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<Lead>) => leadsApi.updateLead(lead!.id, updates),
    onSuccess: (updatedLead) => {
      invalidateLeadSurfaceQueries(queryClient)
      if (updatedLead) {
        onLeadUpdated(updatedLead)
      }
      toast.success('Lead saved')
      setEditMode(false)
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: () => leadsApi.deleteLead(lead!.id),
    onSuccess: () => {
      invalidateLeadSurfaceQueries(queryClient)
      toast.success('Lead deleted')
      onClose()
    },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  })

  if (!lead) return null

  const handleStartEdit = () => {
    setEditForm({
      name: lead.name,
      company: lead.company ?? '',
      email: lead.email ?? '',
      telegramPeer: lead.telegramPeer ?? '',
      product: lead.product ?? '',
      notes: lead.notes ?? '',
      status: lead.status,
    })
    setEditMode(true)
  }

  const EDIT_STATUS_OPTIONS = [
    'new',
    'contacted',
    'replied',
    'engaged',
    'closed',
    'paused',
    'wa_unavailable',
  ]
  const automationAction = getLeadAutomationAction(lead.status)
  const replyInsight = insightData?.aiInsights ?? insightInitialData?.aiInsights ?? null
  const companyIntel = enrichedData?.enrichedData ?? enrichedInitialData?.enrichedData ?? null
  const replyIntent =
    insightData?.lastReplyIntent ?? lead.lastReplyIntent ?? replyInsight?.intent ?? null
  const websiteUrl = normalizeWebsiteUrl(companyIntel?.website)
  const replyEntities = (
    [
      ['productMentioned', replyInsight?.entities?.productMentioned],
      ['quantityMentioned', replyInsight?.entities?.quantityMentioned],
      ['locationMentioned', replyInsight?.entities?.locationMentioned],
      ['priceMentioned', replyInsight?.entities?.priceMentioned],
      ['objection', replyInsight?.entities?.objection],
    ] as const
  ).filter((entry): entry is [InsightEntityKey, string] => Boolean(entry[1]))

  return (
    <>
      <DrawerShell onClose={onClose} panelClassName="lg:max-w-lg">
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-4 backdrop-blur-md sm:px-6">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{lead.name}</h2>
              <p className="truncate text-sm text-text-muted">{lead.company || 'No company'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!editMode ? (
                <Button variant="ghost" size="sm" onClick={handleStartEdit} aria-label="Edit lead">
                  <Pencil className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate(editForm)}
                  isLoading={saveMutation.isPending}
                  aria-label="Save changes"
                >
                  <Save className="h-4 w-4" />
                </Button>
              )}
              {editMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditMode(false)}
                  aria-label="Cancel"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              {!editMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="hover:bg-danger-muted hover:text-danger"
                  aria-label="Delete lead"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {editMode ? (
            /* ── Edit Mode ── */
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Input
                    label="Name"
                    value={editForm.name ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <Input
                  label="Company"
                  value={(editForm.company as string) ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                />
                <UISelectField
                  label="Status"
                  value={(editForm.status as string) ?? lead.status}
                  onValueChange={(v) => setEditForm({ ...editForm, status: v as Lead['status'] })}
                  options={EDIT_STATUS_OPTIONS.map((s) => ({
                    value: s,
                    label: s.replace('_', ' '),
                  }))}
                />
                <Input
                  label="Email"
                  type="email"
                  value={(editForm.email as string) ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
                <Input
                  label="Telegram recipient"
                  placeholder="@username or peer ID"
                  value={(editForm.telegramPeer as string) ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, telegramPeer: e.target.value })}
                />
                <Input
                  label="Product"
                  value={(editForm.product as string) ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, product: e.target.value })}
                />
                <div className="sm:col-span-2">
                  <Textarea
                    label="Notes"
                    rows={4}
                    value={(editForm.notes as string) ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => saveMutation.mutate(editForm)}
                isLoading={saveMutation.isPending}
                leftIcon={<Check className="h-4 w-4" />}
              >
                Save Changes
              </Button>
            </div>
          ) : (
            /* ── Read Mode ── */
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="space-y-3 border-b border-border px-4 py-4 sm:px-6">
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-text-muted" />
                    <div className="min-w-0">
                      <span className="text-text-secondary">
                        {lead.mobile && !lead.mobile.startsWith('no-phone:') ? lead.mobile : 'No phone number'}
                      </span>
                      {lead.mobile.startsWith('no-phone:') && (lead.waUsername || lead.waUserId) && (
                        <p className="text-xs text-text-muted">WhatsApp replies use their WhatsApp identity.</p>
                      )}
                    </div>
                  </div>
                  {lead.waUsername && (
                    <div className="flex items-center gap-3 text-sm">
                      <span className="w-4 text-center text-text-muted" aria-hidden="true">@</span>
                      <span className="text-text-secondary">@{lead.waUsername.replace(/^@/, '')}</span>
                    </div>
                  )}
                  {lead.email && (
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="w-4 h-4 text-text-muted" />
                      <span className="text-text-secondary">{lead.email}</span>
                    </div>
                  )}
                  {lead.product && (
                    <div className="flex items-center gap-3 text-sm">
                      <Tag className="w-4 h-4 text-text-muted" />
                      <span className="text-text-secondary">{lead.product}</span>
                    </div>
                  )}
                </div>

                <div className="border-b border-border px-4 py-4 sm:px-6">
                  <div
                    className={cn(
                      'rounded-md border px-4 py-4',
                      automationAction.isPaused
                        ? 'border-warning/30 bg-warning-muted/30'
                        : 'border-success/20 bg-success-muted/20',
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Automation
                        </p>
                        <p className="mt-2 text-sm font-medium text-text-primary">
                          {automationAction.isPaused
                            ? 'Paused for this lead'
                            : 'Active for this lead'}
                        </p>
                        <p className="mt-1 text-sm text-text-secondary">
                          {automationAction.isPaused
                            ? 'Resume to return this lead to the outbound queue.'
                            : 'Pause to stop automated follow-ups while the team handles it manually.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleAutomation(lead)}
                        disabled={automationPending}
                        className={cn(
                          'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-50',
                          automationAction.isPaused
                            ? 'bg-success-muted text-success hover:bg-success/20'
                            : 'bg-warning-muted text-warning hover:bg-warning/20',
                        )}
                      >
                        {automationPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : automationAction.isPaused ? (
                          <Play className="h-4 w-4" />
                        ) : (
                          <Pause className="h-4 w-4" />
                        )}
                        {automationAction.shortLabel}
                      </button>
                    </div>
                  </div>
                </div>

                {/* The lead-to-customer link. Without it the drawer dead-ends
                    and there is no route from a lead to what it actually
                    earned. */}
                <div className="border-b border-border px-4 py-3 sm:px-6">
                  {leadCustomer ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
                          Customer
                        </p>
                        <p className="mt-0.5 truncate text-sm text-text-primary">
                          {leadCustomer.name}
                          <span className="ml-2 text-text-muted">
                            {leadCustomer.totalOrders} order
                            {leadCustomer.totalOrders === 1 ? '' : 's'}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/customers?customer=${leadCustomer.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
                        >
                          Open customer
                        </Link>
                        <Link
                          to={`/orders?newFromLead=${lead.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
                        >
                          New order
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
                          Customer
                        </p>
                        <p className="mt-0.5 text-sm text-text-muted">Not a customer yet.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          pending={convertMutation.isPending}
                          onClick={() => convertMutation.mutate()}
                        >
                          Convert to customer
                        </Button>
                        <Link
                          to={`/orders?newFromLead=${lead.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
                        >
                          New order
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 border-b border-border px-4 py-4 sm:grid-cols-4 sm:px-6">
                  <div className="glass rounded-lg p-3 text-center">
                    <p className="text-xs text-text-muted">Status</p>
                    <div className="mt-2 flex justify-center">
                      <Badge variant={leadStatusVariant(lead.status)} size="md">
                        {lead.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                  <div className="glass rounded-lg p-3 text-center">
                    <p className="text-xs text-text-muted">Tier</p>
                    <div className="mt-2 flex justify-center">
                      {lead.leadTier ? (
                        <Badge variant={leadTierVariant(lead.leadTier)} size="md">
                          {lead.leadTier}
                        </Badge>
                      ) : (
                        <span className="text-text-muted text-sm">—</span>
                      )}
                    </div>
                  </div>
                  <div className="glass rounded-lg p-3 text-center">
                    <p className="text-xs text-text-muted">Score</p>
                    <p className="mt-1 text-sm font-bold">{lead.score ?? '—'}</p>
                  </div>
                  <div className="glass rounded-lg p-3 text-center">
                    <p className="text-xs text-text-muted">Source</p>
                    <p className="mt-1 text-sm font-medium capitalize">{lead.source || '—'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-b border-border px-4 py-4 sm:grid-cols-4 sm:px-6">
                  <div className="rounded-md border border-border bg-surface-raised p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
                      WA follow-ups
                    </p>
                    <p className="mt-2 text-sm font-semibold text-text-primary">
                      {lead.followupCount ?? 0}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-surface-raised p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
                      Email follow-ups
                    </p>
                    <p className="mt-2 text-sm font-semibold text-text-primary">
                      {lead.emailFollowupCount ?? 0}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-surface-raised p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
                      Last touch
                    </p>
                    <p className="mt-2 text-sm font-semibold text-text-primary">
                      {lead.lastMessageAt ? formatRelativeTime(lead.lastMessageAt) : '—'}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-surface-raised p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
                      Updated
                    </p>
                    <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-text-primary">
                      <Clock3 className="h-3.5 w-3.5 text-text-muted" />
                      {formatRelativeTime(lead.updatedAt)}
                    </p>
                  </div>
                </div>

                {lead.lastError && (
                  <div className="border-b border-border px-4 py-4 sm:px-6">
                    <div className="rounded-md border border-danger/25 bg-danger-muted/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">
                        Last error
                      </p>
                      <p className="mt-2 text-sm text-text-secondary">{lead.lastError}</p>
                      {lead.lastErrorAt && (
                        <p className="mt-2 text-xs text-text-muted">
                          {formatRelativeTime(lead.lastErrorAt)}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <LeadCommunicationsPanel lead={lead} onLeadUpdated={onLeadUpdated} />

                <div className="border-b border-border px-4 py-4 sm:px-6">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Insights
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        Reply intent and company context, to guide the next step.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <div className="rounded-md border border-border bg-surface-raised/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            Reply intelligence
                          </p>
                          <p className="mt-1 text-xs text-text-muted">
                            Derived from inbound replies — opt-outs and out-of-office are detected
                            automatically.
                          </p>
                        </div>
                        {replyIntent && (
                          <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                            {prettifyToken(replyIntent)}
                          </span>
                        )}
                      </div>

                      {insightLoading && !replyInsight && !replyIntent ? (
                        <div className="flex items-center gap-2 py-5 text-sm text-text-muted">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading reply signals…
                        </div>
                      ) : !replyInsight && !replyIntent ? (
                        <p className="mt-4 text-sm leading-6 text-text-secondary">
                          No reply intelligence yet. Once a lead responds, intent, urgency, and
                          suggested next steps will appear here.
                        </p>
                      ) : (
                        <div className="mt-4 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {replyInsight?.urgency && (
                              <span
                                className={cn(
                                  'rounded-full px-2.5 py-1 text-[11px] font-medium',
                                  URGENCY_STYLES[
                                    replyInsight.urgency as keyof typeof URGENCY_STYLES
                                  ] ?? 'bg-surface text-text-muted',
                                )}
                              >
                                {prettifyToken(replyInsight.urgency)} urgency
                              </span>
                            )}
                            {replyInsight?.channel && (
                              <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                                {prettifyToken(replyInsight.channel)}
                              </span>
                            )}
                            {replyInsight?.detectedAt && (
                              <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                                {formatRelativeTime(replyInsight.detectedAt)}
                              </span>
                            )}
                          </div>

                          {replyInsight?.summary && (
                            <p className="text-sm leading-6 text-text-secondary">
                              {replyInsight.summary}
                            </p>
                          )}

                          <div className="rounded-md border border-border bg-surface p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                              Next action
                            </p>
                            <p className="mt-2 text-sm font-medium text-text-primary">
                              {replyInsight?.nextAction ||
                                'Review the thread and decide the next follow-up manually.'}
                            </p>
                          </div>

                          {replyEntities.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {replyEntities.map(([key, value]) => (
                                <span
                                  key={key}
                                  className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-text-secondary"
                                >
                                  <span className="font-medium text-text-primary">
                                    {INSIGHT_ENTITY_LABELS[key]}:
                                  </span>{' '}
                                  {value}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border border-border bg-surface-raised/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            Company enrichment
                          </p>
                          <p className="mt-1 text-xs text-text-muted">
                            Company context recorded for this lead’s organization, country, and
                            product mix.
                          </p>
                        </div>
                        {companyIntel?.confidence && (
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-1 text-[11px] font-medium',
                              CONFIDENCE_STYLES[
                                companyIntel.confidence as keyof typeof CONFIDENCE_STYLES
                              ] ?? 'bg-surface text-text-muted',
                            )}
                          >
                            {prettifyToken(companyIntel.confidence)} confidence
                          </span>
                        )}
                      </div>

                      {enrichmentLoading && !companyIntel ? (
                        <div className="flex items-center gap-2 py-5 text-sm text-text-muted">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading company context…
                        </div>
                      ) : !companyIntel ? (
                        <p className="mt-4 text-sm leading-6 text-text-secondary">
                          No company enrichment yet. Generate it to get website, buyer type, size,
                          and industry context before outreach.
                        </p>
                      ) : (
                        <div className="mt-4 space-y-3">
                          {companyIntel.description && (
                            <p className="text-sm leading-6 text-text-secondary">
                              {companyIntel.description}
                            </p>
                          )}

                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <InsightMetric
                              label="Company size"
                              value={prettifyToken(companyIntel.companySize)}
                            />
                            <InsightMetric
                              label="Buyer type"
                              value={prettifyToken(companyIntel.buyerType)}
                            />
                            <InsightMetric label="Industry" value={companyIntel.industry || '—'} />
                            <InsightMetric label="GST hint" value={companyIntel.gstHint || '—'} />
                          </div>

                          {websiteUrl && (
                            <a
                              href={websiteUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-md bg-surface px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-background"
                            >
                              <Globe className="h-4 w-4" />
                              {companyIntel.website}
                            </a>
                          )}

                          {companyIntel.enrichedAt && (
                            <p className="text-xs text-text-muted">
                              Updated {formatRelativeTime(companyIntel.enrichedAt)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {lead.notes && (
                  <div className="border-b border-border px-4 py-4 sm:px-6">
                    <p className="mb-1 text-xs text-text-muted">Notes</p>
                    <p className="whitespace-pre-wrap text-sm text-text-secondary">{lead.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DrawerShell>
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete "${lead.name}"?`}
        description="This permanently removes the lead and its message history. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setConfirmDeleteOpen(false)
          deleteMutation.mutate()
        }}
      />
    </>
  )
}

/** Lifecycle stage -> dot colour. Kept next to the table that uses it. */
