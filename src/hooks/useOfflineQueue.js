import { useSyncExternalStore } from 'react'
import { listQueuedActions, subscribeToQueueChanges, flushOfflineQueue } from '@services/offlineQueueService'

// Same subscribe-to-a-module-level-store pattern useOnlineStatus.js
// uses for navigator.onLine — this just re-renders whenever the
// offline queue changes (an action gets queued, synced, or removed),
// via offlineQueueService.js's own listener list, rather than polling.
//
// useSyncExternalStore (not useState+useEffect) is the React-documented
// way to do exactly this: it reads the current snapshot on the very
// first render AND re-subscribes correctly with no gap where a change
// between "initial read" and "subscription attached" could be missed —
// the specific race the previous useState+useEffect version had to work
// around with an extra, awkward setState call inside the effect body
// (which is also what react-hooks/set-state-in-effect was flagging).
export function useOfflineQueue() {
  const items = useSyncExternalStore(subscribeToQueueChanges, listQueuedActions)

  return {
    pendingItems: items,
    pendingCount: items.length,
    syncNow: flushOfflineQueue,
  }
}