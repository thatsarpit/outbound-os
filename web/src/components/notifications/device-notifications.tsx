import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bell, BellOff, Monitor, Smartphone, Trash2 } from 'lucide-react'
import { api, apiFetch } from '@/api/client'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { SectionCard } from '@/components/ui/section-card'
import { pushApplicationKey } from '@/lib/device-push'
import { IS_DEMO } from '@/demo/demo-chrome'

type NotificationDevice = {
  id: number
  label: string
  registeredAt: string
  enabled: boolean
  needsReconnect: boolean
}
type CurrentDevice = { subscription: PushSubscription | null; id: number | null }

function suggestedDeviceName() {
  const agent = navigator.userAgent
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Firefox|FxiOS/.test(agent)
      ? 'Firefox'
      : /Chrome|CriOS/.test(agent)
        ? 'Chrome'
        : /Safari/.test(agent)
          ? 'Safari'
          : 'Browser'
  const device = /iPhone/.test(agent)
    ? 'iPhone'
    : /iPad/.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      ? 'iPad'
      : /Android/.test(agent)
        ? 'Android'
        : /Mac/.test(agent)
          ? 'Mac'
          : /Windows/.test(agent)
            ? 'Windows'
            : 'this device'
  return `${browser} on ${device}`
}

export function DeviceNotifications() {
  const scope = useAuthStore((state) => state.dashboardScope)
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<string | number | null>(null)
  const [feedback, setFeedback] = useState('')
  const [removeDevice, setRemoveDevice] = useState<NotificationDevice | null>(null)
  const [deviceLabel, setDeviceLabel] = useState(suggestedDeviceName)
  const supported =
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  const iphone =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  const config = useQuery({
    queryKey: ['push-config', scope],
    queryFn: () => api.get<{ enabled: boolean; publicKey: string | null }>('/push/config'),
    enabled: !IS_DEMO,
    staleTime: 60_000,
    meta: { silent: true },
  })
  const devices = useQuery({
    queryKey: ['push-devices', scope],
    queryFn: () => api.get<{ devices: NotificationDevice[]; limit: number }>('/push/subscriptions'),
    enabled: !IS_DEMO,
    staleTime: 30_000,
    meta: { silent: true },
  })
  const current = useQuery({
    queryKey: ['push-current-device', scope],
    queryFn: async (): Promise<CurrentDevice> => {
      const registration = await navigator.serviceWorker.register(
        `/push-sw.js?v=${__PUSH_WORKER_VERSION__}`,
        { scope: '/', updateViaCache: 'none' },
      )
      const existing = await registration.pushManager.getSubscription()
      if (!existing) return { subscription: null, id: null }
      const state = await api.post<{ enabled: boolean; deviceId: number | null }>('/push/status', {
        endpoint: existing.endpoint,
      })
      if (!state?.enabled) {
        await existing.unsubscribe()
        return { subscription: null, id: null }
      }
      return { subscription: existing, id: state.deviceId }
    },
    enabled: supported && (!iphone || installed) && !IS_DEMO,
    staleTime: 30_000,
    retry: false,
    meta: { silent: true },
  })
  const subscription = current.data?.subscription
  const deviceList = devices.data?.devices ?? []
  const busy = pending !== null

  async function reloadDevices() {
    await queryClient.invalidateQueries({ queryKey: ['push-devices', scope] })
  }
  function setCurrent(value: CurrentDevice) {
    queryClient.setQueryData(['push-current-device', scope], value)
  }

  async function enable() {
    setPending('enable')
    setFeedback('')
    try {
      // iOS requires this call directly from the button gesture, before network awaits.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted')
        throw new Error(
          'Notifications are blocked. Allow Outbound OS in your device’s notification settings, then try again.',
        )
      if (!config.data?.publicKey)
        throw new Error('The server is not configured for notifications yet.')
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      const device =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: pushApplicationKey(config.data.publicKey),
        }))
      try {
        const saved = await api.post<{ enabled: boolean; deviceId: number }>(
          '/push/subscriptions',
          {
            ...device.toJSON(),
            deviceLabel,
          },
        )
        if (!saved?.enabled) throw new Error('The notification device was not saved. Try again.')
        setCurrent({ subscription: device, id: saved.deviceId })
      } catch (error) {
        await device.unsubscribe()
        throw error
      }
      await reloadDevices()
      setFeedback(
        'Enabled on this device. New customer alerts keep message text off your Lock Screen.',
      )
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not enable notifications.')
    } finally {
      setPending(null)
    }
  }
  async function disable() {
    if (!subscription) return
    setPending('disable')
    setFeedback('')
    try {
      await apiFetch('/push/subscriptions', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
      await subscription.unsubscribe()
      setCurrent({ subscription: null, id: null })
      await reloadDevices()
      setFeedback('Notifications are off on this device.')
    } catch {
      setFeedback('Could not disable notifications. Check your connection and try again.')
    } finally {
      setPending(null)
    }
  }
  async function remove() {
    if (!removeDevice) return
    setPending(removeDevice.id)
    setFeedback('')
    try {
      await api.delete(`/push/subscriptions/${removeDevice.id}`)
      if (current.data?.id === removeDevice.id) {
        await subscription?.unsubscribe()
        setCurrent({ subscription: null, id: null })
      }
      await reloadDevices()
      setFeedback(
        `Notifications removed for ${removeDevice.label}. Its sign-in session is unchanged.`,
      )
      setRemoveDevice(null)
    } catch {
      setFeedback('Could not remove that device. Check your connection and try again.')
    } finally {
      setPending(null)
    }
  }
  async function test() {
    if (!subscription) return
    setPending('test')
    setFeedback('')
    try {
      await api.post('/push/test', { endpoint: subscription.endpoint })
      setFeedback('Test accepted by the push provider. Focus settings may silence its banner.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not send a test notification.')
    } finally {
      setPending(null)
    }
  }

  return (
    <SectionCard
      title="Notifications"
      description="Customer message alerts on your signed-in devices."
    >
      <div className="space-y-5">
        {IS_DEMO ? (
          <p className="text-sm text-text-secondary">
            Notifications are available in your connected workspace. This preview does not register
            your device.
          </p>
        ) : (
          <>
            <div className="space-y-3">
              <h3 className="text-[13px] font-medium">This device</h3>
              {iphone && !installed ? (
                <p className="text-[13px] leading-6 text-text-secondary">
                  Add Outbound OS to your Home Screen, open its icon, then enable notifications
                  here.{' '}
                  <Link to="/m/install" className="text-focus underline">
                    Install instructions
                  </Link>
                </p>
              ) : !supported ? (
                <p className="text-[13px] leading-6 text-text-secondary">
                  This browser cannot receive Web Push. On iPhone, use iOS 16.4 or later and open
                  the Home Screen app.
                </p>
              ) : config.isPending || current.isPending ? (
                <p role="status" className="text-[13px] text-text-muted">
                  Checking this device…
                </p>
              ) : config.error || current.error ? (
                <div className="space-y-2">
                  <p className="text-[13px] text-text-secondary">
                    This device’s notification status could not be checked.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void config.refetch()
                      void current.refetch()
                    }}
                  >
                    Try again
                  </Button>
                </div>
              ) : !config.data?.enabled ? (
                <p className="text-[13px] text-text-secondary">
                  Your administrator needs to configure the server’s push keys.
                </p>
              ) : (
                <>
                  <p className="text-[13px] text-text-secondary">
                    {subscription
                      ? 'Customer message alerts are enabled here.'
                      : 'Receive alerts when the app is closed. Message previews stay private.'}
                  </p>
                  {!subscription && (
                    <label className="block max-w-sm text-xs text-text-secondary">
                      Device name
                      <input
                        className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary focus:outline-none focus:ring-2 focus:ring-focus sm:text-sm"
                        maxLength={64}
                        value={deviceLabel}
                        onChange={(event) => setDeviceLabel(event.target.value)}
                        disabled={busy}
                      />
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {subscription ? (
                      <>
                        <Button
                          variant="secondary"
                          disabled={busy}
                          pending={pending === 'test'}
                          pendingLabel="Sending test…"
                          onClick={() => void test()}
                          leftIcon={<Bell aria-hidden="true" className="h-4 w-4" />}
                        >
                          Send test
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          pending={pending === 'disable'}
                          pendingLabel="Disabling…"
                          onClick={() => void disable()}
                          leftIcon={<BellOff aria-hidden="true" className="h-4 w-4" />}
                        >
                          Disable here
                        </Button>
                      </>
                    ) : (
                      <Button
                        disabled={busy || !deviceLabel.trim()}
                        pending={pending === 'enable'}
                        pendingLabel="Enabling…"
                        onClick={() => void enable()}
                        leftIcon={<Bell aria-hidden="true" className="h-4 w-4" />}
                      >
                        Enable notifications
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="border-t border-border pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[13px] font-medium">Notification devices</h3>
                {Boolean(devices.data) && (
                  <span className="text-xs text-text-muted">
                    {deviceList.length} of {devices.data?.limit}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                Remove an old device to stop future alerts. This does not sign it out.
              </p>
              {devices.isPending ? (
                <p role="status" className="mt-3 text-xs text-text-muted">
                  Loading devices…
                </p>
              ) : devices.error ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-text-secondary">
                    Notification devices could not be loaded.
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => void devices.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : deviceList.length === 0 ? (
                <p className="mt-3 text-[13px] text-text-secondary">No devices registered yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {deviceList.map((device) => {
                    const here = current.data?.id === device.id
                    const registered = new Date(device.registeredAt)
                    const Icon = /iPhone|iPad|Android/i.test(device.label) ? Smartphone : Monitor
                    return (
                      <li key={device.id} className="flex items-start gap-3 py-3">
                        <Icon
                          aria-hidden="true"
                          className="mt-1 h-4 w-4 shrink-0 text-text-muted"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-[13px] font-medium">
                            {device.label}
                            {here && (
                              <span className="ml-2 text-xs font-normal text-text-muted">
                                This device
                              </span>
                            )}
                          </p>
                          <p className="mt-1 text-xs text-text-muted">
                            {device.needsReconnect
                              ? 'Enable again on that device to reconnect'
                              : device.enabled
                                ? 'Alerts enabled'
                                : 'Alerts off'}
                            {Number.isFinite(registered.getTime()) &&
                              ` · Added ${registered.toLocaleDateString()}`}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setRemoveDevice(device)}
                          aria-label={`Remove notifications for ${device.label}`}
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                          <span className="hidden sm:inline">Remove</span>
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <p className="text-xs leading-5 text-text-muted">
              New WhatsApp, email, iMessage and Telegram messages are checked every 30 seconds after
              reaching the CRM. Mailbox sync can add delay. Your device’s Focus, sound and
              notification settings still apply.
            </p>
          </>
        )}
        {feedback && (
          <p role="status" className="text-[13px] leading-6 text-text-secondary">
            {feedback}
          </p>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(removeDevice)}
        onOpenChange={(open) => {
          if (!busy && !open) setRemoveDevice(null)
        }}
        title="Remove notification device?"
        description={`Future alerts will stop for ${removeDevice?.label ?? 'this device'}. Its sign-in session will stay active.`}
        confirmLabel="Remove device"
        destructive
        isLoading={typeof pending === 'number'}
        onConfirm={remove}
      />
    </SectionCard>
  )
}
