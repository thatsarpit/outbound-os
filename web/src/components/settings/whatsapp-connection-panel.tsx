import { Cloud, ExternalLink } from 'lucide-react'
import type { UseMutationResult } from '@tanstack/react-query'
import type { WhatsAppAccount } from '@/api/types'
import type { CloudFormState } from '@/hooks/use-whatsapp-accounts'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { ActionButton } from '@/components/settings/settings-action-button'
import { SettingsField } from '@/components/settings/settings-fields'
import { cn } from '@/lib/utils'

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
 * Connect a WhatsApp number directly to Meta's official Cloud API.
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
  const webhookUrl =
    typeof window === 'undefined' ? '/webhook/meta' : `${window.location.origin}/webhook/meta`

  return (
    <SettingsPanel
      icon={Cloud}
      title="WhatsApp connection"
      description="Connect your number directly to Meta with its phone number ID and access token."
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
            ok={Boolean(account.metaConfigured)}
            label="Sending"
            detail={
              account.metaConfigured
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
      </div>
    </SettingsPanel>
  )
}
