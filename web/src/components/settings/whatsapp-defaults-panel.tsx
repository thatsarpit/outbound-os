import { Settings2 } from 'lucide-react'
import { SettingsPanel } from './settings-panel'
import { SettingsField, ToggleField } from './settings-fields'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useWorkspaceConfig } from '@/hooks/use-workspace-config'

export function WhatsAppDefaultsPanel() {
  const { configLoading, configError, refetchConfig, configForm, setConfigForm, configMutation } =
    useWorkspaceConfig()
  if (configLoading) return <LoadingState variant="card" />
  if (configError)
    return <ErrorState title="Could not load WhatsApp defaults" onRetry={() => refetchConfig()} />
  return (
    <SettingsPanel
      icon={Settings2}
      title="Workspace delivery defaults"
      description="Shared WhatsApp limits. Individual account settings take precedence."
      footer={
        <Button
          size="sm"
          pending={configMutation.isPending}
          onClick={() => configMutation.mutate(configForm)}
        >
          Save WhatsApp defaults
        </Button>
      }
    >
      <fieldset disabled={configMutation.isPending} className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ['WA_DAILY_LIMIT', 'Daily message limit'],
            ['WA_MIN_DELAY', 'Minimum delay (seconds)'],
            ['WA_MAX_DELAY', 'Maximum delay (seconds)'],
          ] as const
        ).map(([key, label]) => (
          <SettingsField
            key={key}
            label={label}
            type="number"
            value={configForm[key] ?? ''}
            onChange={(value) => setConfigForm((current) => ({ ...current, [key]: value }))}
          />
        ))}
      </fieldset>
      <ToggleField
        label="Warmup mode"
        description="Increase sending volume gradually instead of using the full daily limit immediately."
        checked={configForm.WARMUP_MODE === 'true'}
        onChange={(checked) =>
          setConfigForm((current) => ({ ...current, WARMUP_MODE: String(checked) }))
        }
      />
    </SettingsPanel>
  )
}
