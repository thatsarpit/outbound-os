import {
  Brain,
  CheckCircle2,
  Clock,
  Loader2,
  Power,
  PowerOff,
  Settings2,
  Shield,
  Smartphone,
  Trash2,
} from 'lucide-react'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { ActionButton } from '@/components/settings/settings-action-button'
import { StatCard, MiniStat } from '@/components/settings/settings-stats'
import { SettingsField, TextareaField, ReadOnlyField } from '@/components/settings/settings-fields'
import { WhatsAppAccountGrid } from '@/components/settings/whatsapp-account-grid'
import { WhatsAppConnectionPanel } from '@/components/settings/whatsapp-connection-panel'
import { WhatsAppPricingPanel } from '@/components/settings/whatsapp-pricing-panel'
import { useWhatsAppAccounts } from '@/hooks/use-whatsapp-accounts'
import { formatDate } from '@/lib/format-date'

export default function WhatsAppSettingsPage() {
  const timezoneOffset = typeof window === 'undefined' ? 0 : new Date().getTimezoneOffset()
  const {
    accounts,
    accountsLoading,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    accountForm,
    setAccountForm,
    cloudForm,
    setCloudForm,
    accountMutation,
    cloudMutation,
    testConnectionMutation,
    enableMutation,
    disableMutation,
    waDeleteMutation,
  } = useWhatsAppAccounts(timezoneOffset)

  if (accountsLoading) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    )
  }

  const totalAccounts = accounts.length
  const enabledAccounts = accounts.filter((a) => a.enabled).length
  const cloudAccounts = accounts.filter(
    (a) => a.metaConfigured || a.projectApiConfigured || a.campaignApiConfigured,
  ).length

  return (
    <div className="space-y-6">
      <SettingsPanel
        icon={Smartphone}
        title="WhatsApp Accounts"
        description="Select an account to configure its persona, company identity, delivery rules, and Cloud API settings."
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <MiniStat label="Total accounts" value={String(totalAccounts)} />
          <MiniStat label="Enabled" value={String(enabledAccounts)} />
          <MiniStat label="Cloud API ready" value={String(cloudAccounts)} />
        </div>
        <WhatsAppAccountGrid
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelect={setSelectedAccountId}
        />
      </SettingsPanel>

      <WhatsAppPricingPanel />

      {selectedAccount && accountForm && (
        <>
          <SettingsPanel
            icon={Shield}
            title={`Selected Account: ${selectedAccount.name}`}
            description="Quick status view for the active WhatsApp sender before you change deeper account settings."
            action={
              <div className="flex flex-wrap items-center gap-2">
                {selectedAccount.enabled ? (
                  <button
                    onClick={() => disableMutation.mutate(selectedAccount.id)}
                    disabled={disableMutation.isPending}
                    className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning-muted px-4 py-2 text-sm font-medium text-warning transition-colors disabled:opacity-50"
                  >
                    {disableMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PowerOff className="h-4 w-4" />
                    )}
                    Disable Account
                  </button>
                ) : (
                  <button
                    onClick={() => enableMutation.mutate(selectedAccount.id)}
                    disabled={enableMutation.isPending}
                    className="flex items-center gap-2 rounded-md border border-success/40 bg-success-muted px-4 py-2 text-sm font-medium text-success transition-colors disabled:opacity-50"
                  >
                    {enableMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Power className="h-4 w-4" />
                    )}
                    Enable Account
                  </button>
                )}
                <ActionButton
                  onClick={() => accountMutation.mutate()}
                  pending={accountMutation.isPending}
                  label="Save Account"
                />
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove "${selectedAccount.name}" and its routing from this workspace? This cannot be undone.`,
                      )
                    ) {
                      waDeleteMutation.mutate(selectedAccount.id)
                    }
                  }}
                  disabled={waDeleteMutation.isPending}
                  className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger-muted px-4 py-2 text-sm font-medium text-danger transition-colors disabled:opacity-50"
                >
                  {waDeleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Remove
                </button>
              </div>
            }
          >
            <div className="grid gap-4 lg:grid-cols-4">
              <StatCard
                icon={Smartphone}
                label="Connected Phone"
                value={selectedAccount.phone || 'Pending'}
              />
              <StatCard
                icon={CheckCircle2}
                label="Provider"
                value={selectedAccount.provider === 'aisensy' ? 'AiSensy' : 'Meta Cloud API'}
              />
              <StatCard icon={Clock} label="Status" value={selectedAccount.status || 'Unknown'} />
              <StatCard
                icon={Power}
                label="Sent Today"
                value={String(selectedAccount.messagesSentToday ?? 0)}
              />
            </div>
            <div className="rounded-md border border-border bg-surface-raised px-4 py-3 text-sm text-text-secondary">
              This account drives message delivery independently. Update its identity, limits, and
              connection mode here without affecting the rest of the workspace.
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SettingsField
                label="Account Name"
                value={accountForm.name}
                onChange={(v) => setAccountForm({ ...accountForm, name: v })}
              />
              <ReadOnlyField
                label="Connected Phone"
                value={selectedAccount.phone || 'No phone connected yet'}
              />
              {/* Runtime is no longer selectable — the unofficial Web JS
                  transport was removed and the official Cloud API is the only
                  way messages are sent. */}
              <ReadOnlyField label="Account Runtime" value="Official WhatsApp Cloud API" />
              <ReadOnlyField
                label="Created"
                value={formatDate(selectedAccount.createdAt, 'medium')}
              />
            </div>
          </SettingsPanel>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <SettingsPanel
              icon={Brain}
              title="Persona And Business Identity"
              description="These fields shape the voice, context, and positioning for messages sent from this specific WhatsApp account."
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SettingsField
                  label="Persona Name"
                  value={accountForm.personaName}
                  onChange={(v) => setAccountForm({ ...accountForm, personaName: v })}
                />
                <SettingsField
                  label="Persona Gender"
                  value={accountForm.personaGender}
                  onChange={(v) => setAccountForm({ ...accountForm, personaGender: v })}
                />
                <SettingsField
                  label="Persona Title"
                  value={accountForm.personaTitle}
                  onChange={(v) => setAccountForm({ ...accountForm, personaTitle: v })}
                />
                <SettingsField
                  label="Company Name"
                  value={accountForm.companyName}
                  onChange={(v) => setAccountForm({ ...accountForm, companyName: v })}
                />
                <SettingsField
                  label="Company City"
                  value={accountForm.companyCity}
                  onChange={(v) => setAccountForm({ ...accountForm, companyCity: v })}
                />
                <SettingsField
                  label="Industry"
                  value={accountForm.companyIndustry}
                  onChange={(v) => setAccountForm({ ...accountForm, companyIndustry: v })}
                />
                <SettingsField
                  label="Certifications"
                  value={accountForm.companyCerts}
                  onChange={(v) => setAccountForm({ ...accountForm, companyCerts: v })}
                />
              </div>

              <TextareaField
                label="Company USP"
                value={accountForm.companyUSP}
                onChange={(v) => setAccountForm({ ...accountForm, companyUSP: v })}
                rows={3}
              />
            </SettingsPanel>

            <SettingsPanel
              icon={Settings2}
              title="Delivery Rules"
              description="Sending limits and follow-up pacing apply to this account only, so different numbers can run with different risk profiles."
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SettingsField
                  label="Hourly Limit"
                  value={accountForm.hourlyLimit}
                  onChange={(v) => setAccountForm({ ...accountForm, hourlyLimit: v })}
                  type="number"
                />
                <SettingsField
                  label="Daily Limit"
                  value={accountForm.dailyLimit}
                  onChange={(v) => setAccountForm({ ...accountForm, dailyLimit: v })}
                  type="number"
                />
                <SettingsField
                  label="Max Follow-ups"
                  value={accountForm.maxFollowups}
                  onChange={(v) => setAccountForm({ ...accountForm, maxFollowups: v })}
                  type="number"
                />
                <SettingsField
                  label="Delays (minutes)"
                  value={accountForm.followupDelays}
                  onChange={(v) => setAccountForm({ ...accountForm, followupDelays: v })}
                  placeholder="0, 240, 1440, 2880, 4320"
                />
              </div>

              <div className="rounded-md border border-border bg-surface-raised p-4">
                <p className="text-sm font-medium">Scheduling note</p>
                <p className="mt-2 text-sm text-text-secondary">
                  Follow-up delays are stored as minutes after the initial outbound message. Use a
                  tighter schedule for warm leads and a wider schedule for accounts that need to
                  stay conservative.
                </p>
              </div>
            </SettingsPanel>
          </div>

          <div>
            <WhatsAppConnectionPanel
              account={selectedAccount}
              form={cloudForm}
              setForm={setCloudForm}
              saveMutation={cloudMutation}
              testMutation={testConnectionMutation}
            />
          </div>

        </>
      )}

      {!selectedAccount && (
        <SettingsPanel
          icon={Smartphone}
          title="No WhatsApp Accounts Found"
          description="Create or reconnect an account before account-level settings can be configured here."
        >
          <div className="rounded-md border border-dashed border-border bg-surface-raised/50 p-6 text-sm text-text-secondary">
            The page is now organized around per-account settings. Once an account exists, this area
            will expose its persona, company profile, sending rules, and WhatsApp connection.
          </div>
        </SettingsPanel>
      )}
    </div>
  )
}
