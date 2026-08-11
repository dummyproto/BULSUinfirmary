import { useOnlineStatus } from '@hooks/useOnlineStatus'
import { AlertTriangleIcon } from './icons'

/**
 * Mounted once in AppShell, alongside ToastViewport. A dropped
 * connection used to show up only as a scatter of unrelated console
 * errors (a WebSocket failing to resolve, then some later action
 * failing with a plain "400 Bad Request") with nothing telling the
 * person what was actually going on. This says the one true thing —
 * "you're offline" — and clears itself the moment the browser reports
 * connectivity is back, which is also when EmergencyAlertListener.jsx
 * reconnects its realtime subscription.
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus()
  if (isOnline) return null

  return (
    <div className="offline-banner" role="status">
      <AlertTriangleIcon width={15} height={15} />
      <span>You're offline — changes won't save until your connection comes back.</span>
    </div>
  )
}