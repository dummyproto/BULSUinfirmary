import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@services/supabaseClient'
import { getUserByEmail, getUserByAuthId, linkAuthUserIfNeeded, finalizeSelfRegistration, checkAccountActive } from '@services/usersService'
import { logAuthEvent } from '@services/auditLogsService'
import { useToast } from '@context/ToastContext'
import { getAppUrl } from '@lib/appUrl'
import { clearRegistrationDraft } from '@features/auth/RegisterModal'

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const { show } = useToast()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  const loadProfile = useCallback(async (authUser) => {
    if (!authUser) {
      setProfile(null)
      setProfileError(null)
      return
    }
    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        let row = await getUserByAuthId(authUser.id)
        if (!row && authUser.email) {
          row = await getUserByEmail(authUser.email)
          if (row) row = await linkAuthUserIfNeeded(row, authUser.id)
        }
        if (!row && authUser.user_metadata?.role === 'patient') {
          try {
            row = await finalizeSelfRegistration(authUser)
          } catch (regErr) {
            const isRaceWithAnotherTab = (regErr.code === '23505' || regErr.code === '42501') && authUser.email
            if (isRaceWithAnotherTab) {
              row = await getUserByEmail(authUser.email)
              if (row) row = await linkAuthUserIfNeeded(row, authUser.id)
              if (!row) row = await getUserByAuthId(authUser.id)
              if (!row) {
                const friendly = new Error(
                  "We couldn't finish loading your account — there's a conflicting registration on file (likely from an earlier, incomplete sign-up attempt). Please contact an administrator so they can look into it."
                )
                friendly.cause = regErr
                throw friendly
              }
            } else {
              throw regErr
            }
          }
        }
        setProfile(row)
        setProfileError(null)
        return row
      } catch (err) {
        const isClockSkew = /jwt issued at future/i.test(err.message || '')
        if (isClockSkew && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 800))
          continue
        }
        console.error('Failed to load user profile:', err.message)
        setProfile(null)
        setProfileError(err.message || 'Failed to load your account.')
        return
      }
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const hadUrlToken = /access_token=/.test(window.location.hash)
    const urlTokenMatch = window.location.hash.match(/[?&]type=([^&]+)/)
    const isEmailConfirmationLink = hadUrlToken && urlTokenMatch?.[1] === 'signup'

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      if (hadUrlToken && !data.session) {
        window.history.replaceState(null, '', window.location.pathname)
        show('This confirmation or reset link has expired or was already used. Please request a new one.', 'error')
      }
      setSession(data.session)
      let row
      if (data.session?.user) row = await loadProfile(data.session.user)
      if (!mounted) return
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

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    let active
    try {
      active = await checkAccountActive(email)
    } catch {
      active = true
    }
    if (active === false) {
      let deniedRow
      try {
        deniedRow = await getUserByEmail(email)
      } catch {
        // ignore
      }
      await logAuthEvent({ userId: deniedRow?.user_id, action: 'LOGIN_DENIED', details: `${email} — account is disabled` })
      await supabase.auth.signOut()
      throw new Error('ACCOUNT_DISABLED')
    }

    const row = await loadProfile(data.user)
    await logAuthEvent({ userId: row?.user_id, action: 'LOGIN_SUCCESS', details: `${email} signed in` })

    return data
  }, [loadProfile])

  const signInWithPin = useCallback(
    async (email, pin) => {
      const { data, error } = await supabase.functions.invoke('verify-pin', { body: { email, pin } })
      if (error) {
        let message = 'Could not verify PIN'
        try {
          const body = await error.context?.json()
          if (body?.error) message = body.error
        } catch {
          // Response wasn't JSON, or context was unavailable
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
      let row
      try {
        row = await getUserByEmail(email)
      } catch {
        // ignore
      }
      await logAuthEvent({ userId: row?.user_id, action: 'LOGIN_SUCCESS', details: `${email} signed in via PIN` })
    },
    []
  )

  const signOut = useCallback(async () => {
    await logAuthEvent({ userId: profile?.user_id, action: 'LOGOUT', details: profile?.email ? `${profile.email} signed out` : 'User signed out' })
    await supabase.auth.signOut()
    // Wipes any abandoned registration draft (RegisterModal.jsx) so it
    // can never resurface for whoever uses this browser next — that
    // draft is meant to survive an accidental refresh mid-registration,
    // not an entire login/logout cycle.
    clearRegistrationDraft()
  }, [profile])

  const verifyCurrentPassword = useCallback(
    async (password) => {
      if (!session?.user?.email) throw new Error('Not signed in')
      const { error } = await supabase.auth.signInWithPassword({ email: session.user.email, password })
      if (error) throw new Error('Current password is incorrect')
    },
    [session]
  )

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

  const requestPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAppUrl()}/reset-password`,
    })
    if (error) throw error
    logAuthEvent({ userId: null, action: 'PASSWORD_RESET_REQUESTED', details: `Password reset requested for ${email}` })
  }, [])

  const verifyRecoveryOtp = useCallback(async (email, token) => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' })
    if (error) throw error
    return data
  }, [])

  const completePasswordReset = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
    if (session?.user?.email) {
      let row
      try {
        row = await getUserByEmail(session.user.email)
      } catch {
        // ignore
      }
      logAuthEvent({ userId: row?.user_id, action: 'PASSWORD_RESET_COMPLETED', details: `${session.user.email} completed a password reset` })
    }
  }, [session])

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

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      profileError,
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
    }),
    [session, profile, profileError, isPasswordRecovery, loading, signIn, signInWithPin, signOut, changePassword, verifyCurrentPassword, requestPasswordReset, verifyRecoveryOtp, completePasswordReset, loadProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}