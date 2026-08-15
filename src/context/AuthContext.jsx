import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '@services/supabaseClient'
import { getUserByEmail, getUserByAuthId, linkAuthUserIfNeeded, finalizeSelfRegistration, checkAccountActive } from '@services/usersService'

export const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null) // flattened row from public.users + role-specific profile table
  const [loading, setLoading] = useState(true)
  // Set when Supabase's client fires the PASSWORD_RECOVERY auth event
  // (i.e. the person arrived via a password-reset link/OTP, resolved
  // automatically from the URL by supabaseClient's detectSessionInUrl).
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  const loadProfile = useCallback(async (authUser) => {
    if (!authUser) {
      setProfile(null)
      return
    }
    try {
      let row = await getUserByAuthId(authUser.id)
      if (!row && authUser.email) {
        row = await getUserByEmail(authUser.email)
        // linkAuthUserIfNeeded(row, authUserId) — its FIRST parameter is
        // the whole row object (it reads row.auth_user_id and
        // row.user_id internally), not the bare user_id. Passing
        // row.user_id here (just the integer) meant the function's own
        // `row.user_id` access was reading .user_id off a number, i.e.
        // undefined — which the update's .eq('user_id', undefined) then
        // sent to Postgres as the literal string "undefined" against an
        // integer column, exactly the "invalid input syntax for type
        // integer" 400 in the console. Hit on the "found by email, not
        // yet linked by auth_user_id" bridge path — most commonly a
        // patient's first sign-in right after self-registration.
        if (row) row = await linkAuthUserIfNeeded(row, authUser.id)
      }
      if (!row && authUser.user_metadata?.role === 'patient') {
        row = await finalizeSelfRegistration(authUser)
      }
      setProfile(row)
    } catch (err) {
      console.error('Failed to load user profile:', err.message)
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      // Awaited, not fire-and-forget — same reasoning as signIn() below:
      // setLoading(false) is what lets ProtectedRoute stop showing its
      // spinner and render the actual page, so if it ran before the
      // profile fetch finished, ProtectedRoute would let DashboardPage
      // through with `role` still null (DashboardPage renders nothing
      // for that case) — a blank flash on every page refresh/reopen
      // while already signed in, not just on a fresh login.
      if (data.session?.user) await loadProfile(data.session.user)
      if (!mounted) return
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      } else if (newSession) {
        // Any other event that still carries a session (a normal
        // SIGNED_IN, a token refresh, etc.) means this is no longer (or
        // never was) a recovery-only flow.
        setIsPasswordRecovery(false)
      }
      if (newSession?.user) {
        loadProfile(newSession.user)
      } else {
        setProfile(null)
        setIsPasswordRecovery(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  // Phase R — the correct password alone is no longer enough. After
  // Supabase Auth confirms the credentials, this also checks
  // `public.users.is_active` (via the lookup_is_active_by_email RPC,
  // migration 024) and immediately signs back out if the account was
  // disabled — either by LoginPage's 10-failed-attempt lockout
  // escalation, or by an admin's Deactivate toggle in Maintenance ->
  // User Management. Supabase Auth itself has no concept of that column,
  // so without this check a disabled account could still sign in
  // normally. Checked here (not per call site) so every sign-in path —
  // the password form, dev quick-login, QR/Scan-ID — is covered by one
  // rule instead of duplicating it.
  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    let active
    try {
      active = await checkAccountActive(email)
    } catch {
      // If the activity check itself fails (network hiccup, RPC not yet
      // deployed, etc.), fail open rather than locking every user out
      // over an infrastructure issue unrelated to their own account.
      active = true
    }
    if (active === false) {
      await supabase.auth.signOut()
      throw new Error('ACCOUNT_DISABLED')
    }

    // Load the profile here, before signIn() itself resolves, instead of
    // only relying on the onAuthStateChange listener above to pick it up
    // asynchronously. Without this, LoginPage's `await signIn(...)`
    // could resolve — flipping isAuthenticated true and firing the
    // redirect to /dashboard — before `profile`/`role` had actually
    // finished loading, since that listener fires independently of this
    // function's own promise. DashboardPage has no way to render the
    // right per-role dashboard with `role` still null, so that gap
    // showed up as a blank flash between "logged in" and "dashboard
    // actually visible" instead of landing on it directly. Awaiting it
    // here means role is already set by the time the caller proceeds.
    await loadProfile(data.user)

    return data
  }, [loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  // Re-authenticates with the current password first (Supabase Auth has no
  // separate "verify current password" endpoint), then updates to the new
  // one. Fully real — no service-role key needed since this only ever acts
  // on the signed-in user's own account.
  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      if (!session?.user?.email) throw new Error('Not signed in')
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email: session.user.email, password: currentPassword })
      if (reauthError) throw new Error('Current password is incorrect')
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
    },
    [session]
  )

  // Sends the recovery email; Supabase's own rate-limiting/enumeration
  // protection means this resolves the same way whether or not the email
  // actually matches an account — the caller shows a generic message
  // either way, never revealing account existence.
  const requestPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }, [])

  // OTP-based recovery — verifies the code Supabase emailed (via
  // requestPasswordReset above) and, on success, establishes a real
  // session for that account. completePasswordReset() can then be called
  // immediately after to set the new password, all inside one modal, no
  // page navigation or email-link click required.
  const verifyRecoveryOtp = useCallback(async (email, token) => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' })
    if (error) throw error
    return data
  }, [])

  // Only meaningful while isPasswordRecovery is true (a real session
  // established from a reset-email link/OTP) — updateUser() would still
  // work on a normal logged-in session too, but ResetPasswordPage only
  // calls this after confirming isPasswordRecovery itself.
  const completePasswordReset = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  }, [])

  // Keeps `profile` live for whoever's actually signed in, not just the
  // person making a change themselves. Without this, `profile` only
  // ever updated after this person's OWN save (loadProfile/
  // refreshProfile called explicitly) — an admin editing this patient's
  // Surname/First Name in Maintenance, or the same person editing their
  // own name from a second tab/device, would leave every OTHER place
  // reading useAuth().profile (Topbar's name, ProfilePage's Personal
  // Info, Sidebar, MobileBottomNav) silently stale until their next
  // sign-in. One subscription here, in the single place `profile` state
  // actually lives, automatically covers every consumer of it — no need
  // to wire this into each component separately. Filtered to THIS
  // user's own row only (not the whole users/patient_profiles/
  // staff_profiles tables) — same scoping AccountStatusGuard already
  // uses for the same reason: efficiency, and avoiding this tab
  // refetching every time ANY unrelated user's data changes anywhere in
  // the app.
  useEffect(() => {
    const userId = profile?.user_id
    if (!userId) return undefined

    let debounceTimer = null
    function scheduleRefresh() {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        loadProfile(session?.user)
      }, 400)
    }

    const channel = supabase
      .channel(`profile-live-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `user_id=eq.${userId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_profiles', filter: `user_id=eq.${userId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_profiles', filter: `user_id=eq.${userId}` }, scheduleRefresh)
      .subscribe()

    return () => {
      clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    isAuthenticated: !!session,
    isPasswordRecovery,
    loading,
    signIn,
    signOut,
    changePassword,
    requestPasswordReset,
    verifyRecoveryOtp,
    completePasswordReset,
    refreshProfile: () => loadProfile(session?.user),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}