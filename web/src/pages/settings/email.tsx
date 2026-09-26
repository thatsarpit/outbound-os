import {
  AlertTriangle,
  Brain,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Power,
  Shield,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { ActionButton } from '@/components/settings/settings-action-button'
import { StatCard, MiniStat } from '@/components/settings/settings-stats'
import {
  SettingsField,
  SelectField,
  TextareaField,
  ToggleField,
} from '@/components/settings/settings-fields'
import { cn } from '@/lib/utils'
import { useEmailAccounts } from '@/hooks/use-email-accounts'
import { useWhatsAppAccounts } from '@/hooks/use-whatsapp-accounts'
import { dailyEmailApi } from '@/api/endpoints/email'
import { toast } from '@/stores/toast-store'

export default function EmailSettingsPage() {
  const queryClient = useQueryClient()
  const timezoneOffset = typeof window === 'undefined' ? 0 : new Date().getTimezoneOffset()
  const { accounts } = useWhatsAppAccounts(timezoneOffset)
  const {
    emailAccounts,
    emailAccountsLoading,
    unmappedEmailAccounts,
    selectedEmailAccountId,
    setSelectedEmailAccountId,
    selectedEmailAccount,
    emailAccountForm,
    setEmailAccountForm,
    emailAccountMutation,
  } = useEmailAccounts()
  const { data: dailyStatus } = useQuery({
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

  if (emailAccountsLoading) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    )
  }

  const totalEmailAccounts = emailAccounts.length
  const mappedEmailAccounts = emailAccounts.filter((a) => a.whatsappAccountId).length

  return (
    <div className="space-y-6">
      <SettingsPanel
        icon={CalendarClock}
        title="Daily WhatsApp-driving email batch"
        description="Selects new eligible leads once per day, alternates them across both verified domains, and schedules each email for the recipient's local morning. A startup catch-up runs after this Mac wakes."
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
            Brevo is not ready: both configured senders must show Verified before this scheduler can
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
            Delivery and opt-out telemetry is blocked until this Mac has a public HTTPS webhook URL
            and a <code>BREVO_WEBHOOK_SECRET</code> configured.
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

      {unmappedEmailAccounts.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-danger/40 bg-danger-muted/40 px-5 py-4 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-2">
            <p className="font-semibold">
              {unmappedEmailAccounts.length} email account
              {unmappedEmailAccounts.length === 1 ? '' : 's'} without a brand persona
            </p>
            <p className="leading-6 text-danger/90">
              These accounts will refuse to send outbound email until you link them to a WhatsApp
              brand. Wrong branding is worse than no send — fix the mapping below.
            </p>
            <ul className="ml-1 mt-1 list-disc space-y-0.5 pl-4 text-xs text-danger/90">
              {unmappedEmailAccounts.map((acc) => (
                <li key={acc.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedEmailAccountId(acc.id)}
                    className="underline underline-offset-2 hover:text-danger"
                  >
                    {acc.email}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <SettingsPanel
        icon={Mail}
        title="Email Accounts"
        description="Pick an email sender to bind it to a WhatsApp brand persona. The persona supplies the name, signature and company details on every email from this sender."
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <MiniStat label="Total senders" value={String(totalEmailAccounts)} />
          <MiniStat label="Mapped to brand" value={String(mappedEmailAccounts)} />
          <MiniStat label="Unmapped" value={String(unmappedEmailAccounts.length)} />
        </div>
        {emailAccounts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-surface-raised/50 p-6 text-sm text-text-secondary">
            No email accounts found. Add one via the API or backend to start mapping it here.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {emailAccounts.map((acc) => {
              const active = acc.id === selectedEmailAccountId
              const persona = accounts.find((wa) => wa.id === acc.whatsappAccountId)
              return (
                <button
                  key={acc.id}
                  onClick={() => setSelectedEmailAccountId(acc.id)}
                  className={cn(
                    'rounded-md border p-4 text-left transition-all',
                    active
                      ? 'border-accent bg-accent-muted/30'
                      : 'border-border bg-surface hover:border-accent/30 hover:bg-surface-raised',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{acc.email}</p>
                      <p className="mt-1 truncate text-xs text-text-muted">
                        {acc.name || acc.senderName || 'Unnamed sender'}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                        acc.enabled
                          ? 'bg-success-muted text-success'
                          : 'bg-surface-raised text-text-muted',
                      )}
                    >
                      {acc.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    {persona ? (
                      <span className="rounded-full bg-success-muted px-2 py-1 text-success">
                        {persona.personaName || persona.name} @ {persona.companyName || 'unset'}
                      </span>
                    ) : (
                      <span className="rounded-full bg-danger-muted px-2 py-1 text-danger">
                        No brand persona
                      </span>
                    )}
                    <span className="rounded-full bg-surface-raised px-2 py-1 text-text-muted">
                      {acc.sentToday ?? 0} sent today
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </SettingsPanel>

      {selectedEmailAccount && emailAccountForm && (
        <SettingsPanel
          icon={Shield}
          title={`Selected: ${selectedEmailAccount.email}`}
          description="The brand persona decides whose name, signature and company details go out on email from this sender. Get it wrong and the mail is signed by the wrong business."
          footer={
            <ActionButton
              onClick={() => emailAccountMutation.mutate()}
              pending={emailAccountMutation.isPending}
              label="Save email account"
            />
          }
        >
          <div className="grid gap-4 lg:grid-cols-4">
            <StatCard icon={Mail} label="Address" value={selectedEmailAccount.email} />
            <StatCard
              icon={CheckCircle2}
              label="Status"
              value={selectedEmailAccount.status || 'Unknown'}
            />
            <StatCard
              icon={Clock}
              label="Daily Limit"
              value={String(selectedEmailAccount.dailyLimit ?? 0)}
            />
            <StatCard
              icon={Power}
              label="Sent Today"
              value={String(selectedEmailAccount.sentToday ?? 0)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SettingsField
              label="Display Name"
              value={emailAccountForm.name}
              onChange={(v) => setEmailAccountForm({ ...emailAccountForm, name: v })}
            />
            <SettingsField
              label="Sender Name (From header)"
              value={emailAccountForm.senderName}
              onChange={(v) => setEmailAccountForm({ ...emailAccountForm, senderName: v })}
              placeholder="Kavya Sharma"
            />
            <SettingsField
              label="Hourly Limit"
              value={emailAccountForm.hourlyLimit}
              onChange={(v) => setEmailAccountForm({ ...emailAccountForm, hourlyLimit: v })}
              type="number"
            />
            <SettingsField
              label="Daily Limit"
              value={emailAccountForm.dailyLimit}
              onChange={(v) => setEmailAccountForm({ ...emailAccountForm, dailyLimit: v })}
              type="number"
            />
          </div>

          <div className="rounded-md border border-accent/40 bg-accent-muted/20 p-4">
            <div className="mb-3 flex items-start gap-3">
              <Brain className="mt-0.5 h-4 w-4 text-accent" />
              <div>
                <p className="text-sm font-semibold text-text-primary">Brand Persona</p>
                <p className="mt-1 text-xs text-text-secondary">
                  Required. Pick the WhatsApp account whose persona, company name, certs, and USP
                  this email sender should impersonate. If left unset, the sender will refuse to
                  send outbound email.
                </p>
              </div>
            </div>
            <SelectField
              label="WhatsApp brand persona"
              value={emailAccountForm.whatsappAccountId}
              onChange={(value) =>
                setEmailAccountForm({ ...emailAccountForm, whatsappAccountId: value })
              }
              options={[
                { value: '', label: '— Unmapped (will refuse to send) —' },
                ...accounts.map((wa) => ({
                  value: String(wa.id),
                  label: `${wa.personaName || wa.name} @ ${wa.companyName || 'unset'} (#${wa.id})`,
                })),
              ]}
            />
          </div>

          <TextareaField
            label="Signature (HTML or plain text)"
            value={emailAccountForm.signature}
            onChange={(v) => setEmailAccountForm({ ...emailAccountForm, signature: v })}
            rows={4}
          />
        </SettingsPanel>
      )}
    </div>
  )
}
