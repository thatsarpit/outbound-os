import { Building2, Loader2, Settings2, UserRound } from 'lucide-react'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { ActionButton } from '@/components/settings/settings-action-button'
import { SettingsField, ToggleField } from '@/components/settings/settings-fields'
import { useWorkspaceConfig } from '@/hooks/use-workspace-config'

export default function WorkspaceSettingsPage() {
  const {
    configLoading,
    brandLoading,
    envForm,
    setEnvForm,
    configForm,
    setConfigForm,
    envMutation,
    configMutation,
  } = useWorkspaceConfig()

  if (configLoading || brandLoading) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    )
  }

  return (
    <>
      <SettingsPanel
        icon={Building2}
        title="Workspace Identity"
        description="Branding and business context used across login, navigation, and outreach templates."
        footer={
          <ActionButton
            onClick={() => envMutation.mutate(envForm)}
            pending={envMutation.isPending}
            label="Save workspace"
          />
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SettingsField
            label="Dashboard Brand"
            value={envForm.DASHBOARD_BRAND_NAME || ''}
            onChange={(v) => setEnvForm({ ...envForm, DASHBOARD_BRAND_NAME: v })}
          />
          <SettingsField
            label="Business Name"
            value={envForm.BUSINESS_NAME || ''}
            onChange={(v) => setEnvForm({ ...envForm, BUSINESS_NAME: v })}
          />
          <SettingsField
            label="City"
            value={envForm.BUSINESS_CITY || ''}
            onChange={(v) => setEnvForm({ ...envForm, BUSINESS_CITY: v })}
          />
          <SettingsField
            label="Country"
            value={envForm.BUSINESS_COUNTRY || ''}
            onChange={(v) => setEnvForm({ ...envForm, BUSINESS_COUNTRY: v })}
          />
          <SettingsField
            label="Industry"
            value={envForm.BUSINESS_INDUSTRY || ''}
            onChange={(v) => setEnvForm({ ...envForm, BUSINESS_INDUSTRY: v })}
          />
          <SettingsField
            label="Certifications"
            value={envForm.BUSINESS_CERTIFICATIONS || ''}
            onChange={(v) => setEnvForm({ ...envForm, BUSINESS_CERTIFICATIONS: v })}
          />
        </div>
      </SettingsPanel>

      <SettingsPanel
        icon={UserRound}
        title="Default sender identity"
        description="Who messages are signed as when a WhatsApp account does not set its own. Used by email and message templates."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SettingsField
            label="Persona Name"
            value={envForm.AI_PERSONA_NAME || ''}
            onChange={(v) => setEnvForm({ ...envForm, AI_PERSONA_NAME: v })}
            placeholder="Kavya"
          />
          <SettingsField
            label="Gender"
            value={envForm.AI_PERSONA_GENDER || ''}
            onChange={(v) => setEnvForm({ ...envForm, AI_PERSONA_GENDER: v })}
            placeholder="female"
          />
          <SettingsField
            label="Title"
            value={envForm.AI_PERSONA_TITLE || ''}
            onChange={(v) => setEnvForm({ ...envForm, AI_PERSONA_TITLE: v })}
            placeholder="sales representative"
          />
        </div>
      </SettingsPanel>

      <SettingsPanel
        icon={Settings2}
        title="Global WhatsApp Defaults"
        description="Account-level settings below take precedence. Use these as safe system-wide defaults."
        footer={
          <ActionButton
            onClick={() => configMutation.mutate(configForm)}
            pending={configMutation.isPending}
            label="Save defaults"
            secondary
          />
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SettingsField
            label="Daily Limit"
            value={configForm.WA_DAILY_LIMIT || ''}
            onChange={(v) => setConfigForm({ ...configForm, WA_DAILY_LIMIT: v })}
            type="number"
          />
          <SettingsField
            label="Min Delay (sec)"
            value={configForm.WA_MIN_DELAY || ''}
            onChange={(v) => setConfigForm({ ...configForm, WA_MIN_DELAY: v })}
            type="number"
          />
          <SettingsField
            label="Max Delay (sec)"
            value={configForm.WA_MAX_DELAY || ''}
            onChange={(v) => setConfigForm({ ...configForm, WA_MAX_DELAY: v })}
            type="number"
          />
        </div>
        <ToggleField
          label="Warmup Mode"
          description="Gradually ramps sending volume instead of using the full daily limit immediately."
          checked={configForm.WARMUP_MODE === 'true'}
          onChange={(checked) => setConfigForm({ ...configForm, WARMUP_MODE: String(checked) })}
        />
        <div className="rounded-md border border-dashed border-border bg-surface-raised/60 p-4 text-sm text-text-secondary">
          These settings are shared across WhatsApp accounts unless a specific account overrides
          them. Keep these values conservative enough for every sender profile in the workspace.
        </div>
      </SettingsPanel>
    </>
  )
}
