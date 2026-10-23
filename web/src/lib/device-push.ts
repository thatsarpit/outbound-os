// Signing out also unsubscribes this browser. No session token is stored by the worker.
export async function detachDevicePush(token: string | null) {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  // Ask the browser first: this also blocks delivery if the CRM is offline.
  await subscription.unsubscribe()
  if (token)
    await fetch('/api/push/subscriptions', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      keepalive: true,
    })
}
export function pushApplicationKey(value: string) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}
