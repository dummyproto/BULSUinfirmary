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
//   3. Losing the network, a crash, or a force-quit — nothing
//      client-side can run in these cases. Once the network genuinely
//      comes back, `supabase-js`'s Realtime client automatically
//      rejoins the channel on its own (it has its own internal,
//      library-managed backoff for this — see the note on the
//      'SUBSCRIBED' branch below for why this file deliberately does
//      NOT reimplement that itself), and the browser's own `online`
//      event covers the one case that automatic rejoin can't: a
//      connection that never successfully joined in the first place
//      (e.g. this page loaded while already offline) has nothing to
//      "rejoin" once connectivity returns, so this explicitly re-tracks
//      when that fires too. Until either of those happens, Presence's
//      own server-side timeout is what eventually clears a dropped
//      connection for everyone else watching — bounded, not instant,
//      which is the correct trade-off; there's no way to distinguish a
//      dropped connection from "fine but momentarily quiet" any faster
//      without producing false "offline" flickers for people on a
//      shaky connection.
//
// A previous version of this file manually tore down and recreated the
// channel on every CHANNEL_ERROR/TIMED_OUT/CLOSED status, in an attempt
// to recover faster than the library's own rejoin logic. Under
// sustained offline conditions that approach compounded into a runaway
// loop — repeated "cannot add 'presence' callbacks ... after
// subscribe()" errors (a fresh channel needs its .on() call registered
// BEFORE subscribing, and a shared, reassigned `let channel` variable
// raced against in-flight callbacks from the channel it was replacing)
// culminating in an actual `RangeError: Maximum call stack size
// exceeded`. Removed entirely — `.on()` is registered exactly once,
// before the one and only `.subscribe()` call this file ever makes,
// and reconnection is left entirely to the library.
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
    const channel = supabase.channel('online-users', {
      config: { presence: { key: String(userId) } },
    })

    function syncFromState() {
      if (cancelled) return
      const state = channel.presenceState()
      setOnlineUserIds(new Set(Object.keys(state).map(Number)))
    }

    function trackSelf() {
      // Fire-and-forget, same as every other .track() call in this
      // codebase — if the channel isn't actually in a joinable state
      // yet (e.g. this fires from the 'online' listener below before
      // the library's own reconnect has caught up), this just resolves
      // to a rejected/'error' status internally rather than throwing;
      // there's nothing meaningful to do differently in that case, and
      // the next successful 'SUBSCRIBED' callback (or the next 'online'
      // event) will simply try again.
      channel.track({ user_id: userId, online_at: new Date().toISOString() })
    }

    // Registered before subscribe(), never called again afterward —
    // Realtime rejects .on() on an already-subscribed channel, which is
    // exactly what the removed retry logic (see the file-level comment
    // above) used to violate.
    channel.on('presence', { event: 'sync' }, syncFromState)

    channel.subscribe((status) => {
      if (cancelled) return
      if (status === 'SUBSCRIBED') {
        // Fires again on its own after the library's automatic
        // reconnection succeeds — no manual teardown/recreate needed,
        // see the file-level comment above for why that was actively
        // harmful rather than just redundant.
        trackSelf()
      }
    })

    // Safety net for the one case the library's own automatic rejoin
    // can't cover — see point 3 in the file-level comment above.
    function handleOnline() {
      if (!cancelled) trackSelf()
    }
    window.addEventListener('online', handleOnline)

    function handlePageHide() {
      channel.untrack()
    }
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      cancelled = true
      window.removeEventListener('online', handleOnline)
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