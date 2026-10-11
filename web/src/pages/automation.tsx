import { CalendarClock, CheckCircle2, Clock, Mail, Power } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { ActionButton } from '@/components/settings/settings-action-button'
import { StatCard } from '@/components/settings/settings-stats'
import { SettingsField, ToggleField } from '@/components/settings/settings-fields'
import { PageHeader } from '@/components/ui/page-header'
import { dailyEmailApi } from '@/api/endpoints/email'
import { toast } from '@/stores/toast-store'

export default function AutomationPage() {
  const queryClient = useQueryClient()
  const { data: dailyStatus, isError: statusError } = useQuery({
    queryKey: ['daily-email-status'],
    queryFn: () => dailyEmailApi.status(),
    refetchInterval: 30_000,
  })
  const dailySettingsMutation = useMutation({
    mutationFn: dailyEmailApi.update,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['daily-email-status'] }),
    onError: (error: Error) => toast.error(`Daily email update failed: ${error.message}`),
  })
  const previewMutation = useMutation({
    mutationFn: () => dailyEmailApi.preview(dailyStatus?.batchSize),
    onSuccess: (result) =>
      toast.success(`Preview ready: ${result?.count || 0} eligible leads, no emails sent`),
    onError: (error: Error) => toast.error(`Preview failed: ${error.message}`),
  })
  const [brevoFolderDraft, setBrevoFolderDraft] = useState('')
  const [brevoFolderDirty, setBrevoFolderDirty] = useState(false)

  useEffect(() => {
    if (!brevoFolderDirty) {
      setBrevoFolderDraft(
        dailyStatus?.marketing?.folderId ? String(dailyStatus.marketing.folderId) : '',
      )
    }
  }, [dailyStatus?.marketing?.folderId, brevoFolderDirty])

  const saveBrevoFolderId = () => {
    const candidate = brevoFolderDraft.trim()
    if (!candidate) {
      dailySettingsMutation.mutate(
        { brevoFolderId: null },
        { onSuccess: () => setBrevoFolderDirty(false) },
      )
      return
    }
    const folderId = Number(candidate)
    if (!Number.isInteger(folderId) || folderId < 1) {
      toast.error('Brevo folder ID must be a positive whole number')
      return
    }
    dailySettingsMutation.mutate(
      { brevoFolderId: folderId },
      { onSuccess: () => setBrevoFolderDirty(false) },
    )
  }

  if (!dailyStatus)
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Outreach"
          title="Automation"
          description="Review the daily selection schedule, delivery gates and sender allocation."
        />
        <p
          role="status"
          className="rounded-lg border border-border bg-surface p-5 text-sm text-text-secondary"
        >
          {statusError
            ? 'Unable to load outreach settings. Refresh the page to try again.'
            : 'Loading outreach settings…'}
        </p>
      </div>
    )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Outreach"
        title="Automation"
        description="Review the daily selection schedule, delivery gates and sender allocation."
      />
      <SettingsPanel
        icon={CalendarClock}
        title="Daily email outreach"
        description="Select eligible leads each day and review sender allocation before delivery."
        action={
          <ActionButton
            onClick={() => previewMutation.mutate()}
            pending={previewMutation.isPending}
            label="Preview Next Batch"
          />
        }
      >
        <div className="grid gap-4 lg:grid-cols-4">
          <StatCard
            icon={Power}
            label="Automation"
            value={dailyStatus?.enabled ? 'Enabled' : 'Disabled'}
          />
          <StatCard icon={Mail} label="Daily batch" value={String(dailyStatus?.batchSize ?? 100)} />
          <StatCard
            icon={CheckCircle2}
            label="Eligible now"
            value={String(dailyStatus?.eligibleCount ?? 0)}
          />
          <StatCard
            icon={Clock}
            label="Campaign delivery"
            value={dailyStatus?.marketing?.enabled ? 'Armed' : 'Off'}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ToggleField
            label="Enable daily selection"
            description="The global pause still controls actual delivery."
            checked={dailyStatus?.enabled ?? true}
            onChange={(enabled) => dailySettingsMutation.mutate({ enabled })}
          />
          <SettingsField
            label="Leads per day"
            type="number"
            value={String(dailyStatus?.batchSize ?? 100)}
            onChange={(value) => {
              const batchSize = Number(value)
              if (Number.isInteger(batchSize) && batchSize >= 1 && batchSize <= 200) {
                dailySettingsMutation.mutate({ batchSize })
              }
            }}
          />
          <ToggleField
            label="Allow Brevo campaign delivery"
            description="Uses Brevo Marketing Campaigns only. It remains blocked while global sending is paused, senders are unverified, the recipient-list folder/webhook is unset, or recipients lack marketing consent."
            checked={dailyStatus?.marketing?.enabled ?? false}
            onChange={(marketingEnabled) => dailySettingsMutation.mutate({ marketingEnabled })}
          />
          <div>
            <SettingsField
              label="Brevo recipient-list folder ID"
              value={brevoFolderDraft}
              onChange={(value) => {
                setBrevoFolderDraft(value)
                setBrevoFolderDirty(true)
              }}
              onBlur={saveBrevoFolderId}
              placeholder="Paste the numeric Brevo contacts-folder ID"
              error={
                brevoFolderDirty &&
                brevoFolderDraft.trim() &&
                !/^[1-9]\d*$/.test(brevoFolderDraft.trim())
                  ? 'Use a positive whole number'
                  : undefined
              }
            />
            <p className="mt-1 text-xs text-text-muted">
              Saved when this field loses focus. This is where Brevo stores the daily campaign
              recipient lists.
            </p>
          </div>
        </div>
        <div className="rounded-md border border-border bg-surface-raised/50 p-4 text-xs text-text-secondary">
          <p>{dailyStatus?.schedule || '06:05 daily with startup catch-up'}</p>
          <p className="mt-2">
            Sender split:{' '}
            {dailyStatus?.accounts
              .map((account) => `${account.email} (${account.sentToday}/${account.dailyLimit})`)
              .join(' · ') || 'waiting for verified senders'}
          </p>
          <p className="mt-2">
            Launch allocation: up to {dailyStatus?.perSenderQuota ?? 50} unique consented recipients
            per configured sender. Ramp-up stays gated until delivery, bounce, and complaint
            telemetry is healthy.
          </p>
          <p className="mt-2">
            Delivery route:{' '}
            {dailyStatus?.deliveryMode === 'brevo_marketing'
              ? 'Brevo Marketing Campaigns'
              : dailyStatus?.deliveryMode || 'not configured'}{' '}
            ·{' '}
            {dailyStatus?.marketing?.globallyPaused
              ? 'globally paused'
              : dailyStatus?.marketing?.ready
                ? 'ready to launch'
                : 'waiting on launch gates'}
            .
          </p>
          <p className="mt-2">
            Campaign telemetry:{' '}
            {dailyStatus?.marketing?.folderConfigured
              ? 'recipient-list folder set'
              : 'recipient-list folder missing'}{' '}
            ·{' '}
            {dailyStatus?.marketing?.webhookConfigured
              ? 'public Brevo webhook configured'
              : 'public Brevo webhook missing'}
            .
          </p>
          {dailyStatus?.lastRunAt && (
            <p className="mt-2">
              Last selection: {new Date(dailyStatus.lastRunAt).toLocaleString()}
            </p>
          )}
        </div>
        {dailyStatus?.accounts.some((account) => account.status !== 'verified') && (
          <div className="rounded-md border border-danger/40 bg-danger-muted/30 p-4 text-xs leading-5 text-text-secondary">
            Brevo is not ready: all configured senders must show Verified before this scheduler can
            queue any email.
          </div>
        )}
        {!dailyStatus?.marketing?.folderConfigured && (
          <div className="rounded-md border border-warning/40 bg-warning-muted/30 p-4 text-xs leading-5 text-text-secondary">
            Brevo needs a contacts-folder ID before it can create the daily recipient lists. Create
            or choose a dedicated folder in Brevo, then paste its numeric ID above.
          </div>
        )}
        {!dailyStatus?.marketing?.webhookConfigured && (
          <div className="rounded-md border border-warning/40 bg-warning-muted/30 p-4 text-xs leading-5 text-text-secondary">
            Delivery and opt-out telemetry is blocked until the server has a public HTTPS webhook
            URL and a <code>BREVO_WEBHOOK_SECRET</code> configured.
          </div>
        )}
        {(dailyStatus?.blockedNoConsentCount ?? 0) > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning-muted/30 p-4 text-xs leading-5 text-text-secondary">
            Marketing consent gate: {dailyStatus?.consentedCount ?? 0} consented lead(s) are
            eligible; {dailyStatus?.blockedNoConsentCount ?? 0} email address(es) are excluded until
            consent is recorded.
          </div>
        )}
      </SettingsPanel>
    </div>
  )
}
