import { Cloud, ExternalLink } from 'lucide-react'
import type { UseMutationResult } from '@tanstack/react-query'
import type { WhatsAppAccount, WhatsAppProvider } from '@/api/types'
import type { CloudFormState } from '@/hooks/use-whatsapp-accounts'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { ActionButton } from '@/components/settings/settings-action-button'
import { SettingsField } from '@/components/settings/settings-fields'
import { cn } from '@/lib/utils'

const PROVIDERS: Array<{ id: WhatsAppProvider; name: string; summary: string }> = [
  {
    id: 'meta',
    name: 'Meta Cloud API',
    summary: 'Connect your number directly to Meta. Free to set up, no middleman.',
  },
  {
    id: 'aisensy',
    name: 'AiSensy',
    summary: 'Use a number you already manage through AiSensy.',
  },
]

function StatusChip({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-xs',
        ok
          ? 'border-success/30 bg-success-muted text-success'
          : 'border-warning/30 bg-warning-muted text-warning',
      )}
    >
      {label}: {detail}
    </div>
  )
}

/**
 * Where an account's WhatsApp messages go out from. Meta's own Cloud API is
 * the default; AiSensy stays available for numbers already set up there.
 * Secret fields always start empty — leaving one blank keeps the saved value.
 */
export function WhatsAppConnectionPanel({
  account,
  form,
  setForm,
  saveMutation,
  testMutation,
}: {
  account: WhatsAppAccount
  form: CloudFormState
  setForm: (next: CloudFormState) => void
  saveMutation: UseMutationResult<unknown, Error, void, unknown>
  testMutation: UseMutationResult<unknown, Error, void, unknown>
}) {
  const savedProvider: WhatsAppProvider = account.provider === 'aisensy' ? 'aisensy' : 'meta'
  const switching = form.provider !== savedProvider
  const webhookUrl =
    typeof window === 'undefined' ? '/webhook/meta' : `${window.location.origin}/webhook/meta`

  return (
    <SettingsPanel
      icon={Cloud}
      title="WhatsApp connection"
      description="Choose who delivers this number's messages, then add its credentials."
      footer={
        <div className="flex flex-wrap gap-2">
          <ActionButton
            onClick={() => saveMutation.mutate()}
            pending={saveMutation.isPending}
            label="Save connection"
          />
          <ActionButton
            onClick={() => testMutation.mutate()}
            pending={testMutation.isPending}
            label="Test connection"
            secondary
          />
        </div>
      }
    >
      <div className="grid gap-5">
        <div role="radiogroup" aria-label="WhatsApp provider" className="grid gap-3 sm:grid-cols-2">
          {PROVIDERS.map((provider) => {
            const selected = form.provider === provider.id
            return (
              <button
                key={provider.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setForm({ ...form, provider: provider.id })}
                className={cn(
                  'rounded-md border p-3 text-left transition-colors',
                  selected
                    ? 'border-accent bg-accent/8 ring-1 ring-accent'
                    : 'border-border hover:border-border-strong',
                )}
              >
                <span className="block text-sm font-semibold text-text-primary">
                  {provider.name}
                  {provider.id === 'meta' && (
                    <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                      Recommended
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs leading-5 text-text-secondary">
                  {provider.summary}
                </span>
              </button>
            )
          })}
        </div>

        {switching && (
          <p className="rounded-md border border-warning/30 bg-warning-muted px-3 py-2 text-xs text-warning">
            Saving switches this number to {form.provider === 'meta' ? 'Meta' : 'AiSensy'}. Campaign
            template names must match templates approved there.
          </p>
        )}

        {form.provider === 'meta' ? (
          <div className="grid gap-4">
            <SettingsField
              label="Phone number ID"
              value={form.metaPhoneNumberId}
              onChange={(v) => setForm({ ...form, metaPhoneNumberId: v })}
              placeholder="Meta app → WhatsApp → API Setup → Phone number ID"
            />
            <SettingsField
              label="Access token"
              value={form.metaAccessToken}
              onChange={(v) => setForm({ ...form, metaAccessToken: v })}
              type="password"
              placeholder={
                account.metaConfigured
                  ? 'Token saved; paste a new one only to replace it'
                  : 'A permanent System User token with whatsapp_business_messaging'
              }
            />
            <SettingsField
              label="First-contact template"
              value={form.defaultCampaignName}
              onChange={(v) => setForm({ ...form, defaultCampaignName: v })}
              placeholder="Name of an approved template, e.g. new_enquiry"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SettingsField
                label="WhatsApp Business Account ID (optional)"
                value={form.metaWabaId}
                onChange={(v) => setForm({ ...form, metaWabaId: v })}
                placeholder="Used to list approved templates"
              />
              <SettingsField
                label="Template language"
                value={form.templateLanguage}
                onChange={(v) => setForm({ ...form, templateLanguage: v })}
                placeholder="en, en_US, hi…"
              />
            </div>
            <StatusChip
              ok={Boolean(!switching && account.metaConfigured)}
              label="Sending"
              detail={
                !switching && account.metaConfigured
                  ? 'credentials saved — use Test connection to confirm'
                  : 'needs phone number ID and token'
              }
            />
            <div className="rounded-md border border-border bg-surface-raised/50 p-3 text-xs leading-5 text-text-secondary">
              <p className="font-medium text-text-primary">To receive replies</p>
              <p className="mt-1">
                In your Meta app open WhatsApp → Configuration → Webhook. Use callback URL{' '}
                <code className="break-all rounded bg-surface px-1 py-0.5 text-text-primary">
                  {webhookUrl}
                </code>{' '}
                and the verify token from your server&rsquo;s{' '}
                <code className="rounded bg-surface px-1 py-0.5">META_WEBHOOK_VERIFY_TOKEN</code>,
                then subscribe to <strong>messages</strong>. The server also needs{' '}
                <code className="rounded bg-surface px-1 py-0.5">META_APP_SECRET</code> to accept
                them. If the dashboard runs on a different address than the API, use the API&rsquo;s
                address instead.
              </p>
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 font-medium text-accent hover:underline"
              >
                Meta&rsquo;s setup guide <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <SettingsField
              label="API Campaign key"
              value={form.aisensyCampaignApiKey}
              onChange={(v) => setForm({ ...form, aisensyCampaignApiKey: v })}
              type="password"
              placeholder={
                account.campaignApiConfigured
                  ? 'Key saved; paste a new one only to replace it'
                  : 'AiSensy → Manage → API Key'
              }
            />
            <SettingsField
              label="First-contact campaign"
              value={form.defaultCampaignName}
              onChange={(v) => setForm({ ...form, defaultCampaignName: v })}
              placeholder="An AiSensy API campaign name"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SettingsField
                label="Project ID (optional)"
                value={form.aisensyProjectId}
                onChange={(v) => setForm({ ...form, aisensyProjectId: v })}
                placeholder="For free-text replies"
              />
              <SettingsField
                label="Project API password (optional)"
                value={form.aisensyApiKey}
                onChange={(v) => setForm({ ...form, aisensyApiKey: v })}
                type="password"
                placeholder={
                  account.projectApiConfigured ? 'Saved; paste only to replace' : 'Pro plan only'
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatusChip
                ok={Boolean(!switching && account.campaignApiConfigured)}
                label="Templates"
                detail={!switching && account.campaignApiConfigured ? 'ready' : 'needs campaign key'}
              />
              <StatusChip
                ok={Boolean(!switching && account.projectApiConfigured)}
                label="Free-text replies"
                detail={!switching && account.projectApiConfigured ? 'ready' : 'needs Project API'}
              />
            </div>
          </div>
        )}
      </div>
    </SettingsPanel>
  )
}
