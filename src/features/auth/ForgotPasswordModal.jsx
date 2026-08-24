import { useEffect, useState } from 'react'
import Modal from '@components/ui/Modal'
import { useAuth } from '@context/AuthContext'
import PasswordInput from '@components/ui/PasswordInput'
import { validatePassword } from '@features/maintenance/lib/userHelpers'
import { checkEmailRegistered } from '@services/usersService'
import { LockIcon, CheckCircleIcon, AlertTriangleIcon, MailIcon } from '@components/ui/icons'

// Send Code / Resend rate limit — 60s between actual sends, per email,
// same duration LoginPage.jsx's own login lockout uses for a consistent
// feel across the app. Persisted to localStorage (not just component
// state) so it survives closing/reopening this modal or reloading the
// page — an in-memory-only cooldown would be trivially bypassed just by
// closing and reopening, which would defeat the entire point of a rate
// limit. Keyed per email (like LoginPage's attemptsKey) rather than
// globally, so typing a different email isn't blocked by someone else's
// recent request on this same browser.
const RESEND_COOLDOWN_MS = 60_000

function cooldownKey(email) {
  return `forgotPasswordCooldown:${email.trim().toLowerCase()}`
}
function getCooldownUntil(email) {
  if (!email.trim()) return 0
  const raw = Number(localStorage.getItem(cooldownKey(email)))
  return Number.isFinite(raw) ? raw : 0
}
function setCooldownUntilStorage(email, until) {
  if (!email.trim()) return
  localStorage.setItem(cooldownKey(email), String(until))
}

export default function ForgotPasswordModal({ isOpen, onClose, initialEmail = '' }) {
  const { requestPasswordReset, verifyRecoveryOtp, completePasswordReset, signOut } = useAuth()
  const [step, setStep] = useState('email') // 'email' | 'verify' | 'done'
  const [email, setEmail] = useState(initialEmail)
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
const [confirm, setConfirm] = useState('')
const [submitting, setSubmitting] = useState(false)
const [error, setError] = useState('')
const [cooldownUntil, setCooldownUntil] = useState(() => getCooldownUntil(initialEmail))
const [cooldownLeft, setCooldownLeft] = useState(0)

const passwordValid = password ? validatePassword(password).ok : null
const confirmValid = confirm ? confirm === password && passwordValid : null

  // Ticks the cooldown countdown once a second — the same interval
  // pattern LoginPage.jsx uses for its own lockUntil/secondsLeft. This is
  // a genuine side effect (a timer), unlike the setEmail-on-prop-change
  // case below — that one's handled during render instead specifically
  // because it was just reacting to a prop change, which isn't what this
  // is.
  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownLeft(0)
      return undefined
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
      setCooldownLeft(remaining)
      if (remaining <= 0) setCooldownUntil(0)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [cooldownUntil])

  // Adjusting state during render (React's own recommended pattern for
  // "reset state when a prop changes") instead of a useEffect that calls
  // setEmail — this modal stays mounted between opens (LoginPage just
  // toggles `isOpen`, it doesn't remount the component), so email needs
  // re-syncing to whatever's currently in the Login page's email field
  // every time the modal opens, not just the first time it ever mounted.
  // Doing this in an effect works too, but runs AFTER the render commits
  // — briefly showing the old/empty email, then flicking to the new one
  // a moment later, and triggers an extra full re-render besides. Doing
  // it here means React sees the setEmail call before this render is
  // ever painted to the screen, so it never shows the stale value at
  // all and never causes a visible extra render.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setEmail(initialEmail)
      // Restores this email's own cooldown (if any) fresh every time the
      // modal opens — otherwise reopening right after closing would show
      // "Send Code" as available again even mid-cooldown, since the
      // component's own state doesn't persist across a close/reopen on
      // its own (only localStorage does).
      setCooldownUntil(getCooldownUntil(initialEmail))
    }
  }

  function reset() {
    setStep('email')
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
    const trimmedEmail = email.trim()
    // Defensive re-check against localStorage, not just the disabled
    // button — covers the Resend link on the verify step reusing this
    // same function, and any stale cooldown left over from a previous
    // handleSendCode call for a DIFFERENT email since typed over.
    const activeCooldown = getCooldownUntil(trimmedEmail)
    if (activeCooldown > Date.now()) {
      setCooldownUntil(activeCooldown)
      setError(`Please wait ${Math.ceil((activeCooldown - Date.now()) / 1000)}s before requesting another code.`)
      return
    }
    setSubmitting(true)
    try {
      // Supabase's own resetPasswordForEmail() deliberately never reveals
      // whether an email is registered — it always "succeeds" either way,
      // as an anti-enumeration measure. That's normally the right call,
      // but this app explicitly wants the opposite here: stop and tell
      // the person outright if there's no account for what they typed,
      // rather than silently sending them on to a code-entry screen for
      // a code that will never arrive. checkEmailRegistered() is a
      // separate, deliberate check made for exactly this — see its own
      // comment in usersService.js for why requestPasswordReset can't do
      // this check on its own.
      const registered = await checkEmailRegistered(trimmedEmail)
      if (!registered) {
        // No cooldown started here — nothing was actually sent, so
        // there's nothing to rate-limit yet for this email specifically.
        setError('No account found with that email address.')
        return
      }
      await requestPasswordReset(trimmedEmail)
      const until = Date.now() + RESEND_COOLDOWN_MS
      setCooldownUntilStorage(trimmedEmail, until)
      setCooldownUntil(until)
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
          <p style={{ marginTop: 0, marginBottom: 16, fontSize: 13, color: 'var(--text-2)' }}>
            The password reset code will be sent to this email address. Please verify that the email address is correct.
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
          <button type="submit" className="btn btn-blue" style={{ width: '100%', marginTop: 6 }} disabled={submitting || cooldownLeft > 0}>
            {submitting ? 'Sending…' : cooldownLeft > 0 ? `Resend in ${cooldownLeft}s` : 'Send Code'}
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
              disabled={submitting || cooldownLeft > 0}
              style={{
                fontSize: 12,
                cursor: submitting || cooldownLeft > 0 ? 'not-allowed' : 'pointer',
                opacity: cooldownLeft > 0 ? 0.6 : 1,
                background: 'none',
                border: 'none',
                color: 'inherit',
                textDecoration: 'none',
                padding: 0,
                font: 'inherit',
              }}
            >
              {cooldownLeft > 0 ? `Didn't get a code? Resend in ${cooldownLeft}s` : "Didn't get a code? Resend"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}