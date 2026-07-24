import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@services/supabaseClient'
import { getUserByEmail, getUserByAuthId, linkAuthUserIfNeeded, finalizeSelfRegistration } from '@services/usersService'

export const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null) // flattened row from public.users + role-specific profile table
  const [loading, setLoading] = useState(true)
  // Set when Supabase's client fires the PASSWORD_RECOVERY auth event
  // (the user arrived via a password-reset email link, detected
  // automatically from the URL by supabaseClient's detectSessionInUrl).
  // ResetPasswordPage uses this to tell "genuinely here via a reset
  // link" apart from someone just navigating to /reset-password while
  // already normally signed in, or with an expired/invalid link.
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  // Resolved by the Phase A migration: `users.auth_user_id` now bridges
  // public.users <-> auth.users. New sessions are looked up by
  // auth_user_id directly; if a row hasn't been linked yet (first login
  // after the migration, or first login ever for a freshly-provisioned
  // account), it's found once by email and linked automatically.
  //
  // A third case (Phase K): a self-registered patient whose project
  // requires email confirmation has an auth.users row but no public.users
  // row yet — their registration details are stashed in user_metadata.
  // The first time such a person successfully logs in (post-confirmation),
  // finish creating their profile rows here.
  const loadProfile = useCallback(async (authUser) => {
    if (!authUser?.id) {
      setProfile(null)
      return
    }
    try {
      let row
      try {
        row = await getUserByAuthId(authUser.id)
      } catch {
        try {
          row = await getUserByEmail(authUser.email)
          row = await linkAuthUserIfNeeded(row, authUser.id)
        } catch {
          if (authUser.user_metadata?.role === 'patient' && authUser.user_metadata?.student_number) {
            await finalizeSelfRegistration(authUser)
            row = await getUserByAuthId(authUser.id)
          } else {
            throw new Error('No matching account found')
          }
        }
      }
      setProfile(row)
    } catch (error) {
      console.error('Failed to load user profile:', error.message)
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

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
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

  // Phase 1 (Forgot Password). Sends the recovery email; Supabase's own
  // rate-limiting/enumeration-protection means this resolves the same way
  // whether or not the email actually matches an account — the caller
  // shows a generic "if that account exists, an email was sent" message
  // either way, never revealing account existence.
  const requestPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }, [])

  // Only meaningful while isPasswordRecovery is true (a real session
  // established from a reset-email link) — updateUser() would still work
  // on a normal logged-in session too, but ResetPasswordPage only calls
  // this after confirming isPasswordRecovery itself.
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
