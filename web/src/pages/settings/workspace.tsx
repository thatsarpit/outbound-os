import { Building2, Globe, Mail, UserRound } from 'lucide-react'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { SettingsField } from '@/components/settings/settings-fields'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useWorkspaceConfig } from '@/hooks/use-workspace-config'

const GROUPS = [
  {
    icon: Building2,
    title: 'Business identity',
    description: 'Your workspace brand and the business context used in outreach.',
    fields: [
      ['DASHBOARD_BRAND_NAME', 'Dashboard brand'],
      ['BUSINESS_NAME', 'Business name'],
      ['BUSINESS_CITY', 'City'],
      ['BUSINESS_COUNTRY', 'Country'],
      ['BUSINESS_INDUSTRY', 'Industry'],
      ['BUSINESS_CERTIFICATIONS', 'Certifications'],
    ],
  },
  {
    icon: Globe,
    title: 'Regional preferences',
    description: 'Used for schedules, phone numbers and reporting.',
    fields: [
      ['BUSINESS_TIMEZONE', 'Time zone', 'Europe/London'],
      ['DEFAULT_COUNTRY_CODE', 'Country calling code', '44'],
      ['BUSINESS_CURRENCY', 'Reporting currency', 'GBP'],
    ],
  },
  {
    icon: Mail,
    title: 'Contact details & email signature',
    description: 'Public links and signature details used by your outreach templates.',
    fields: [
      ['BUSINESS_WEBSITE', 'Website', 'https://'],
      ['BUSINESS_CATALOGUE_URL', 'Product catalogue link', 'https://'],
      ['BUSINESS_WHATSAPP_NUMBER', 'WhatsApp contact number', 'Include the country code'],
      ['EMAIL_SIGNATURE_NAME', 'Email signature name'],
      ['EMAIL_FOOTER_NOTE', 'Email footer note'],
      ['BUSINESS_TAGLINE', 'Tagline'],
    ],
  },
  {
    icon: UserRound,
    title: 'Default sender identity',
    description: 'The name and role used in templates when an account has no identity of its own.',
    fields: [
      ['AI_PERSONA_NAME', 'Sender name'],
      ['AI_PERSONA_GENDER', 'Persona gender'],
      ['AI_PERSONA_TITLE', 'Job title', 'Sales representative'],
    ],
  },
] as const

export default function WorkspaceSettingsPage() {
  const {
    profile,
    profileLoading,
    profileError,
    refetchProfile,
    envForm,
    setEnvForm,
    envMutation,
  } = useWorkspaceConfig()
  const dirty =
    !!profile &&
    Object.keys({ ...profile, ...envForm }).some(
      (key) => (envForm[key] ?? '') !== (profile[key] ?? ''),
    )

  if (profileLoading) return <LoadingState variant="card" />
  if (profileError)
    return <ErrorState title="Could not load workspace settings" onRetry={() => refetchProfile()} />

  return (
    <div className="space-y-4">
      {GROUPS.map(({ icon, title, description, fields }) => (
        <SettingsPanel key={title} icon={icon} title={title} description={description}>
          <fieldset
            disabled={envMutation.isPending}
            className="grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-3"
          >
            {fields.map(([key, label, ...rest]) => (
              <SettingsField
                key={key}
                label={label}
                value={envForm[key] ?? ''}
                placeholder={rest[0]}
                onChange={(value) => setEnvForm((current) => ({ ...current, [key]: value }))}
              />
            ))}
          </fieldset>
        </SettingsPanel>
      ))}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-strong bg-surface px-4 py-3 shadow-lg">
        <p role="status" className="text-xs text-text-secondary">
          {envMutation.isPending
            ? 'Saving workspace…'
            : dirty
              ? 'You have unsaved changes.'
              : 'All changes saved.'}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!dirty || envMutation.isPending}
            onClick={() => setEnvForm({ ...profile })}
          >
            Discard changes
          </Button>
          <Button
            size="sm"
            disabled={!dirty || !profile}
            pending={envMutation.isPending}
            onClick={() => envMutation.mutate(envForm)}
          >
            Save workspace
          </Button>
        </div>
      </div>
    </div>
  )
}
