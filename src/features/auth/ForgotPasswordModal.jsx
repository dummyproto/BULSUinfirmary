import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { useAuth } from '@context/AuthContext'
import { LockIcon, CheckCircleIcon, AlertTriangleIcon } from '@components/ui/icons'

export default function ForgotPasswordModal({ isOpen, onClose }) {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  function handleClose() {
    // Reset for next time it's opened, but only after the close
    // animation/unmount — no visible flash of the form underneath the
    // success state.
    setEmail('')
    setError('')
    setSent(false)
    setSubmitting(false)
    onClose()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await requestPasswordReset(email.trim())
      // Deliberately the same message regardless of whether the email
      // actually matches an account — never confirm/deny account
      // existence to whoever's typing in this form.
      setSent(true)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
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
        <button type="button" className="btn btn-outline" onClick={handleClose}>
          {sent ? 'Close' : 'Cancel'}
        </button>
      }
    >
      {sent ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '10px 0', textAlign: 'center' }}>
          <CheckCircleIcon width={32} height={32} style={{ color: 'var(--success)' }} />
          <p style={{ margin: 0, fontSize: 13.5 }}>
            If an account exists for <strong>{email}</strong>, we've sent a password reset link. Check your inbox (and spam folder) — the link is valid for a limited time.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <p style={{ marginTop: 0, fontSize: 13, color: 'var(--text-2)' }}>Enter your account's email address and we'll send you a link to reset your password.</p>
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
              placeholder="you@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-blue" style={{ width: '100%', marginTop: 6 }} disabled={submitting}>
            {submitting ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>
      )}
    </Modal>
  )
}
