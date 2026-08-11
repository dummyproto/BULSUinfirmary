import { useEffect, useState } from 'react'

// The console errors this is meant to make sense of (WebSocket
// net::ERR_NAME_NOT_RESOLVED, a subsequent POST landing as a confusing
// 400) all trace back to the same root event: the device's connection
// dropped for a moment. Nothing in the app surfaced that to the person
// using it — they just saw a pile of unrelated-looking failures. This
// hook tracks navigator.onLine + the browser's own 'online'/'offline'
// events so a single banner (see AppShell.jsx) can say the one thing
// that's actually true in that moment instead of nothing at all.
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    function goOnline() {
      setIsOnline(true)
    }
    function goOffline() {
      setIsOnline(false)
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return isOnline
}