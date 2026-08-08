// public/sw.js
//
// Service worker for Web Push notifications. Registered by
// src/lib/pushNotifications.js on app load. Deliberately minimal — this
// only handles push events and notification clicks, not offline
// caching/asset precaching (a separate concern this app doesn't
// currently need; adding it later wouldn't conflict with anything here).

self.addEventListener('install', () => {
  // Activate immediately rather than waiting for all existing tabs to
  // close — this is a notifications-only worker with no cached assets
  // that could go stale, so there's no reason to wait.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Fired when send-push/index.ts's call to the push service actually
// reaches this device. `event.data` is the JSON payload that function
// sends — see its own comments for the exact shape.
self.addEventListener('push', (event) => {
  let payload = { title: 'Bulsu Infirmary', body: 'You have a new notification.', url: '/dashboard' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    // Payload wasn't valid JSON (shouldn't happen given send-push always
    // sends JSON, but a malformed/empty push shouldn't crash the worker
    // or silently show nothing) — falls back to the generic message above.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: { url: payload.url || '/dashboard' },
      tag: payload.tag || undefined, // same tag replaces an existing unread notification instead of stacking duplicates
    })
  )
})

// Clicking the notification focuses an already-open tab on this app if
// one exists, rather than always opening a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})