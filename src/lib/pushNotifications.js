import { supabase } from '@services/supabaseClient'

// Public VAPID key — safe to expose client-side (that's the point of
// the public half of a key pair). The private half lives only in the
// send-push Edge Function's Supabase secrets, never here.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Push subscription keys arrive as raw bytes but the browser's
// subscribe() call needs the VAPID public key as a Uint8Array — this is
// the standard conversion every Web Push guide uses, since the key
// itself is distributed as a URL-safe base64 string for convenience.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

/**
 * Distinguishes the three genuinely different reasons push might not
 * work here, since they need completely different messages:
 *   'ok'          — supported, nothing blocking it
 *   'unconfigured' — the browser itself supports push fine, but
 *                    VITE_VAPID_PUBLIC_KEY isn't set (a deployment step
 *                    wasn't finished, not a real platform limitation —
 *                    see the setup checklist, Part 5)
 *   'unsupported' — the browser genuinely lacks the APIs needed. On
 *                    iOS Safari this specifically means "not installed
 *                    to the home screen yet" (an Apple platform
 *                    restriction, not something fixable in code); on
 *                    very old/uncommon browsers it just means no
 *                    support exists at all.
 */
export function getPushSupportStatus() {
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window
  if (!hasApis) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'unconfigured'
  return 'ok'
}

/** Whether this browser/device can even support push at all — see getPushSupportStatus() for *why* when this is false. */
export function isPushSupported() {
  return getPushSupportStatus() === 'ok'
}

/** Current permission state — 'granted' | 'denied' | 'default' (not yet asked). */
export function getPushPermission() {
  return 'Notification' in window ? Notification.permission : 'denied'
}

let swRegistrationPromise = null

/**
 * Registers public/sw.js exactly once per page load, regardless of how
 * many times this is called — repeated calls return the same in-flight
 * or already-resolved registration instead of re-registering.
 */
function registerServiceWorker() {
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker.register('/sw.js')
  }
  return swRegistrationPromise
}

/**
 * Full opt-in flow: register the service worker, ask for permission
 * (a real browser prompt — this can only be triggered from a genuine
 * user interaction like a button click, not on page load), subscribe,
 * and save the subscription against `userId` so send-push can find it
 * later. Returns true on success, false if the user declined or the
 * platform doesn't support it — callers should show a message either
 * way rather than failing silently.
 */
export async function enablePushNotifications(userId) {
  if (!isPushSupported()) return false

  const registration = await registerServiceWorker()

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true, // required by the spec — every push must show a visible notification, no silent background pushes
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })

  const json = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').insert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent,
  })
  // A duplicate endpoint (re-enabling on the same device without ever
  // having unsubscribed) hits the table's UNIQUE constraint — not a
  // real failure, the subscription the row already represents is still
  // perfectly valid, so this specific error is swallowed rather than
  // surfaced as a failure to the caller.
  if (error && error.code !== '23505') throw error

  return true
}

/**
 * Reverses enablePushNotifications() — unsubscribes this device at the
 * browser level and removes its row from push_subscriptions. Safe to
 * call even if the user never subscribed on this device; every step
 * checks for the thing it's about to undo first.
 */
export async function disablePushNotifications() {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  if (!registration) return

  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}

/**
 * Whether THIS device already has an active subscription — used to show
 * the right initial state for an on/off toggle (e.g. don't offer to
 * "enable" something already enabled here).
 */
export async function isPushEnabledOnThisDevice() {
  if (!isPushSupported()) return false
  if (!('serviceWorker' in navigator)) return false
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  if (!registration) return false
  const subscription = await registration.pushManager.getSubscription()
  return !!subscription
}