import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bell, BellOff, Smartphone } from 'lucide-react'
import { api, apiFetch } from '@/api/client'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/ui/section-card'
import { pushApplicationKey } from '@/lib/device-push'
import { IS_DEMO } from '@/demo/demo-chrome'

export function DeviceNotifications() {
  const scope = useAuthStore((state) => state.dashboardScope)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const supported =
    typeof window !== 'undefined' &&
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
    enabled: supported && !IS_DEMO,
    meta: { silent: true },
  })
  useEffect(() => {
    if (!supported || IS_DEMO) return
    let mounted = true
    void navigator.serviceWorker
      .register('/push-sw.js', { scope: '/' })
      .then(async (registration) => {
        const existing = await registration.pushManager.getSubscription()
        if (existing) {
          const state = await api.post<{ enabled: boolean }>('/push/status', {
            endpoint: existing.endpoint,
          })
          if (!state?.enabled) {
            await existing.unsubscribe()
            return
          }
        }
        if (mounted) setSubscription(existing)
      })
      .catch(() => {
        if (mounted) setFeedback('Could not set up notifications. Reload this page and try again.')
      })
    return () => {
      mounted = false
    }
  }, [supported, scope])

  async function enable() {
    setPending(true)
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
        await api.post('/push/subscriptions', device.toJSON())
      } catch (error) {
        await device.unsubscribe()
        throw error
      }
      setSubscription(device)
      setFeedback(
        'Enabled. New customer messages will appear here, even when the app is closed. Message text stays off your Lock Screen.',
      )
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not enable notifications.')
    } finally {
      setPending(false)
    }
  }
  async function disable() {
    if (!subscription) return
    setPending(true)
    try {
      await apiFetch('/push/subscriptions', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
      await subscription.unsubscribe()
      setSubscription(null)
      setFeedback('Notifications are off on this device.')
    } catch {
      setFeedback('Could not disable notifications. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }
  async function test() {
    if (!subscription) return
    setPending(true)
    try {
      await api.post('/push/test', { endpoint: subscription.endpoint })
      setFeedback(
        'Test accepted by the push provider. Check Notification Center; Focus settings may silence its banner.',
      )
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not send a test notification.')
    } finally {
      setPending(false)
    }
  }
  return (
    <SectionCard
      title="Device notifications"
      description="New WhatsApp, email, iMessage and Telegram customer messages."
    >
      {IS_DEMO ? (
        <p className="text-sm text-text-secondary">
          Notifications are available in your connected workspace. This preview does not register
          your device.
        </p>
      ) : iphone && !installed ? (
        <p className="text-sm leading-6 text-text-secondary">
          <Smartphone className="mr-1 inline h-4 w-4" />
          Add Outbound OS to your Home Screen, open its icon, then enable notifications here.{' '}
          <Link to="/m/install" className="text-focus underline">
            Install instructions
          </Link>
        </p>
      ) : !supported ? (
        <p className="text-sm leading-6 text-text-secondary">
          Use a browser that supports Web Push over HTTPS. On iPhone, use iOS 16.4 or later and open
          the Home Screen app.
        </p>
      ) : config.isPending ? (
        <p className="text-sm text-text-muted">Checking notification setup…</p>
      ) : config.error ? (
        <Button variant="secondary" onClick={() => void config.refetch()}>
          Retry notification setup
        </Button>
      ) : !config.data?.enabled ? (
        <p className="text-sm text-text-secondary">
          The server’s push keys still need to be configured by your administrator.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            {subscription
              ? 'This device can receive customer message alerts.'
              : 'Enable alerts on this device so you can respond when the app is closed.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {subscription ? (
              <>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => void test()}
                  leftIcon={<Bell className="h-4 w-4" />}
                >
                  Send test
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => void disable()}
                  leftIcon={<BellOff className="h-4 w-4" />}
                >
                  Disable
                </Button>
              </>
            ) : (
              <Button
                disabled={pending}
                onClick={() => void enable()}
                leftIcon={<Bell className="h-4 w-4" />}
              >
                {pending ? 'Enabling…' : 'Enable notifications'}
              </Button>
            )}
          </div>
          <p className="text-xs leading-5 text-text-muted">
            Alerts start after you enable them. Alerts are checked every 30 seconds after messages
            reach the CRM. Mailbox sync may add delay. Your device’s Focus, sound and notification
            settings still apply.
          </p>
        </div>
      )}
      {feedback && (
        <p role="status" className="mt-3 text-sm leading-6 text-text-secondary">
          {feedback}
        </p>
      )}
    </SectionCard>
  )
}
