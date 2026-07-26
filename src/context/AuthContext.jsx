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
        if (row) await linkAuthUserIfNeeded(row.user_id, authUser.id)
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

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session?.user) loadProfile(data.session.user)
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

    let active = true
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

    return data
  }, [])

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