import {
  AlertTriangle,
  Brain,
  Loader2,
  Mail,
  Shield,
  CheckCircle2,
  Clock,
  Power,
} from 'lucide-react'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { ActionButton } from '@/components/settings/settings-action-button'
import { MiniStat, StatCard } from '@/components/settings/settings-stats'
import { SettingsField, SelectField, TextareaField } from '@/components/settings/settings-fields'
import { cn } from '@/lib/utils'
import { useEmailAccounts } from '@/hooks/use-email-accounts'
import { useWhatsAppAccounts } from '@/hooks/use-whatsapp-accounts'

export default function EmailSettingsPage() {
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
