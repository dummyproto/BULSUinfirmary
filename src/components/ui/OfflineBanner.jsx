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
      {/* Phase 2/3 of offline support (Inventory Release/Replenish,
         Consultation save) added actions that DO now queue and sync
         automatically once reconnected — this used to say "changes
         won't save" unconditionally, which is no longer accurate for
         those specific actions. Everything else in the app still
         behaves the old way (won't save at all while offline), so kept
         as a general caution rather than claiming every action here is
         covered — PendingSyncIndicator.jsx is what actually shows which
         specific actions are queued and waiting. */}
      <span>You're offline — most changes won't save until your connection comes back. Some actions (like Inventory updates and Consultations) are queued and will sync automatically once you're back online.</span>
    </div>
  )
}