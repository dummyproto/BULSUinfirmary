import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import { supabase } from '@services/supabaseClient'
import { getAlertById, listEmergencyAlerts } from '@services/emergencyAlertsService'
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
// A realtime subscription only ever catches INSERTs that happen WHILE it's
// actively connected — it has no memory of anything that happened before it
// existed. That's a real gap on its own: an SOS submitted while staff/admin
// simply weren't logged in yet (this component doesn't even mount until
// someone authenticates), or while their connection had dropped and hadn't
// reconnected yet, would previously never trigger a popup/siren at all —
// staff would only ever find out by noticing the alert sitting in
// /emergency-alerts later. catchUpOnActiveAlert() below closes that:
// checked once right after mount (covers "SOS arrived before I logged in")
// and again every time the realtime channel successfully reconnects (covers
// "SOS arrived while my connection was down") — either way, whatever's
// still the most recent un-acknowledged alert gets the exact same
// siren+popup treatment a live INSERT would have gotten. Deliberately
// scoped to status === 'Active' only: one already Acknowledged means
// another staff member is already on it, and re-alarming everyone who logs
// in after that would just be noise, not something worth interrupting them
// for.
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

  // Mirrors activeAlert for catchUpOnActiveAlert below to read
  // synchronously — that function can run multiple times per mount (once
  // on initial subscribe, again on every reconnect), and closing over
  // `activeAlert` directly would see whatever it was back when the effect
  // first ran (this effect's dependency array is just [isStaffOrAdmin],
  // so it doesn't get redefined as activeAlert changes) rather than its
  // current value.
  const activeAlertRef = useRef(null)
  useEffect(() => {
    activeAlertRef.current = activeAlert
  }, [activeAlert])

  useEffect(() => {
    if (!isStaffOrAdmin) return undefined

    let cancelled = false

    async function catchUpOnActiveAlert() {
      // Something's already showing (a live INSERT beat this to it, or an
      // earlier catch-up call already found one) — skip entirely rather
      // than re-fetching and re-sounding the siren for an alert that's
      // already up on screen. Checked BEFORE the fetch, not just before
      // setActiveAlert, so a flaky connection reconnecting repeatedly
      // doesn't even hit the database for this each time.
      if (cancelled || activeAlertRef.current) return
      try {
        const alerts = await listEmergencyAlerts()
        const stillActive = alerts.find((a) => a.status === 'Active')
        // Re-check after the await — a live INSERT could have arrived
        // and been handled while this fetch was in flight.
        if (cancelled || activeAlertRef.current || !stillActive) return
        setActiveAlert(stillActive)
        playEmergencySiren()
      } catch {
        // Non-critical — worst case, staff/admin only find out about a
        // missed alert by seeing it in /emergency-alerts instead of via
        // the popup+siren. The realtime subscription below still covers
        // every alert from this point forward regardless.
      }
    }

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
          if (status === 'SUBSCRIBED') {
            // Freshly (re)connected — pick up anything that came in while
            // this channel was down or didn't exist yet.
            catchUpOnActiveAlert()
          }
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
      // above if it's already mid-countdown; reconnect right away. The
      // 'SUBSCRIBED' branch above handles the actual catch-up check once
      // the reconnect completes.
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