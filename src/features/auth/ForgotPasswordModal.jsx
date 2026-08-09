import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { useAuth } from '@context/AuthContext'
import PasswordInput from '@components/ui/PasswordInput'
import { validatePassword } from '@features/maintenance/lib/userHelpers'
import { LockIcon, CheckCircleIcon, AlertTriangleIcon, MailIcon } from '@components/ui/icons'

export default function ForgotPasswordModal({ isOpen, onClose }) {
  const { requestPasswordReset, verifyRecoveryOtp, completePasswordReset, signOut } = useAuth()
  const [step, setStep] = useState('email') // 'email' | 'verify' | 'done'
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
const [confirm, setConfirm] = useState('')
const [submitting, setSubmitting] = useState(false)
const [error, setError] = useState('')

const passwordValid = password ? validatePassword(password).ok : null
const confirmValid = confirm ? confirm === password && passwordValid : null
  function reset() {
    setStep('email')
    setEmail('')
    setOtp('')
    setPassword('')
    setConfirm('')
    setError('')
    setSubmitting(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSendCode(e) {
    e?.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await requestPasswordReset(email.trim())
      setStep('verify')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerifyAndReset(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{4,10}$/.test(otp.trim())) return setError('Enter the code exactly as emailed to you.')
    const check = validatePassword(password)
    if (!check.ok) return setError(check.msg)
    if (password !== confirm) return setError('Passwords do not match.')

    setSubmitting(true)
    try {
      await verifyRecoveryOtp(email.trim(), otp.trim())
      await completePasswordReset(password)
      await signOut()
      setStep('done')
    } catch (err) {
      setError(err.message || 'Invalid or expired code. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Reset your password"
      icon={<LockIcon width={16} height={16} />}
      actions={
        step === 'verify' ? (
          <button type="button" className="btn btn-outline" onClick={() => setStep('email')}>
            Back
          </button>
        ) : (
          <button type="button" className="btn btn-outline" onClick={handleClose}>
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>
        )
      }
    >
      {step === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '10px 0', textAlign: 'center' }}>
          <CheckCircleIcon width={32} height={32} style={{ color: 'var(--success)' }} />
          <p style={{ margin: 0, fontSize: 13.5 }}>Your password has been updated. Please sign in again with your new password.</p>
        </div>
      )}

      {step === 'email' && (
        <form onSubmit={handleSendCode}>
          <p style={{ marginTop: 0, fontSize: 13, color: 'var(--text-2)' }}>
            Enter your account's email address and we'll send you a code to reset your password.
          </p>
          {error && (
            <div className="login-error show" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <AlertTriangleIcon width={13} height={13} style={{ flexShrink: 0 }} /> {error}
            </div>
          )}
          <div className="form-group">
            <label htmlFor="fp-email">Email Address</label>
            <input
              id="fp-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-blue" style={{ width: '100%', marginTop: 6 }} disabled={submitting}>
            {submitting ? 'Sending…' : 'Send Code'}
          </button>
        </form>
      )}

      {step === 'verify' && (
        <form onSubmit={handleVerifyAndReset}>
          <p style={{ marginTop: 0, marginBottom: 18, fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.5 }}>
            <MailIcon width={13} height={13} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              We sent a code to <strong>{email}</strong>. Check your inbox (and spam folder) — it expires shortly.
            </span>
          </p>
          {error && (
            <div className="login-error show" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <AlertTriangleIcon width={13} height={13} style={{ flexShrink: 0 }} /> {error}
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label htmlFor="fp-otp">Verification Code</label>
            <input
              id="fp-otp"
              type="text"
              inputMode="numeric"
              className="form-input"
              placeholder="Enter the 8-digit code"
              maxLength={10}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 10))}
              required
              autoFocus
              style={{ letterSpacing: '.2em', textAlign: 'center', fontSize: 18 }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label htmlFor="fp-pass">New Password</label>
            <PasswordInput
            wrapperClassName="pw-wrapper"
            inputClassName="form-input"
            toggleClassName="pw-toggle"
            id="fp-pass"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={passwordValid === null ? undefined : { borderColor: passwordValid ? '#22C55E' : '#EF4444' }}
          />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label htmlFor="fp-confirm">Confirm New Password</label>
            <PasswordInput
              wrapperClassName="pw-wrapper"
              inputClassName="form-input"
              toggleClassName="pw-toggle"
              id="fp-confirm"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              style={confirmValid === null ? undefined : { borderColor: confirmValid ? '#22C55E' : '#EF4444' }}
            />
          </div>
          <button type="submit" className="btn btn-blue" style={{ width: '100%', marginTop: 6 }} disabled={submitting}>
            {submitting ? 'Verifying…' : 'Verify & Set New Password'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button
              type="button"
              onClick={handleSendCode}
              style={{ fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', textDecoration: 'none', padding: 0, font: 'inherit' }}
            >
              Didn't get a code? Resend
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}