/* Push-only worker: authenticated CRM responses are never cached. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data?.json() || {} } catch { /* Always display a visible notification. */ }
  const url = typeof payload.url === 'string' && payload.url.startsWith('/m/') ? payload.url : '/m/inbox'
  event.waitUntil(self.registration.showNotification(
    typeof payload.title === 'string' ? payload.title : 'Outbound OS update',
    {
      body: typeof payload.body === 'string' ? payload.body : 'Open your sales workspace for an update.',
      icon: '/app-icon-192.png', badge: '/app-icon-192.png',
      tag: typeof payload.tag === 'string' ? payload.tag : 'outbound-update',
      data: { url },
    },
  ))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || '/m/inbox', self.location.origin)
    if (target.origin !== self.location.origin || !target.pathname.startsWith('/m/')) return
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin !== target.origin) continue
      const navigated = await client.navigate(target.href)
      if (navigated) return navigated.focus()
    }
    return self.clients.openWindow(target.href)
  })())
})
