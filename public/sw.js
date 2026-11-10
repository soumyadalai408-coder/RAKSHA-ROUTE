self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('push', event => {
  const data = event.data?.json() || { title: 'RAKSHA ROUTE alert', body: 'A new road incident requires attention.' }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: data.tag || 'raksha-route-alert',
    data: data.url || '/',
    requireInteraction: data.severity === 'Critical',
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(existing => {
    if (existing.length) return existing[0].focus()
    return clients.openWindow(event.notification.data || '/')
  }))
})
