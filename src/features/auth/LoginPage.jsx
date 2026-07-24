import { lazy, Suspense, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import PasswordInput from '@components/ui/PasswordInput'
import EmergencyConfirmModal from '@features/emergency-alerts/EmergencyConfirmModal'
import EmergencySuccessOverlay from '@features/emergency-alerts/EmergencySuccessOverlay'
import logo from '@/assets/logo.png'
import { MailIcon, CreditCardIcon, AlertTriangleIcon, CheckCircleIcon, ShieldIcon, UserIcon } from '@components/ui/icons'

// Dev-only quick login. Deliberately has NO hardcoded fallback
// credentials — import.meta.env.DEV gating alone isn't a reliable
// guarantee that a literal password string won't end up somewhere in a
// production bundle (verified: it wasn't, in one build), so nothing
// sensitive-looking is embedded in this file at all. These buttons only
// appear, and only work, if a developer has set all three pairs of
// VITE_DEMO_*_EMAIL / VITE_DEMO_*_PASSWORD themselves in their own
// gitignored .env.local (see .env.example) — values that never leave
// that developer's own machine/build. See SETUP_GUIDE.md section 7.
const DEV_QUICK_LOGINS = import.meta.env.DEV
  ? [
      { label: 'Admin', Icon: ShieldIcon, email: import.meta.env.VITE_DEMO_ADMIN_EMAIL, password: import.meta.env.VITE_DEMO_ADMIN_PASSWORD },
      { label: 'Staff', Icon: UserIcon, email: import.meta.env.VITE_DEMO_STAFF_EMAIL, password: import.meta.env.VITE_DEMO_STAFF_PASSWORD },
      { label: 'Patient', Icon: UserIcon, email: import.meta.env.VITE_DEMO_PATIENT_EMAIL, password: import.meta.env.VITE_DEMO_PATIENT_PASSWORD },
    ].filter((a) => a.email && a.password)
  : []

// Lazy — jsQR is a sizable library that most visitors (anyone signing in
// with email/password, which is most people, most of the time) never
// need. Only fetched once someone actually clicks "Scan ID".
const QrLoginScan = lazy(() => import('./QrLoginScan'))
// Same idea — the multi-step registration form is a lot of markup most
// visitors (returning users, the common case) never need.
const RegisterModal = lazy(() => import('./RegisterModal'))
// Forgot-password is a small, rarely-clicked modal — no real bundle-size
// reason to defer it the same way, but consistent with the surrounding
// lazy pattern for auth-adjacent modals anyway.
const ForgotPasswordModal = lazy(() => import('./ForgotPasswordModal'))
// Same idea — the emergency report form (with its patient search) is only
// needed if someone actually confirms they want to file a report.
const EmergencyReportModal = lazy(() => import('@features/emergency-alerts/EmergencyReportModal'))

export default function LoginPage() {
  const { isAuthenticated, signIn } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState('password') // 'password' | 'scan'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [emgConfirmOpen, setEmgConfirmOpen] = useState(false)
  const [emgFormOpen, setEmgFormOpen] = useState(false)
  const [emgSuccess, setEmgSuccess] = useState(null)

  if (isAuthenticated) {
    const redirectTo = location.state?.from?.pathname || '/dashboard'
    return <Navigate to={redirectTo} replace />
  }

  function switchMode(next) {
    setError('')
    setInfo('')
    setMode(next)
  }

  function handleIdentified(foundEmail) {
    setEmail(foundEmail)
    setError('')
    setInfo(`Identified account for ${foundEmail} — enter your password to continue.`)
    setMode('password')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
    } catch {
      setError('Invalid email or password.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleQuickLogin(account) {
    setError('')
    setSubmitting(true)
    try {
      await signIn(account.email, account.password)
    } catch {
      setError(`Quick login failed — no seeded ${account.label} account matches ${account.email} / the expected password. See SETUP_GUIDE.md section 7.`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="login-logo">
        <div className="login-logo-icon" style={{ background: 'transparent', padding: 0, width: 52, height: 52 }}>
          <img src={logo} alt="Logo" style={{ width: '120%', height: '120%', objectFit: 'contain' }} />
        </div>
        <div className="login-logo-text">
          <h1>Bulsu Meneses Infirmary</h1>
          <p>Clinic Services</p>
        </div>
        <button type="button" className="emg-login-header-btn" title="Send Emergency Alert" onClick={() => setEmgConfirmOpen(true)}>
          <span className="sos-label">SOS</span>
        </button>
      </div>

      <h2>Welcome back</h2>
      <p className="sub">Sign in with your registered email, or scan your school ID</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" className={`btn btn-sm ${mode === 'password' ? 'btn-blue' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => switchMode('password')}>
          <MailIcon width={13} height={13} /> Email &amp; Password
        </button>
        <button type="button" className={`btn btn-sm ${mode === 'scan' ? 'btn-blue' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => switchMode('scan')}>
          <CreditCardIcon width={13} height={13} /> Scan ID
        </button>
      </div>

      {error && (
  <div className="login-error show" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <AlertTriangleIcon width={13} height={13} style={{ flexShrink: 0 }} /> {error}
  </div>
)}
      {info && !error && (
        <div className="alert alert-success" style={{ marginBottom: 14, fontSize: 12.5 }}>
          <CheckCircleIcon width={13} height={13} /> {info}
        </div>
      )}

      {import.meta.env.DEV && DEV_QUICK_LOGINS.length > 0 && (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase' }}>
            Dev Quick Login — not shown in production
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {DEV_QUICK_LOGINS.map((account) => (
              <button
                key={account.label}
                type="button"
                className="btn btn-sm btn-outline"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                onClick={() => handleQuickLogin(account)}
                disabled={submitting}
              >
                <account.Icon width={13} height={13} /> {account.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'password' ? (
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="l-email">Email Address</label>
            <input
              id="l-email"
              type="email"
              className="login-input"
              placeholder="Enter your Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="login-field">
            <label htmlFor="l-pass">Password</label>
            <PasswordInput
              wrapperClassName="login-pw-wrap"
              inputClassName="login-input"
              toggleClassName="login-pw-toggle"
              id="l-pass"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div style={{ textAlign: 'right', marginTop: 6 }}>
              <a onClick={() => setForgotOpen(true)} style={{ fontSize: 12.5, cursor: 'pointer' }}>
                Forgot password?
              </a>
            </div>
          </div>
          <button type="submit" className="login-btn" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>
      ) : (
        <Suspense fallback={<div style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)', fontSize: 12 }}>Loading scanner…</div>}>
          <QrLoginScan onIdentified={handleIdentified} onError={setError} />
        </Suspense>
      )}

      {mode === 'password' && (
        <div className="login-register-link">
          Don&apos;t have an account? <a onClick={() => setRegisterOpen(true)}>Register here</a>
        </div>
      )}

     

      {registerOpen && (
        <Suspense fallback={null}>
          <RegisterModal isOpen={registerOpen} onClose={() => setRegisterOpen(false)} />
        </Suspense>
      )}

      {forgotOpen && (
        <Suspense fallback={null}>
          <ForgotPasswordModal isOpen={forgotOpen} onClose={() => setForgotOpen(false)} />
        </Suspense>
      )}

      <EmergencyConfirmModal
        isOpen={emgConfirmOpen}
        onCancel={() => setEmgConfirmOpen(false)}
        onProceed={() => {
          setEmgConfirmOpen(false)
          setEmgFormOpen(true)
        }}
      />

      {emgFormOpen && (
        <Suspense fallback={null}>
          <EmergencyReportModal
            isOpen={emgFormOpen}
            profile={null}
            onClose={() => setEmgFormOpen(false)}
            onError={setError}
            onSuccess={(name, loc) => setEmgSuccess({ name, location: loc })}
          />
        </Suspense>
      )}

      <EmergencySuccessOverlay result={emgSuccess} onClose={() => setEmgSuccess(null)} />
    </>
  )
}
