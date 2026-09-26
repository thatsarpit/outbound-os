/** The per-lead conversation panel. Extracted from leads.tsx. */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inboxApi } from '@/api/endpoints/inbox'
import { leadsApi } from '@/api/endpoints/leads'
import { EMAIL_TEMPLATE_LIST_QUERY_KEY, templatesApi } from '@/api/endpoints/templates'
import type { InboxChannel, Lead, MediaFile } from '@/api/types'
import { ChannelBadge } from '@/components/inbox/channel-badge'
import { ComposerBar } from '@/components/inbox/composer-bar'
import { ConversationTimeline } from '@/components/inbox/conversation-timeline'
import { SenderHealthCard } from '@/components/inbox/sender-health-card'
import { SenderAccountSelect } from '@/components/inbox/sender-account-select'
import { TemplatePicker } from '@/components/inbox/template-picker'
import { ThreadStatePill } from '@/components/inbox/thread-state-pill'
import { AiOutreachButton } from '@/components/leads/ai-outreach-button'
import { buildReplySubject, getRenderedTemplateText } from '@/lib/email-compose'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import { Button } from '@/components/ui'
import { invalidateLeadSurfaceQueries } from '@/lib/lead-automation'
import { cn, formatRelativeTime } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'
import { InsightMetric } from './insight-helpers'

