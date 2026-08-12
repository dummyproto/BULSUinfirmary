import { useEffect, useState } from 'react'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import { supabase } from '@services/supabaseClient'
import { getAlertById } from '@services/emergencyAlertsService'
import { playEmergencySiren, stopEmergencySiren } from '@lib/emergencySound'
import EmergencyLivePopup from '@features/emergency-alerts/EmergencyLivePopup'

// The gap this fixes: a patient filing an SOS already notified staff/admin
// via the bell (notify() calls in EmergencyReportModal.jsx), but that's a
// quiet badge increment someone has to be looking at — no sound, no
// interruption, and up to 60 seconds of polling delay if they're not on a
// page that just refreshed. The siren sound (lib/emergencySound.js) already
// existed but was only ever played for the PATIENT confirming their own
// submission, never for staff/admin receiving one. And the CSS for a "live
// popup" (.emg-live-* classes in legacy.css) was already fully designed but
// had no component using it at all.
//
// This closes all three gaps at once: subscribes directly to Postgres
// Changes on emergency_alerts (migration 021 adds the table to Supabase's
// realtime publication, which no table in this project had ever used
// before) — no polling, delivered the moment the INSERT commits, regardless
// of which page staff/admin happen to be on, since this is mounted once in
// AppShell alongside Sidebar/Topbar rather than on the Emergency Alerts
// page itself.
//
// Known limitation: activeAlert is a single slot. If a second alert arrives
// while a popup for a first one is still open, it replaces it — the first
// alert isn't lost from the database (it stays Active in /emergency-alerts
// either way), but its popup would be. Simultaneous emergencies are rare;
// queuing multiple live popups was judged not worth the added complexity
// for a first pass, but is a real, disclosed trade-off, not an oversight.
export default function EmergencyAlertListener() {
  const { profile, role } = useAuth()
  const { show } = useToast()
  const [activeAlert, setActiveAlert] = useState(null)
  const isStaffOrAdmin = role === 'staff' || role === 'admin'
  const currentUserId = profile?.user_id ?? null

  useEffect(() => {
    if (!isStaffOrAdmin) return undefined

    // A dropped connection (mobile WiFi/cell handoff, brief DNS failure —
    // exactly the "WebSocket ... net::ERR_NAME_NOT_RESOLVED" / "closed
    // before the connection is established" pattern this is built to
    // recover from) previously left this channel dead for the rest of the
    // session: .subscribe() only ever ran once, on mount, so staff/admin
    // stopped receiving live SOS alerts silently — no error shown, no
    // retry, nothing — until they manually refreshed the page. This now
    // rebuilds the subscription whenever the channel reports it dropped,
    // and again when the browser tells us connectivity came back.
    let channel = null
    let retryTimer = null
    let cancelled = false

    function subscribe() {
      if (cancelled) return
      channel = supabase
        .channel('emergency-alerts-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_alerts' }, async (payload) => {
          playEmergencySiren()
          try {
            // The realtime payload only carries raw columns (reported_by as
            // a bare integer) — fetch the same joined shape the rest of the
            // UI already uses so the popup can show the reporter's name.
            const fullAlert = await getAlertById(payload.new.emergency_alert_id)
            setActiveAlert(fullAlert)
          } catch {
            // Joined fetch failed for some reason — still alert on the raw
            // payload rather than showing nothing at all; the popup handles
            // missing fields (reporter_name etc.) gracefully either way.
            setActiveAlert(payload.new)
          }
        })
        .subscribe((status) => {
          if (cancelled) return
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            // Backs off 5s rather than hammering a connection that's still
            // down — retrying immediately on a DNS-resolution failure just
            // reproduces the same failure instantly, over and over.
            clearTimeout(retryTimer)
            retryTimer = setTimeout(() => {
              if (channel) supabase.removeChannel(channel)
              subscribe()
            }, 5000)
          }
        })
    }

    function handleOnline() {
      // Browser regained connectivity — don't wait for the 5s backoff
      // above if it's already mid-countdown; reconnect right away.
      clearTimeout(retryTimer)
      if (channel) supabase.removeChannel(channel)
      subscribe()
    }

    subscribe()
    window.addEventListener('online', handleOnline)

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      window.removeEventListener('online', handleOnline)
      if (channel) supabase.removeChannel(channel)
    }
  }, [isStaffOrAdmin])

  if (!isStaffOrAdmin) return null

  return (
    <EmergencyLivePopup
      alert={activeAlert}
      currentUserId={currentUserId}
      onClose={() => {
        stopEmergencySiren()
        setActiveAlert(null)
      }}
      onAcknowledged={() => {
        stopEmergencySiren()
        setActiveAlert(null)
      }}
      onError={(msg) => show(`Failed to acknowledge alert: ${msg}`, 'error')}
    />
  )
}