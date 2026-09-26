import {
  Cloud,
  Clock,
  MessageSquare,
  Power,
  RefreshCw,
  Shield,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Button, SwitchField } from '@/components/ui'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { ActionButton } from '@/components/settings/settings-action-button'
import { StatCard, MiniStat } from '@/components/settings/settings-stats'
import { SettingsField } from '@/components/settings/settings-fields'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format-date'
import { useIMessageAccounts } from '@/hooks/use-imessage-accounts'

export default function IMessageSettingsPage() {
  const {
    imessageAccounts,
    selectedIMessageAccountId,
    setSelectedIMessageAccountId,
    selectedIMessageAccount,
    showAddIMessage,
    setShowAddIMessage,
    imessageForm,
    setIMessageForm,
    emptyIMessageForm,
    imessageCreateMutation,
    imessageUpdateMutation,
    imessageDeleteMutation,
    imessagePingMutation,
  } = useIMessageAccounts()

  return (
    <div className="space-y-6">
      <SettingsPanel
        icon={MessageSquare}
        title="iMessage servers (BlueBubbles)"
        description="Each Mac running BlueBubbles becomes one iMessage outbound account. Configure server URL + password; we'll ping every 5 minutes and refuse to send when offline."
        action={
          <Button
            type="button"
            onClick={() => {
              setShowAddIMessage(true)
              setIMessageForm(emptyIMessageForm)
              setSelectedIMessageAccountId(null)
            }}
          >
            <MessageSquare className="h-4 w-4" />
            <span>Add server</span>
          </Button>
        }
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <MiniStat label="Total servers" value={String(imessageAccounts.length)} />
          <MiniStat
            label="Online"
            value={String(imessageAccounts.filter((a) => a.status === 'online').length)}
          />
          <MiniStat
            label="Sent today"
            value={String(imessageAccounts.reduce((sum, a) => sum + (a.sentToday || 0), 0))}
          />
        </div>

        {imessageAccounts.length === 0 && !showAddIMessage ? (
          <div className="rounded-md border border-dashed border-border bg-surface-raised/50 p-6 text-sm text-text-secondary">
            No iMessage servers configured yet. Click <strong>Add server</strong> above to wire up a
            BlueBubbles-backed Mac.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {imessageAccounts.map((acc) => {
              const active = acc.id === selectedIMessageAccountId
              return (
                <button
                  key={acc.id}
                  onClick={() => {
                    setSelectedIMessageAccountId(acc.id)
                    setShowAddIMessage(false)
                  }}
                  className={cn(
                    'rounded-md border p-4 text-left transition-all',
                    active
                      ? 'border-accent bg-accent-muted/30'
                      : 'border-border bg-surface hover:border-accent/30 hover:bg-surface-raised',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{acc.name}</p>
                      <p className="mt-1 truncate text-xs text-text-muted">{acc.serverUrl}</p>
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                        acc.status === 'online'
                          ? 'bg-success-muted text-success'
                          : acc.status === 'offline'
                            ? 'bg-danger-muted text-danger'
                            : 'bg-surface-raised text-text-muted',
                      )}
                    >
                      {acc.status === 'online' ? (
                        <Wifi className="h-3 w-3" />
                      ) : acc.status === 'offline' ? (
                        <WifiOff className="h-3 w-3" />
                      ) : null}
                      {acc.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-surface-raised px-2 py-1 text-text-muted">
                      {acc.sentToday ?? 0} sent today
                    </span>
                    <span className="rounded-full bg-surface-raised px-2 py-1 text-text-muted">
                      {acc.hourlyLimit}/hr · {acc.dailyLimit}/day
                    </span>
                    {!acc.enabled && (
                      <span className="rounded-full bg-warning-muted px-2 py-1 text-warning">
                        Disabled
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </SettingsPanel>

      {(showAddIMessage || selectedIMessageAccount) && (
        <SettingsPanel
          icon={Shield}
          title={
            showAddIMessage
              ? 'Add a BlueBubbles server'
              : `Selected: ${selectedIMessageAccount?.name}`
          }
          description={
            showAddIMessage
              ? "Enter your Mac's BlueBubbles server URL and password. The password is AES-256-GCM encrypted before storage."
              : 'Update server URL or rotate the password (leave blank to keep the current encrypted value).'
          }
          action={
            showAddIMessage ? (
              <ActionButton
                onClick={() => imessageCreateMutation.mutate()}
                pending={imessageCreateMutation.isPending}
                label="Add server"
              />
            ) : (
              <ActionButton
                onClick={() => imessageUpdateMutation.mutate()}
                pending={imessageUpdateMutation.isPending}
                label="Save changes"
              />
            )
          }
        >
          {selectedIMessageAccount && !showAddIMessage && (
            <div className="grid gap-4 lg:grid-cols-4">
              <StatCard icon={Cloud} label="Server URL" value={selectedIMessageAccount.serverUrl} />
              <StatCard
                icon={selectedIMessageAccount.status === 'online' ? Wifi : WifiOff}
                label="Status"
                value={selectedIMessageAccount.status}
              />
              <StatCard
                icon={Clock}
                label="Last ping"
                value={
                  selectedIMessageAccount.lastPingAt
                    ? formatDate(selectedIMessageAccount.lastPingAt, 'relative')
                    : 'never'
                }
              />
              <StatCard
                icon={Power}
                label="Sent today"
                value={String(selectedIMessageAccount.sentToday ?? 0)}
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SettingsField
              label="Server name"
              value={imessageForm.name}
              onChange={(v) => setIMessageForm({ ...imessageForm, name: v })}
              placeholder='e.g. "Mac Mini Office"'
            />
            <SettingsField
              label="BlueBubbles URL"
              value={imessageForm.serverUrl}
              onChange={(v) => setIMessageForm({ ...imessageForm, serverUrl: v })}
              placeholder="https://imessage.example.com"
            />
            <SettingsField
              label={showAddIMessage ? 'BlueBubbles password' : 'Rotate password (optional)'}
              value={imessageForm.password}
              onChange={(v) => setIMessageForm({ ...imessageForm, password: v })}
              type="password"
              placeholder={showAddIMessage ? 'Required' : 'Leave blank to keep current'}
            />
            <SettingsField
              label="Apple ID (reference only)"
              value={imessageForm.appleId}
              onChange={(v) => setIMessageForm({ ...imessageForm, appleId: v })}
              placeholder="apple-id@icloud.com"
            />
            <SettingsField
              label="Hourly limit"
              value={imessageForm.hourlyLimit}
              onChange={(v) => setIMessageForm({ ...imessageForm, hourlyLimit: v })}
              type="number"
            />
            <SettingsField
              label="Daily limit"
              value={imessageForm.dailyLimit}
              onChange={(v) => setIMessageForm({ ...imessageForm, dailyLimit: v })}
              type="number"
            />
          </div>

          <SwitchField
            label="Enabled"
            description="Disable to take this server out of the round-robin without removing it."
            checked={imessageForm.enabled}
            onCheckedChange={(v: boolean) => setIMessageForm({ ...imessageForm, enabled: v })}
          />

          {selectedIMessageAccount && !showAddIMessage && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => imessagePingMutation.mutate(selectedIMessageAccount.id)}
                pending={imessagePingMutation.isPending}
                pendingLabel="Pinging…"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Ping server</span>
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (confirm(`Remove "${selectedIMessageAccount.name}"? This cannot be undone.`)) {
                    imessageDeleteMutation.mutate(selectedIMessageAccount.id)
                  }
                }}
                pending={imessageDeleteMutation.isPending}
                pendingLabel="Removing…"
              >
                <Trash2 className="h-4 w-4" />
                <span>Remove server</span>
              </Button>
            </div>
          )}
        </SettingsPanel>
      )}
    </div>
  )
}