export function LeadCommunicationsPanel({
  lead,
  onLeadUpdated,
}: {
  lead: Lead
  onLeadUpdated: (lead: Lead) => void
}) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const canOperate = user?.role === 'agent' || user?.role === 'manager' || user?.role === 'admin'
  const canManageSender = user?.role === 'manager' || user?.role === 'admin'
  const [composerChannel, setComposerChannel] = useState<InboxChannel>(
    lead.email ? 'email' : 'whatsapp',
  )
  const [replyText, setReplyText] = useState('')
  const [composerSubject, setComposerSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [attachments, setAttachments] = useState<MediaFile[]>([])
  const [senderAccountId, setSenderAccountId] = useState<number | null>(
    lead.assignedEmailAccountId ?? null,
  )
  const [assignedSenderId, setAssignedSenderId] = useState<number | null>(
    lead.assignedEmailAccountId ?? null,
  )
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)

  const {
    data: thread,
    isLoading: threadLoading,
    error: threadError,
  } = useQuery({
    queryKey: ['lead-thread', lead.id],
    queryFn: () => inboxApi.getThread(lead.id),
    enabled: !!lead,
    refetchInterval: 10_000,
  })

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: EMAIL_TEMPLATE_LIST_QUERY_KEY,
    queryFn: async () => {
      const res = await templatesApi.list()
      return Array.isArray(res) ? res : []
    },
    enabled: canOperate && composerChannel === 'email',
  })

  const latestEmailMessage =
    thread?.messages
      ?.slice()
      .reverse()
      .find((message) => message.channel === 'email') || null

  const currentAssignedSender =
    thread?.senderAccount ||
    thread?.availableSenderAccounts?.find(
      (account) => account.id === (lead.assignedEmailAccountId ?? assignedSenderId),
    ) ||
    null

  useEffect(() => {
    setReplyText('')
    setSelectedTemplateId(null)
    setAssignedSenderId(lead.assignedEmailAccountId ?? null)
  }, [lead.id, lead.assignedEmailAccountId])

  useEffect(() => {
    if (!thread) return
    setComposerChannel(
      thread.channel === 'email' && lead.email
        ? 'email'
        : thread.channel === 'imessage' && lead.mobile
          ? 'imessage'
          : 'whatsapp',
    )
    setComposerSubject(buildReplySubject(latestEmailMessage?.subject || thread.subject))
    setSenderAccountId(
      thread.senderAccount?.id ||
        lead.assignedEmailAccountId ||
        thread.availableSenderAccounts?.[0]?.id ||
        null,
    )
    setAssignedSenderId(lead.assignedEmailAccountId ?? thread.senderAccount?.id ?? null)
    // Reset only when the selected lead changes. Including refreshed thread
    // objects here would overwrite a draft while the user is composing it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.leadId])

  useEffect(() => {
    if (composerChannel !== 'email') return
    if (senderAccountId || !thread?.availableSenderAccounts?.length) return
    setSenderAccountId(thread.availableSenderAccounts[0].id)
  }, [composerChannel, senderAccountId, thread?.availableSenderAccounts])

  const replyDisabledReason = !canOperate
    ? 'Read-only access. Agents, managers, and admins can reply from this drawer.'
    : composerChannel === 'email'
      ? !lead.email
        ? 'This lead does not have an email address yet.'
        : threadLoading
          ? 'Loading sender accounts…'
          : thread?.availableSenderAccounts?.length
            ? null
            : 'No verified sender account is available for this lead.'
      : !lead.mobile
        ? 'This lead does not have a mobile number yet.'
        : null

  const sendMutation = useMutation({
    mutationFn: async () => {
      const messageBody = replyText.trim()
      if (!messageBody) throw new Error('Reply cannot be empty')

      if (composerChannel === 'email') {
        if (replyDisabledReason) throw new Error(replyDisabledReason)
        const emailHtml = htmlBody.trim()
        return inboxApi.send({
          leadId: lead.id,
          channel: 'email',
          text: messageBody,
          body: messageBody,
          htmlBody: emailHtml || undefined,
          subject:
            composerSubject.trim() ||
            buildReplySubject(latestEmailMessage?.subject || thread?.subject),
          accountId: senderAccountId ?? undefined,
          replyToMessageId: latestEmailMessage?.id ?? undefined,
          attachmentIds: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
        })
      }

      return inboxApi.send({
        leadId: lead.id,
        channel: composerChannel,
        text: messageBody,
      })
    },
    onSuccess: () => {
      const now = new Date().toISOString()
      invalidateLeadSurfaceQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['lead-thread', lead.id] })
      void queryClient.invalidateQueries({ queryKey: ['inbox-thread', lead.id] })
      setReplyText('')
      setHtmlBody('')
      setAttachments([])
      toast.success(
        composerChannel === 'email'
          ? 'Email sent from lead drawer'
          : composerChannel === 'imessage'
            ? 'iMessage sent'
            : 'WhatsApp reply sent',
      )
      onLeadUpdated({
        ...lead,
        status: 'engaged',
        lastMessageAt: now,
        lastEmailAt: composerChannel === 'email' ? now : lead.lastEmailAt,
        updatedAt: now,
      })
    },
    onError: (error: Error) => toast.error(`Reply failed: ${error.message}`),
  })

  const applyTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId) throw new Error('Select a template first')
      return templatesApi.render(selectedTemplateId, {
        leadId: lead.id,
        context: {
          company: lead.company || '',
          product: lead.product || '',
          name: lead.name,
          senderName:
            thread?.availableSenderAccounts?.find((account) => account.id === senderAccountId)
              ?.senderName ||
            thread?.availableSenderAccounts?.find((account) => account.id === senderAccountId)
              ?.name ||
            '',
          senderEmail:
            thread?.availableSenderAccounts?.find((account) => account.id === senderAccountId)
              ?.email || '',
        },
      })
    },
    onSuccess: (data) => {
      if (!data) {
        toast.error('Template preview returned no content')
        return
      }
      setComposerChannel('email')
      setComposerSubject(data.subject || buildReplySubject(thread?.subject))
      setReplyText(getRenderedTemplateText(data))
      toast.success('Template applied to composer')
    },
    onError: (error: Error) => toast.error(`Template apply failed: ${error.message}`),
  })

  const assignSenderMutation = useMutation({
    mutationFn: () => leadsApi.assignEmailAccount(lead.id, assignedSenderId),
    onSuccess: () => {
      invalidateLeadSurfaceQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['lead-thread', lead.id] })
      onLeadUpdated({
        ...lead,
        assignedEmailAccountId: assignedSenderId,
        updatedAt: new Date().toISOString(),
      })
      toast.success(assignedSenderId ? 'Default sender assigned' : 'Default sender cleared')
    },
    onError: (error: Error) => toast.error(`Sender assignment failed: ${error.message}`),
  })

  const timelineState = threadLoading
    ? 'loading'
    : threadError
      ? 'error'
      : thread?.messages?.length
        ? 'ready'
        : 'empty'

  return (
    <div className="border-b border-border px-4 py-4 sm:px-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Communications
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Reply from the lead context using email or WhatsApp without leaving the drawer.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AiOutreachButton
            leadId={lead.id}
            leadName={lead.name}
            leadMobile={lead.mobile}
            leadEmail={lead.email}
            variant="secondary"
            size="sm"
          />
          <ChannelBadge channel={thread?.channel || composerChannel} variant="inline" />
          {thread?.threadState && <ThreadStatePill state={thread.threadState} compact />}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InsightMetric
          label="Last touch"
          value={lead.lastMessageAt ? formatRelativeTime(lead.lastMessageAt) : '—'}
        />
        <InsightMetric
          label="Last email"
          value={lead.lastEmailAt ? formatRelativeTime(lead.lastEmailAt) : '—'}
        />
        <InsightMetric
          label="Sender"
          value={
            currentAssignedSender?.senderName ||
            currentAssignedSender?.name ||
            currentAssignedSender?.email ||
            'Unassigned'
          }
        />
        <InsightMetric
          label="Messages"
          value={thread ? String(thread.messageCount) : threadLoading ? '…' : '0'}
        />
      </div>

      {composerChannel === 'email' && (
        <SenderHealthCard
          leadEmail={lead.email}
          emailStatus={lead.emailStatus}
          accounts={thread?.availableSenderAccounts ?? []}
          selectedAccountId={senderAccountId}
          assignedAccountId={lead.assignedEmailAccountId ?? assignedSenderId ?? undefined}
          className="mt-4"
        />
      )}

      {canManageSender && (
        <div className="mt-4 rounded-md border border-border bg-surface-raised/70 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Default sender
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Set the mailbox this lead should default to when the team replies by email.
              </p>
            </div>
            {lead.emailStatus && (
              <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] text-text-secondary">
                {lead.emailStatus}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <SenderAccountSelect
              accounts={thread?.availableSenderAccounts ?? []}
              value={assignedSenderId}
              onChange={setAssignedSenderId}
              className="flex-1"
            />
            <Button
              onClick={() => assignSenderMutation.mutate()}
              disabled={assignSenderMutation.isPending || threadLoading}
              isLoading={assignSenderMutation.isPending}
            >
              {assignedSenderId ? 'Save sender' : 'Clear sender'}
            </Button>
          </div>
        </div>
      )}

      {canOperate && composerChannel === 'email' && (
        <TemplatePicker
          templates={templates}
          value={selectedTemplateId}
          onChange={setSelectedTemplateId}
          onApply={() => applyTemplateMutation.mutate()}
          loading={templatesLoading}
          applyPending={applyTemplateMutation.isPending}
          className="mt-4"
        />
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface/60">
        <ConversationTimeline
          messages={thread?.messages}
          state={timelineState}
          error={threadError instanceof Error ? threadError.message : null}
          emptyDescription="This lead has no conversation history yet. Start the first reply from the composer below."
        />
        <div className="px-4 sm:px-5">
          <div className="pointer-events-none h-px bg-border" />
        </div>

        <ComposerBar
          channel={composerChannel}
          onChannelChange={setComposerChannel}
          subject={composerSubject}
          onSubjectChange={setComposerSubject}
          text={replyText}
          onTextChange={setReplyText}
          htmlBody={htmlBody}
          onHtmlBodyChange={setHtmlBody}
          attachments={attachments}
          onAddAttachment={(file) => setAttachments((prev) => [...prev, file])}
          onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
          onSend={() => sendMutation.mutate()}
          sendPending={sendMutation.isPending}
          senderAccounts={thread?.availableSenderAccounts ?? []}
          senderAccountId={senderAccountId}
          onSenderAccountChange={setSenderAccountId}
          helperLabel={
            composerChannel === 'email'
              ? 'Reply in thread from the selected sender'
              : 'Reply on WhatsApp from the lead drawer'
          }
          placeholder={
            composerChannel === 'email'
              ? 'Write the email reply your agent should send…'
              : 'Type the WhatsApp reply…'
          }
          disabled={!canOperate}
          sendDisabled={
            sendMutation.isPending ||
            !replyText.trim() ||
            Boolean(replyDisabledReason) ||
            (composerChannel === 'email' && !composerSubject.trim())
          }
        />

        {(sendMutation.error || replyDisabledReason) && (
          <div
            className={cn(
              'mx-4 mb-3 flex items-center gap-2 rounded-lg p-2.5 text-xs animate-slide-up sm:mx-5',
              sendMutation.error ? 'bg-danger-muted text-danger' : 'bg-warning-muted text-warning',
            )}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {(sendMutation.error as Error | null)?.message || replyDisabledReason}
          </div>
        )}
      </div>
    </div>
  )
}
