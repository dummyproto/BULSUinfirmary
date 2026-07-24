import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import PasswordInput from '@components/ui/PasswordInput'
import { validatePassword } from '@features/maintenance/lib/userHelpers'
import logo from '@/assets/logo.png'
import { LockIcon, AlertTriangleIcon, CheckCircleIcon } from '@components/ui/icons'

export default function ResetPasswordPage() {
  const { isPasswordRecovery, isAuthenticated, loading, completePasswordReset, signOut } = useAuth()
  const { show } = useToast()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const check = validatePassword(password)
    if (!check.ok) return setError(check.msg)
    if (password !== confirm) return setError('Passwords do not match.')

    setSubmitting(true)
    try {
      await completePasswordReset(password)
      // Deliberately sign out the temporary recovery session rather than
      // leaving the person signed in — they set a new password, so
      // signing back in with it (on an actual login screen, with the
      // success toast to confirm it worked) is the expected flow, not a
      // silent continuation via the reset-link session.
      await signOut()
      show('Password updated — please sign in with your new password.', 'success')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err.message || 'Failed to update password. Please try again.')
      setSubmitting(false)
    }
  }

  const logoBlock = (
    <div className="login-logo">
      <div className="login-logo-icon" style={{ background: 'transparent', padding: 0, width: 52, height: 52 }}>
        <img src={logo} alt="Logo" style={{ width: '120%', height: '120%', objectFit: 'contain' }} />
      </div>
      <div className="login-logo-text">
        <h1>Bulsu Infirmary</h1>
        <p>Clinic Services System</p>
      </div>
    </div>
  )

  // Still resolving the session from the URL (detectSessionInUrl) — avoid
  // flashing the "invalid link" state while that's still in flight.
  if (loading) {
    return (
      <>
        {logoBlock}
        <p className="sub" style={{ textAlign: 'center' }}>
          Verifying your reset link…
        </p>
      </>
    )
  }

  // Reached directly (no recovery token in the URL at all, an
  // already-used link, or an expired one) — Supabase never established a
  // session in that case, so there's nothing to act on here.
  if (!isPasswordRecovery) {
    return (
      <>
        {logoBlock}
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <AlertTriangleIcon width={32} height={32} style={{ color: 'var(--warning)', marginBottom: 10 }} />
          <h2 style={{ marginBottom: 6 }}>Link invalid or expired</h2>
          <p className="sub" style={{ marginBottom: 20 }}>
            {isAuthenticated
              ? "This page is only reachable from a password reset email link. You're already signed in — no need to reset your password from here."
              : 'This password reset link is invalid or has expired. Request a new one from the login page.'}
          </p>
          <button type="button" className="login-btn" onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}>
            {isAuthenticated ? 'Go to Dashboard' : 'Back to Login'}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      {logoBlock}
      <h2>Set a new password</h2>
      <p className="sub">Choose a new password for your account.</p>

      <div className={`login-error${error ? ' show' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {error && <AlertTriangleIcon width={13} height={13} style={{ flexShrink: 0 }} />} {error}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="login-field">
          <label htmlFor="rp-pass">New Password</label>
          <PasswordInput
            wrapperClassName="login-pw-wrap"
            inputClassName="login-input"
            toggleClassName="login-pw-toggle"
            id="rp-pass"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="login-field">
          <label htmlFor="rp-confirm">Confirm New Password</label>
          <PasswordInput
            wrapperClassName="login-pw-wrap"
            inputClassName="login-input"
            toggleClassName="login-pw-toggle"
            id="rp-confirm"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="login-btn" disabled={submitting}>
          {submitting ? (
            'Updating…'
          ) : (
            <>
              <LockIcon width={13} height={13} /> Set New Password
            </>
          )}
        </button>
      </form>

      <div className="login-hint">
        <p>
          <CheckCircleIcon width={12} height={12} style={{ verticalAlign: -1, marginRight: 4 }} />
          You'll be signed out and asked to log in again with your new password.
        </p>
      </div>
    </>
  )
}
