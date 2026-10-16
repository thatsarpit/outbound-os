import { CalendarClock, CheckCircle2, Clock, Mail, Power } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BatchPolicyForm } from '@/components/settings/email-batch-policy'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { StatCard } from '@/components/settings/settings-stats'
import { ToggleField } from '@/components/settings/settings-fields'
import { Button, Input } from '@/components/ui'
import { PageHeader } from '@/components/ui/page-header'
import { dailyEmailApi } from '@/api/endpoints/email'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'

const reasonText = (reason?: string) => (reason || 'Review the batch settings').replace(/_/g, ' ')

export default function AutomationPage() {
  const queryClient = useQueryClient()
  const canManage = useAuthStore((state) => state.user?.role === 'admin')
  const [policyDirty, setPolicyDirty] = useState(false)
  const { data: dailyStatus, isError: statusError } = useQuery({
    queryKey: ['daily-email-status'],
    queryFn: () => dailyEmailApi.status(),
    refetchInterval: 30_000,
  })
  const previewMutation = useMutation({
    mutationFn: () => dailyEmailApi.preview(),
    onSuccess: (result) =>
      result.skipped
        ? toast.error(reasonText(result.reason))
        : toast.success(`Preview ready: ${result.count} recipients, no emails sent`),
    onError: (error: Error) => toast.error(`Preview failed: ${error.message}`),
  })
  const settingsMutation = useMutation({
    mutationFn: dailyEmailApi.update,
    onMutate: () => previewMutation.reset(),
    onSuccess: (result) => {
      queryClient.setQueryData(['daily-email-status'], result)
      void queryClient.invalidateQueries({ queryKey: ['daily-email-status'] })
    },
    onError: (error: Error) => toast.error(`Batch settings were not saved: ${error.message}`),
  })
  const launchMutation = useMutation({
    mutationFn: (hash: string) => dailyEmailApi.queue(hash),
    onSuccess: (result) => {
      if (result.skipped || !result.queued)
        toast.error(
          `Batch not sent: ${reasonText(result.reason || 'review provider drafts and current recipient eligibility')}`,
        )
      else
        toast.success(
          `Brevo accepted ${result.queued} recipients. Delivery results arrive separately.`,
        )
      previewMutation.reset()
      void queryClient.invalidateQueries({ queryKey: ['daily-email-status'] })
    },
    onError: (error: Error) => {
      previewMutation.reset()
      toast.error(`Launch needs review: ${error.message}. Check provider drafts before retrying.`)
    },
  })
  const [folderDraft, setFolderDraft] = useState('')
  const [folderDirty, setFolderDirty] = useState(false)
  useEffect(() => {
    if (!folderDirty)
      setFolderDraft(dailyStatus?.marketing?.folderId ? String(dailyStatus.marketing.folderId) : '')
  }, [dailyStatus?.marketing?.folderId, folderDirty])
  const saveFolder = async () => {
    const raw = folderDraft.trim()
    if (raw && !/^[1-9]\d*$/.test(raw)) {
      toast.error('Brevo folder ID must be a positive whole number')
      return
    }
    try {
      await settingsMutation.mutateAsync({ brevoFolderId: raw ? Number(raw) : null })
      setFolderDirty(false)
    } catch {
      /* Keep the unsaved value for correction. */
    }
  }
  if (!dailyStatus)
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Outreach"
          title="Automation"
          description="Configure and review email batches before a manual launch."
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
  const selected = dailyStatus.accounts.filter((account) =>
    dailyStatus.senderIds.includes(account.id),
  )
  const preview = previewMutation.data
  const senderCounts = new Map<number, { sender: string; count: number }>()
  for (const item of preview?.items || []) {
    const entry = senderCounts.get(item.accountId) || { sender: item.sender, count: 0 }
    entry.count += 1
    senderCounts.set(item.accountId, entry)
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Outreach"
        title="Automation"
        description="Configure and review email batches before a manual launch."
      />
      <SettingsPanel icon={CalendarClock} title="Email batches" description={dailyStatus.schedule}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Power} label="Launch mode" value="Manual" />
          <StatCard icon={Mail} label="Batch maximum" value={String(dailyStatus.batchSize)} />
          <StatCard
            icon={CheckCircle2}
            label="Eligible unique addresses"
            value={String(dailyStatus.eligibleCount)}
          />
          <StatCard
            icon={Clock}
            label="Campaign delivery"
            value={dailyStatus.marketing?.enabled ? 'Armed' : 'Off'}
          />
        </div>
        <BatchPolicyForm
          status={dailyStatus}
          pending={settingsMutation.isPending || launchMutation.isPending}
          canManage={canManage}
          onSave={settingsMutation.mutateAsync}
          onDirty={(dirty) => {
            setPolicyDirty(dirty)
            if (dirty) previewMutation.reset()
          }}
        />
        {!dailyStatus.policyReady && (
          <p
            role="status"
            className="rounded-md border border-warning/40 bg-warning-muted/30 p-4 text-sm text-text-secondary"
          >
            Save allowed countries, a supported template and selected senders before previewing.
            Existing settings do not automatically authorize a new audience.
          </p>
        )}
        {dailyStatus.templateError && (
          <p role="alert" className="text-sm text-danger">
            {dailyStatus.templateError}
          </p>
        )}
        <fieldset
          disabled={!canManage || settingsMutation.isPending || launchMutation.isPending}
          className="grid gap-4 md:grid-cols-2"
        >
          <legend className="mb-3 text-sm font-medium">Launch permissions</legend>
          <ToggleField
            label="Allow reviewed batch launches"
            description="An administrator must preview and launch each batch. This does not schedule emails."
            checked={dailyStatus.enabled}
            onChange={(enabled) => settingsMutation.mutate({ enabled })}
          />
          <ToggleField
            label="Allow Brevo campaign delivery"
            description="Global pause, verified senders, provider capacity, folder, webhook and recipient eligibility still apply."
            checked={dailyStatus.marketing?.enabled ?? false}
            onChange={(marketingEnabled) => settingsMutation.mutate({ marketingEnabled })}
          />
          <div className="space-y-2">
            <Input
              className="min-h-11 text-base sm:min-h-10 sm:text-sm"
              label="Brevo recipient-list folder ID"
              value={folderDraft}
              placeholder="Numeric contacts-folder ID"
              onChange={(event) => {
                setFolderDraft(event.target.value)
                setFolderDirty(true)
                previewMutation.reset()
              }}
            />
            <Button
              className="min-h-11 sm:min-h-9"
              variant="secondary"
              disabled={!folderDirty}
              onClick={saveFolder}
            >
              Save folder
            </Button>
          </div>
        </fieldset>
        <div className="space-y-2 rounded-md border border-border bg-surface-raised/50 p-4 text-sm text-text-secondary">
          <p>
            Selected senders:{' '}
            {selected.map((account) => account.email).join(' · ') || 'None selected'}
          </p>
          <p>
            Delivery:{' '}
            {dailyStatus.marketing?.globallyPaused
              ? 'Globally paused'
              : dailyStatus.marketing?.ready
                ? 'Provider gates ready'
                : 'Waiting on provider gates'}
            .
          </p>
          <p>
            Recipient-list folder:{' '}
            {dailyStatus.marketing?.folderConfigured ? 'Configured' : 'Missing'} · Provider webhook:{' '}
            {dailyStatus.marketing?.webhookConfigured ? 'Configured' : 'Missing'}.
          </p>
          <p>
            Recipients are deduplicated across lead rows. Previous email exposure, replies, pauses,
            opt-outs and failed addresses are excluded.
          </p>
          {dailyStatus.lastRunAt && (
            <p>
              Last accepted batch: {new Date(dailyStatus.lastRunAt).toLocaleString()} ·{' '}
              {dailyStatus.lastQueued} recipients.
            </p>
          )}
        </div>
        {dailyStatus.marketing?.error && (
          <p role="alert" className="text-sm text-danger">
            {dailyStatus.marketing.error}
          </p>
        )}
        {!dailyStatus.canLaunchToday && (
          <p role="status" className="text-sm text-text-secondary">
            The workspace’s batch for today has already been accepted. You can preview the next
            audience; the next launch becomes available on the next workspace day.
          </p>
        )}
        {!canManage && (
          <p className="text-sm text-text-secondary">
            You can preview batches. An administrator manages settings and launches delivery.
          </p>
        )}
        <Button
          className="min-h-11 sm:min-h-9"
          variant="secondary"
          pending={previewMutation.isPending}
          disabled={
            policyDirty ||
            folderDirty ||
            settingsMutation.isPending ||
            launchMutation.isPending ||
            !dailyStatus.policyReady
          }
          onClick={() => previewMutation.mutate()}
        >
          Preview batch
        </Button>
      </SettingsPanel>
      {preview && !preview.skipped && (
        <SettingsPanel
          icon={Mail}
          title="Review this batch"
          description="Previewing sends no email. Sending uses this audience, template and sender allocation; changed data requires a new preview."
        >
          <p className="text-sm">
            <strong>{preview.count} recipients</strong> · {preview.template?.name} ·{' '}
            {preview.countries?.join(', ')}
          </p>
          {preview.sample && (
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm">
                Preview email for the first recipient
              </summary>
              <p className="my-3 break-words text-sm font-medium">
                Subject: {preview.sample.subject}
              </p>
              <iframe
                title="Batch email preview"
                sandbox=""
                srcDoc={preview.sample.htmlBody}
                className="w-full rounded-md border border-border bg-white"
                style={{ height: 'min(60vh, 600px)', minHeight: 320 }}
              />
            </details>
          )}
          <ul className="space-y-2 text-sm text-text-secondary">
            {[...senderCounts].map(([id, item]) => (
              <li key={id}>
                {item.sender}: {item.count}
              </li>
            ))}
          </ul>
          <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm">View all recipients</summary>
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm text-text-secondary">
              {preview.items.map((item) => (
                <li key={item.leadId} className="break-all">
                  {item.email} · {item.country} · {item.sender}
                </li>
              ))}
            </ul>
          </details>
          {canManage && (
            <Button
              className="min-h-11 sm:min-h-9"
              pending={launchMutation.isPending}
              disabled={
                !preview.previewHash ||
                !dailyStatus.canLaunchToday ||
                previewMutation.isPending ||
                !dailyStatus.enabled ||
                !dailyStatus.marketing?.ready ||
                policyDirty ||
                folderDirty ||
                settingsMutation.isPending
              }
              onClick={() => preview.previewHash && launchMutation.mutate(preview.previewHash)}
            >
              Send {preview.count} emails through Brevo
            </Button>
          )}
        </SettingsPanel>
      )}
    </div>
  )
}
