import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@services/supabaseClient'
import { useAuth } from '@context/AuthContext'

const PresenceContext = createContext(undefined)

// Single, app-wide Supabase Realtime Presence channel. Every signed-in
// person — any role, on any page — joins this same channel once and
// tracks their own user_id on it, which is what makes them show up as
// "online" everywhere else in the app instantly: no polling, no extra
// writes to the users table (unlike users.is_active, which is the
// separate, admin-controlled "is this account allowed to sign in at
// all" flag — deliberately untouched by this file). Other clients
// watching the same channel get a live 'sync' event the moment someone
// joins or leaves.
//
// "Online" here means "has a live, currently-authenticated connection
// right now" — never "was recently active" or "is this account allowed
// to sign in" — and stays accurate through every way someone can stop
// being that, not just an in-app sign-out:
//   1. Explicit sign-out — isAuthenticated flips false, this effect's
//      own cleanup runs immediately, removeChannel() leaves at once.
//   2. Closing the tab / navigating away / reloading — the effect
//      cleanup below isn't guaranteed to run in time for that (the JS
//      context can be torn down before React gets to it), so a
//      `pagehide` listener explicitly untracks — fires reliably in
//      every browser, unlike `beforeunload`.
//   3. A crash, force-quit, or losing the network entirely — nothing
//      client-side can run at all in this case; Presence's own
//      server-side connection timeout is what eventually notices the
//      dropped socket and clears it for everyone watching. Bounded and
//      still real-time in spirit, just not instant, which is the
//      correct trade-off — there's no way to distinguish this from "the
//      device is fine but momentarily offline" any faster than that
//      without producing false "offline" flickers for people on a
//      shaky connection.
//
// The presence KEY is the user's own user_id — not a random per-tab id
// — specifically so that the same person having the app open in two
// tabs (or two devices) still shows as exactly one online entry rather
// than inflating a count or a list. Presence itself still tracks each
// underlying connection separately under that key; Object.keys(state)
// naturally collapses that back down to unique people, which is all any
// consumer of this context needs.
//
// Deliberately a separate provider from AuthContext — this is ephemeral
// UI-facing presence data, not identity/session state, so a page that
// never asks who else is online is never re-rendered just because
// someone else's presence changed.
export function PresenceProvider({ children }) {
  const { profile, isAuthenticated } = useAuth()
  const userId = profile?.user_id

  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set())

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      return undefined
    }

    let cancelled = false
    let retryTimer = null
    // Backs off a little more each consecutive failure (2s, 4s, 8s...
    // capped at 30s) rather than hammering a server that's already
    // having trouble — resets back to the base delay the moment a
    // subscribe attempt actually succeeds.
    let retryDelay = 2000
    // Reassigned inside connect() on every attempt (including retries)
    // rather than only captured once — handlePageHide and this effect's
    // own cleanup below both need to always act on whichever channel is
    // CURRENTLY live, not the original one from before a reconnect. A
    // plain `const channel = ...` captured once would leave both of
    // those operating on an already-torn-down, dead channel object
    // after any retry — untrack() on it wouldn't reach the real active
    // connection at all, so signing out or closing the tab after a
    // reconnect would silently fail to clear presence, leaving that
    // person stuck showing "online" instead of the "stuck offline" bug
    // this whole retry mechanism exists to fix in the first place.
    let channel = null

    function connect() {
      channel = supabase.channel('online-users', {
        config: { presence: { key: String(userId) } },
      })

      function syncFromState() {
        if (cancelled) return
        const state = channel.presenceState()
        setOnlineUserIds(new Set(Object.keys(state).map(Number)))
      }

      channel.on('presence', { event: 'sync' }, syncFromState)

      channel.subscribe((status) => {
        if (cancelled) return
        if (status === 'SUBSCRIBED') {
          retryDelay = 2000
          // Re-tracking on every 'SUBSCRIBED' callback (not just the very
          // first one) is deliberate — supabase-js's realtime client
          // reconnects the underlying socket automatically after a drop,
          // and this status callback fires again once it does, which is
          // what re-announces this person as online after a connectivity
          // blip instead of leaving them stuck showing "offline" to
          // everyone else despite still actively using the app.
          channel.track({ user_id: userId, online_at: new Date().toISOString() })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // The case the comment above assumed away: sometimes the
          // underlying socket reconnects but THIS channel's own
          // subscription doesn't automatically resume with it (or the
          // very first subscribe attempt itself fails — a slow network
          // on initial page load, a brief Realtime-service hiccup,
          // etc.). Previously nothing handled these statuses at all, so
          // a person could be genuinely signed in and actively using
          // the app the whole time while showing "offline" to every
          // admin watching User Presence Monitoring, with no way to
          // recover short of a full page refresh. Tearing down and
          // building a fresh channel (rather than re-subscribing the
          // same one, which supabase-js doesn't support once a channel
          // has errored/closed) picks the connection back up on its
          // own. CLOSED is included alongside CHANNEL_ERROR/TIMED_OUT
          // since the underlying WebSocket can close for reasons other
          // than an explicit error too (e.g. the server-side connection
          // getting recycled) — left unhandled, this had exactly the
          // same "stuck offline with no recovery" effect as the other
          // two.
          supabase.removeChannel(channel)
          if (cancelled) return
          retryTimer = setTimeout(() => {
            if (!cancelled) connect()
          }, retryDelay)
          retryDelay = Math.min(retryDelay * 2, 30000)
        }
      })
    }

    connect()

    // Safety net independent of the status-callback handling above —
    // covers the specific case neither SUBSCRIBED/re-track nor the
    // CHANNEL_ERROR/TIMED_OUT/CLOSED retry logic can: the subscribe
    // callback genuinely reports SUBSCRIBED (so none of the retry
    // conditions ever fire) but the track() call itself gets silently
    // dropped — a real, observed Phoenix-channels/Realtime quirk when
    // track() races the subscription handshake still finishing on the
    // server side. Every 20s, this checks whether this person's OWN
    // key is actually present in the channel's live presence state; if
    // it somehow isn't despite believing the connection is healthy, it
    // re-announces. Cheap and effectively a no-op on every normal tick
    // (a repeat track() call for someone already correctly listed costs
    // nothing meaningful) — this exists purely as insurance against the
    // one failure mode that produces no error/status signal to react to
    // at all, which is what was leaving specific, genuinely-signed-in
    // people permanently invisible in User Presence Monitoring with no
    // console error and no automatic recovery.
    const heartbeat = setInterval(() => {
      if (cancelled || !channel) return
      const state = channel.presenceState()
      if (!state[String(userId)]) {
        channel.track({ user_id: userId, online_at: new Date().toISOString() })
      }
    }, 20000)

    // Closing the tab, navigating away, or reloading doesn't reliably
    // run this effect's own cleanup below (the JS context can be torn
    // down before React gets to it) — without this, that person would
    // keep showing as "online" until Presence's own server-side
    // connection timeout eventually notices the dropped socket, which
    // is real-time-ish but not immediate. `pagehide` fires reliably in
    // every browser for both an actual unload AND a page going into the
    // back/forward cache, and untrack() is fire-and-forget here since
    // there's no time left to await it once this fires. Deliberately
    // NOT wired to `visibilitychange` — switching tabs or minimizing
    // the window still means genuinely signed in, just not focused on
    // this tab right now, and flipping someone to "offline" for that
    // would make this LESS accurate, not more.
    function handlePageHide() {
      channel.untrack()
    }
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      clearInterval(heartbeat)
      window.removeEventListener('pagehide', handlePageHide)
      supabase.removeChannel(channel)
      // Reset lives in this cleanup rather than as a direct call in the
      // early-return branch above (which is what previously tripped
      // react-hooks/set-state-in-effect — calling setState synchronously
      // in an effect's own body, outside a subscription/event callback,
      // is exactly the cascading-render pattern that rule flags). React
      // runs THIS cleanup — from the last "was authenticated" run —
      // before the next effect body (now seeing isAuthenticated: false)
      // executes, so sign-out still clears onlineUserIds at the same
      // moment as before; it just happens from the phase the rule
      // considers safe instead of the phase it doesn't.
      setOnlineUserIds(new Set())
    }
  }, [isAuthenticated, userId])

  const value = useMemo(
    () => ({
      onlineUserIds,
      isUserOnline: (id) => onlineUserIds.has(Number(id)),
    }),
    [onlineUserIds]
  )

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePresence() {
  const ctx = useContext(PresenceContext)
  if (ctx === undefined) throw new Error('usePresence must be used within a PresenceProvider')
  return ctx
}