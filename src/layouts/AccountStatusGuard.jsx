import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import { supabase } from '@services/supabaseClient'
import { getUserByAuthId } from '@services/usersService'

// How often the safety-net poll below runs. Realtime (below) is the fast
// path — usually near-instant — but is not fully relied on alone: an
// admin's Delete User action removes the auth.users row via the
// delete-user Edge Function BEFORE removing the public.users row (see
// usersService.deleteUser()'s own comment on why that order matters), and
// Supabase Auth revoking a user's sessions server-side isn't guaranteed
// to be reflected the instant it happens by an *already-connected*
// realtime socket using an already-issued JWT. This poll is the
// guaranteed fallback regardless of any realtime-timing edge case.
const POLL_MS = 30_000

/**
 * Mounted once in AppShell (authenticated routes only), alongside
 * SessionTimeoutManager (idle timeout) and EmergencyAlertListener. Same
 * shape as both: a background watcher that calls the existing signOut()
 * when it decides to, not a new sign-out mechanism of its own.
 *
 * The gap this closes: deleting or deactivating a user in Maintenance ->
 * User Management only ever changed the database. Someone already
 * signed in on another device (or the same device, another tab) kept
 * their session exactly as before — no error, no logout, just a
 * suddenly-broken app the next time an action happened to fail against
 * rows/RLS checks that no longer resolved the same way. This makes that
 * explicit and immediate instead: the moment their account is removed
 * or deactivated, they're signed out with a clear reason, from whatever
 * page they're on.
 */
export default function AccountStatusGuard() {
  const { user, profile, isAuthenticated, signOut } = useAuth()
  const { show } = useToast()
  const navigate = useNavigate()
  const handledRef = useRef(false)
  const authUserId = user?.id ?? null
  const userId = profile?.user_id ?? null

  useEffect(() => {
    if (!isAuthenticated || !authUserId || !userId) return undefined
    handledRef.current = false

    async function forceSignOut(message) {
      // Realtime and the poll could both fire around the same moment
      // (e.g. poll already in flight when the DELETE event arrives) —
      // this makes sure only the first one actually acts.
      if (handledRef.current) return
      handledRef.current = true
      show(message, 'error')
      try {
        await signOut()
      } finally {
        // Land on /login even if signOut() itself throws (e.g. the
        // session was already invalidated server-side by the deletion
        // itself) — the person still needs to be moved off whatever
        // protected page they were on.
        navigate('/login', { replace: true })
      }
    }

    // ── Fast path: realtime ──
    // Filtered on `user_id` (the table's actual primary key), not
    // auth_user_id — under Postgres's default REPLICA IDENTITY, a
    // DELETE event's OLD row image only carries the primary key column,
    // so filtering on any other column would silently never match at
    // all. The UPDATE filter uses the same column purely for
    // consistency — its NEW row image is always sent in full regardless
    // of replica identity, so either column would actually work there.
    const channel = supabase
      .channel(`account-status-${userId}`)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'users', filter: `user_id=eq.${userId}` },
        () => forceSignOut('Your account has been removed by an administrator. You have been signed out.')
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new?.is_active === false) {
            forceSignOut('Your account has been deactivated by an administrator. You have been signed out.')
          }
        }
      )
      .subscribe()

    // ── Safety net: poll ──
    async function checkStatus() {
      if (handledRef.current) return
      try {
        const row = await getUserByAuthId(authUserId)
        if (!row) {
          forceSignOut('Your account has been removed by an administrator. You have been signed out.')
        } else if (!row.active) {
          forceSignOut('Your account has been deactivated by an administrator. You have been signed out.')
        }
      } catch {
        // A failed check (network blip, RLS momentarily denying during a
        // token refresh, etc.) must never itself force a sign-out — only
        // a CONFIRMED missing/inactive row should. Just try again next
        // interval/focus.
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') checkStatus()
    }

    const interval = setInterval(checkStatus, POLL_MS)
    window.addEventListener('focus', checkStatus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', checkStatus)
      document.removeEventListener('visibilitychange', handleVisibility)
      supabase.removeChannel(channel)
    }
  }, [isAuthenticated, authUserId, userId, signOut, navigate, show])

  return null
}