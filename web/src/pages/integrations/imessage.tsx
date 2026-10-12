import { useQuery } from '@tanstack/react-query'
import { inboxApi } from '@/api/endpoints/inbox'
import { useAuthStore } from '@/stores/auth-store'
import IMessageSettingsPage from '@/pages/settings/imessage'

export default function IMessageIntegrationPage() {
  const canConfigure = useAuthStore((state) => state.hasCapability('page.settings'))
  const { data: health } = useQuery({
    queryKey: ['inbox-channel-health'],
    queryFn: () => inboxApi.channelHealth(),
  })
  if (canConfigure) return <IMessageSettingsPage />
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">iMessage connection</h2>
      <p className="mt-2 text-sm text-text-secondary">
        {health?.imessage.detail || 'Checking connection…'}
      </p>
      <p className="mt-3 text-xs text-text-muted">
        A workspace administrator can manage BlueBubbles servers and credentials.
      </p>
    </div>
  )
}
