/** The campaign detail drawer. Extracted from campaigns.tsx. */
import { useMutation, useQuery } from '@tanstack/react-query'
import { BarChart3, Mail, X } from 'lucide-react'
import { campaignsApi } from '@/api/endpoints/campaigns'
import type { Campaign } from '@/api/types'
import { Button, DrawerShell, LoadingState } from '@/components/ui'
import { cn, formatCount, formatRelativeTime } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import {
  num,
  percent,
  normalizeStatus,
  StatusMark,
  ChannelMark,
  ProgressBar,
  campaignLeadDot,
  Panel,
} from './campaign-shared'

export function CampaignDetailDrawer({
  campaign,
  onClose,
}: {
  campaign: Campaign
  onClose: () => void
}) {
  const { data: campaignLeads = [], isLoading } = useQuery({
    queryKey: ['campaign-leads', campaign.id],
    queryFn: async () => {
      const res = await campaignsApi.getLeads(campaign.id)
      return Array.isArray(res?.leads) ? res.leads : []
    },
  })

  const testSendMutation = useMutation({
    mutationFn: () => campaignsApi.testSend(campaign.id),
    onSuccess: (data) => {
      toast.success(data?.sentTo ? `Test email sent to ${data.sentTo}` : 'Test email sent')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Test send failed')
    },
  })

  const totalLeads = num(campaign.totalLeads)
  const sentCount = num(campaign.sentCount)
  const replyCount = num(campaign.replyCount)
  const failedCount = num(campaign.failedCount)
  const hasAB = Boolean(campaign.variantBTemplate)
  const aRate =
    num(campaign.variantACount) > 0
      ? `${percent(num(campaign.variantAReplies), num(campaign.variantACount)).toFixed(1)}%`
      : '—'
  const bRate =
    num(campaign.variantBCount) > 0
      ? `${percent(num(campaign.variantBReplies), num(campaign.variantBCount)).toFixed(1)}%`
      : '—'
  const deliveryRate = percent(sentCount, totalLeads)
  const replyRate = percent(replyCount, sentCount)
  const canTestSend =
    (campaign.channel === 'email' || campaign.channel === 'both') &&
    Boolean(campaign.senderAccountId) &&
    normalizeStatus(campaign.status) === 'draft'

  return (
    <DrawerShell onClose={onClose}>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-text-primary">{campaign.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusMark status={campaign.status} />
              <ChannelMark channel={campaign.channel} />
            </div>
            {campaign.description && (
              <p className="mt-1 truncate text-[11px] text-text-muted">{campaign.description}</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
            <DrawerStat label="Audience" value={formatCount(totalLeads)} />
            <DrawerStat label="Sent" value={formatCount(sentCount)} />
            <DrawerStat label="Replies" value={formatCount(replyCount)} />
            <DrawerStat
              label="Failed"
              value={formatCount(failedCount)}
              tone={failedCount > 0 ? 'danger' : undefined}
            />
            <DrawerStat label="Delivered" value={`${deliveryRate.toFixed(1)}%`} />
            <DrawerStat label="Reply rate" value={`${replyRate.toFixed(1)}%`} />
          </div>

          <div>
            <div className="flex items-baseline justify-between text-[11px] text-text-muted">
              <span>Delivery progress</span>
              <span className="tabular-nums">
                {formatCount(sentCount)} / {formatCount(totalLeads)}
              </span>
            </div>
            <ProgressBar className="mt-1.5" value={deliveryRate} />
          </div>

          {canTestSend && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => testSendMutation.mutate()}
              pending={testSendMutation.isPending}
              pendingLabel="Sending…"
              leftIcon={<Mail className="h-3.5 w-3.5" />}
            >
              Send a test email to yourself
            </Button>
          )}

          <Panel title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-text-muted">Scheduled</dt>
              <dd className="text-text-primary">
                {campaign.scheduledAt ? formatRelativeTime(campaign.scheduledAt) : 'Not scheduled'}
              </dd>
              <dt className="text-text-muted">Started</dt>
              <dd className="text-text-primary">
                {campaign.startedAt ? formatRelativeTime(campaign.startedAt) : 'Not started'}
              </dd>
              <dt className="text-text-muted">Completed</dt>
              <dd className="text-text-primary">
                {campaign.completedAt ? formatRelativeTime(campaign.completedAt) : 'Not completed'}
              </dd>
              <dt className="text-text-muted">Created</dt>
              <dd className="text-text-primary">
                {campaign.createdAt ? formatRelativeTime(campaign.createdAt) : '—'}
              </dd>
              {campaign.senderAccountId != null && (
                <>
                  <dt className="text-text-muted">Sender</dt>
                  <dd className="tabular-nums text-text-primary">#{campaign.senderAccountId}</dd>
                </>
              )}
              {campaign.emailSubject && (
                <>
                  <dt className="text-text-muted">Subject</dt>
                  <dd className="break-words text-text-primary">{campaign.emailSubject}</dd>
                </>
              )}
            </dl>
          </Panel>

          {hasAB && (
            <Panel title="A/B results">
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    [
                      'Variant A',
                      aRate,
                      num(campaign.variantACount),
                      num(campaign.variantAReplies),
                    ],
                    [
                      'Variant B',
                      bRate,
                      num(campaign.variantBCount),
                      num(campaign.variantBReplies),
                    ],
                  ] as const
                ).map(([label, rate, sent, replies]) => (
                  <div key={label} className="rounded-md border border-border bg-surface p-3">
                    <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
                      <BarChart3 aria-hidden="true" className="h-3 w-3" />
                      {label}
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">{rate}</p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-text-muted">
                      {formatCount(sent)} sent &middot; {formatCount(replies)} replies
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Message template">
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface p-3 font-mono text-[12px] leading-5 text-text-primary">
              {campaign.messageTemplate || 'No message template saved.'}
            </pre>
          </Panel>

          {campaign.targetFilter && (
            <Panel title="Target filter">
              <pre className="overflow-x-auto rounded-md border border-border bg-surface p-3 font-mono text-[11px] leading-5 text-text-secondary">
                {campaign.targetFilter}
              </pre>
            </Panel>
          )}

          <Panel title={`Campaign leads (${formatCount(campaignLeads.length)})`}>
            {isLoading ? (
              <LoadingState label="Loading populated leads…" />
            ) : campaignLeads.length > 0 ? (
              <ul className="max-h-64 divide-y divide-border-subtle overflow-y-auto rounded-md border border-border bg-surface">
                {campaignLeads.slice(0, 50).map((campaignLead) => (
                  <li
                    key={campaignLead.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-text-primary">
                        {campaignLead.lead?.name || 'Unknown lead'}
                        {campaignLead.lead?.mobile && (
                          <span className="ml-2 tabular-nums text-text-muted">
                            {campaignLead.lead.mobile}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-text-muted">
                        {campaignLead.sentAt
                          ? `Sent ${formatRelativeTime(campaignLead.sentAt)}`
                          : 'Queued for send'}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2 text-[11px] text-text-secondary">
                      {hasAB && <span className="text-text-muted">{campaignLead.variant}</span>}
                      <span className="inline-flex items-center gap-1.5 capitalize">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            campaignLeadDot(campaignLead.status),
                          )}
                        />
                        {campaignLead.status}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-text-secondary">
                No leads are populated yet. Populate the campaign to see delivery state, variants
                and send timing.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </DrawerShell>
  )
}

function DrawerStat({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <p
        className={cn(
          'text-base font-semibold tabular-nums tracking-tight',
          tone === 'danger' ? 'text-danger' : 'text-text-primary',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-text-muted">{label}</p>
    </div>
  )
}
