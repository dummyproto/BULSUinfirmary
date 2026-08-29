import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '@services/supabaseClient'
import { getUserByEmail, getUserByAuthId, linkAuthUserIfNeeded, finalizeSelfRegistration, checkAccountActive } from '@services/usersService'
import { logAuthEvent } from '@services/auditLogsService'
import { useToast } from '@context/ToastContext'
import { getAppUrl } from '@lib/appUrl'

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const { show } = useToast()
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
    // Retries specifically on Supabase's "JWT issued at future" error — a
    // known Supabase-infra quirk where a JUST-issued token (right after
    // signUp()/signInWithPassword()) gets validated by a REST API pod
    // whose clock is a hair behind the Auth pod that signed it, making
    // the token's iat look like it's in the future for a moment. It's
    // not this app's system clock (confirmed correct) and not anything
    // wrong with the token itself — it self-resolves within a second or
    // two as the token ages past that razor-thin skew window, so a short
    // retry is the actual fix rather than surfacing it as a real error.
    // Anything else throws straight through on the first attempt, same
    // as before — this isn't a general "retry any failure" loop.
    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
          try {
            row = await finalizeSelfRegistration(authUser)
          } catch (regErr) {
            // Two different Postgres errors both mean the exact same
            // thing here — "another tab/request already created this
            // row" — just surfaced differently depending on exactly
            // where the two finalizeSelfRegistration() calls collided:
            //   - 23505 (duplicate key): the other tab's INSERT into
            //     users committed first, so this one violates a unique
            //     constraint (username/email).
            //   - 42501 (row-level security violation, "new row
            //     violates row-level security policy for table
            //     users"): the classic trigger is a confirmation-email
            //     link being opened in a NEW tab while the tab that
            //     started registration is still open — Supabase syncs
            //     the resulting session to that old tab too (same-origin
            //     localStorage sync), so it independently fires this
            //     same finalizeSelfRegistration() call at nearly the
            //     same moment as the new tab, and loses the race.
            // Either way, re-fetching and linking the row the OTHER
            // attempt already created is strictly safer than surfacing
            // this as a fatal "failed to load profile" error for an
            // account that's actually working fine in its other tab.
            const isRaceWithAnotherTab = (regErr.code === '23505' || regErr.code === '42501') && authUser.email
            if (isRaceWithAnotherTab) {
              row = await getUserByEmail(authUser.email)
              if (row) row = await linkAuthUserIfNeeded(row, authUser.id)
              if (!row) throw regErr
            } else {
              throw regErr
            }
          }
        }
        setProfile(row)
        return row
      } catch (err) {
        const isClockSkew = /jwt issued at future/i.test(err.message || '')
        if (isClockSkew && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 800))
          continue
        }
        console.error('Failed to load user profile:', err.message)
        setProfile(null)
        return
      }
    }
  }, [])

  useEffect(() => {
    let mounted = true

    // A confirmation/recovery email link lands here as
    // "#access_token=...&refresh_token=...&type=signup" (or
    // "type=recovery") — Supabase's own server already verified it by
    // this point, so the token in the URL is real, but detectSessionInUrl
    // still has to exchange it for an actual session client-side, and
    // that step can itself fail (most commonly: the same link got
    // loaded/retried more than once — a page reload after a dropped
    // connection, opening it in a second tab, etc. — and the first
    // successful attempt already consumed it, since these tokens work
    // like a one-time code even though they LOOK like a normal session
    // token). Captured before the getSession() call below so it's not
    // lost once supabase-js strips it from the URL after processing.
    const hadUrlToken = /access_token=/.test(window.location.hash)
    // Distinguishes an email-confirmation link ("type=signup") from a
    // password-recovery link ("type=recovery") — same one-shot capture
    // as hadUrlToken above and for the same reason: the hash is gone by
    // the time the getSession() promise below resolves.
    const urlTokenMatch = window.location.hash.match(/[?&]type=([^&]+)/)
    const isEmailConfirmationLink = hadUrlToken && urlTokenMatch?.[1] === 'signup'

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      if (hadUrlToken && !data.session) {
        // The URL had a token to redeem, but no session came out of it —
        // that combination only happens when the exchange itself failed
        // (expired or already-used link), not a normal "not signed in
        // yet" case. Clears the dead token out of the address bar so a
        // refresh doesn't just repeat the same failed attempt, and tells
        // the person plainly what happened instead of leaving them
        // looking at an unexplained login page.
        window.history.replaceState(null, '', window.location.pathname)
        show('This confirmation or reset link has expired or was already used. Please request a new one.', 'error')
      }
      setSession(data.session)
      // Awaited, not fire-and-forget — same reasoning as signIn() below:
      // setLoading(false) is what lets ProtectedRoute stop showing its
      // spinner and render the actual page, so if it ran before the
      // profile fetch finished, ProtectedRoute would let DashboardPage
      // through with `role` still null (DashboardPage renders nothing
      // for that case) — a blank flash on every page refresh/reopen
      // while already signed in, not just on a fresh login.
      let row
      if (data.session?.user) row = await loadProfile(data.session.user)
      if (!mounted) return
      // Logged here (not inside loadProfile itself) since this is the
      // ONE path that means "a confirmation link was just redeemed" —
      // loadProfile also runs on every ordinary page load/refresh while
      // already signed in, which must never re-log this.
      if (isEmailConfirmationLink && row) {
        logAuthEvent({ userId: row.user_id, action: 'EMAIL_VERIFIED', details: `${row.email || 'Account'} confirmed via email link` })
      }
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
  }, [loadProfile, show])

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
      // Best-effort: the account is disabled either way, whether or not
      // this lookup (needed only to attach a user_id to the log entry)
      // succeeds — never let it block signing the person back out.
      let deniedRow
      try {
        deniedRow = await getUserByEmail(email)
      } catch {
        // ignore — logAuthEvent below just logs with userId: null instead
      }
      // Awaited — same race as signOut() below: without this, the log
      // insert and supabase.auth.signOut() fire concurrently, and
      // signOut() revoking the session's JWT can win before the insert
      // actually reaches Supabase, so auth.uid() resolves to nothing
      // server-side and the RLS check on audit_logs rejects it with a
      // 403. Awaiting first means the insert completes while the
      // session backing it is still valid.
      await logAuthEvent({ userId: deniedRow?.user_id, action: 'LOGIN_DENIED', details: `${email} — account is disabled` })
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
    const row = await loadProfile(data.user)
    // Awaited, not fire-and-forget — same category of race as the
    // LOGIN_DENIED and LOGOUT fixes elsewhere in this file: this insert
    // must not be left in flight past the point where signIn() resolves,
    // since the caller (LoginPage.jsx) reacts to that by flipping
    // isAuthenticated and redirecting immediately, rather than guaranteeing
    // this background write finishes cleanly first. logAuthEvent() already
    // swallows its own errors internally, so this can't turn a logging
    // hiccup into a blocked sign-in.
    await logAuthEvent({ userId: row?.user_id, action: 'LOGIN_SUCCESS', details: `${email} signed in` })

    return data
  }, [loadProfile])

  // Alternative to signIn() for the Login page's QR-scan flow, once the
  // scanned ID has identified an email that has a PIN set (see
  // LoginPage.jsx's handleIdentified and checkEmailHasPin in
  // usersService.js). The actual PIN check and account-active/lockout
  // enforcement all happen server-side in the verify-pin Edge Function
  // (see that file's own comments for why this can't be a client-side
  // check) — this just calls it, then completes the real Supabase
  // session it hands back.
  const signInWithPin = useCallback(
    async (email, pin) => {
      const { data, error } = await supabase.functions.invoke('verify-pin', { body: { email, pin } })
      if (error) {
        let message = 'Could not verify PIN'
        try {
          const body = await error.context?.json()
          if (body?.error) message = body.error
        } catch {
          // Response wasn't JSON, or context was unavailable — fall back
          // to the generic message above.
        }
        let attemptedRole
        try {
          attemptedRole = (await getUserByEmail(email))?.role
        } catch {
          attemptedRole = undefined
        }
        logAuthEvent({ userId: null, action: 'LOGIN_FAILED', details: `${email} — PIN sign-in: ${message}`, actorRole: attemptedRole })
        throw new Error(message)
      }
      if (!data?.token_hash) throw new Error('Could not complete sign-in')

      const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
      if (otpError) throw otpError
      // onAuthStateChange (already wired up above) picks up the new
      // session and calls loadProfile() from there automatically — same
      // as it does after a normal signIn(). email is already confirmed
      // correct at this point (verify-pin succeeded), so a best-effort
      // lookup here is enough to attach a user_id to the log entry.
      let row
      try {
        row = await getUserByEmail(email)
      } catch {
        // ignore — logAuthEvent below just logs with userId: null instead
      }
      // Awaited for the same reason as the password-based LOGIN_SUCCESS
      // above.
      await logAuthEvent({ userId: row?.user_id, action: 'LOGIN_SUCCESS', details: `${email} signed in via PIN` })
    },
    []
  )

  const signOut = useCallback(async () => {
    // Logged BEFORE the actual sign-out — profile.user_id is only
    // available while the session backing it still exists; reading it
    // after supabase.auth.signOut() would already be too late (profile
    // clears via the onAuthStateChange listener above).
    //
    // Awaited, not fire-and-forget — previously this call and
    // supabase.auth.signOut() ran concurrently. logAuthEvent() posts the
    // audit-log INSERT and returns immediately; signOut() revokes the
    // session's JWT right after. Whichever finished first wasn't
    // guaranteed, and revocation is the faster of the two in practice —
    // so the INSERT often reached Supabase's REST API only after the
    // token backing it was already dead, meaning auth.uid() resolved to
    // nothing server-side and the audit_logs RLS policy rejected it with
    // a 403 (visible in the console as [AUTH_AUDIT_LOG_FAILED] LOGOUT).
    // logAuthEvent() already swallows its own errors internally (see
    // auditLogsService.js), so awaiting it here can't turn a
    // logging hiccup into a blocked sign-out — it only guarantees the
    // insert is attempted while the session is still actually valid.
    await logAuthEvent({ userId: profile?.user_id, action: 'LOGOUT', details: profile?.email ? `${profile.email} signed out` : 'User signed out' })
    await supabase.auth.signOut()
  }, [profile])

  // Pure re-auth check — confirms the current password is correct
  // WITHOUT changing anything, unlike changePassword() below. Used by
  // SetPinModal.jsx before letting someone set/change/remove their
  // quick-login PIN: since a PIN is an alternative way into the account,
  // requiring the real password once first (even though Account
  // Settings already requires being signed in) guards against someone
  // grabbing an already-unlocked device and quietly adding their own
  // backdoor PIN.
  const verifyCurrentPassword = useCallback(
    async (password) => {
      if (!session?.user?.email) throw new Error('Not signed in')
      const { error } = await supabase.auth.signInWithPassword({ email: session.user.email, password })
      if (error) throw new Error('Current password is incorrect')
    },
    [session]
  )

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
      logAuthEvent({ userId: profile?.user_id, action: 'PASSWORD_CHANGED', details: `${session.user.email} changed their password` })
    },
    [session, profile]
  )

  // Sends the recovery email; Supabase's own rate-limiting/enumeration
  // protection means this resolves the same way whether or not the email
  // actually matches an account — the caller shows a generic message
  // either way, never revealing account existence. Logged with
  // userId: null regardless of whether the email is real, for the same
  // enumeration-safety reason — attaching a real user_id only when the
  // email happens to match an account would itself leak which emails
  // are registered to anyone able to read the audit trail's raw data.
  const requestPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAppUrl()}/reset-password`,
    })
    if (error) throw error
    logAuthEvent({ userId: null, action: 'PASSWORD_RESET_REQUESTED', details: `Password reset requested for ${email}` })
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
    // Resolved fresh (not read from `profile` state) since this recovery
    // session may be too new for the profile-loading effect above to
    // have finished — a stale/missing user_id here would silently drop
    // the log entry (or hit the RLS null-user_id case, which only
    // applies to a still-anonymous caller, not an authenticated one).
    if (session?.user?.email) {
      let row
      try {
        row = await getUserByEmail(session.user.email)
      } catch {
        // ignore — logAuthEvent below just logs with userId: null instead
      }
      logAuthEvent({ userId: row?.user_id, action: 'PASSWORD_RESET_COMPLETED', details: `${session.user.email} completed a password reset` })
    }
  }, [session])

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
    signInWithPin,
    signOut,
    changePassword,
    verifyCurrentPassword,
    requestPasswordReset,
    verifyRecoveryOtp,
    completePasswordReset,
    refreshProfile: () => loadProfile(session?.user),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}