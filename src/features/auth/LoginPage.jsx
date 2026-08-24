import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { disableAccountAfterLockout, checkAccountActive, getRoleByEmail } from '@services/usersService'
import { setRememberMe as persistRememberMeChoice } from '@services/supabaseClient'
import PasswordInput from '@components/ui/PasswordInput'
import EmergencyConfirmModal from '@features/emergency-alerts/EmergencyConfirmModal'
import EmergencySuccessOverlay from '@features/emergency-alerts/EmergencySuccessOverlay'
import logo from '@/assets/logo.png'
import { MailIcon, CreditCardIcon, AlertTriangleIcon, CheckCircleIcon, ShieldIcon, UserIcon } from '@components/ui/icons'

// Mirrors the `roles` restrictions declared per-route in AppRoutes.jsx —
// duplicated here (rather than imported) because AppRoutes.jsx isn't a
// data source, just JSX; any route NOT listed here is open to every
// authenticated role (dashboard, profile), matching the "no roles prop"
// default there. Used below so the post-login redirect never sends
// someone back to a page their role can't actually see — landing there
// straight out of a successful login is what was producing an
// immediate, confusing "Access denied" right after signing in.
const ROLE_RESTRICTED_ROUTES = {
  '/patients': ['admin', 'staff'],
  '/document-requests': ['admin', 'staff'],
  '/inventory': ['admin', 'staff'],
  '/reports': ['admin', 'staff'],
  '/emergency-alerts': ['admin', 'staff'],
  '/consultation': ['staff'],
  '/maintenance': ['admin'],
  '/my-requests': ['patient'],
  '/chatbot': ['patient'],
}

function isRouteAllowedForRole(pathname, role) {
  const allowedRoles = ROLE_RESTRICTED_ROUTES[pathname]
  return !allowedRoles || allowedRoles.includes(role)
}

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

// Client-side login-attempt limiter. Tracked per-email in localStorage so
// it survives a page reload — NOT a real server-side brute-force guard
// (clearing site data resets it), just a practical deterrent in the UI.
// Enforcement of the actual account-disable lives server-side (migration
// 024's RPCs, called from here + checked in AuthContext.signIn), so even
// if someone clears localStorage to reset their own local counter, an
// already-disabled account still can't sign back in.
//
// Two tiers, tracked as `phase` in the stored record:
//   Tier 1 ('tier1') — up to TIER1_ATTEMPTS (5) wrong passwords. On the
//     5th, input locks for a LOCKOUT_MS (60s) countdown, then moves into
//     Tier 2 with a fresh count.
//   Tier 2 ('tier2') — up to TIER2_ATTEMPTS (10) MORE wrong passwords
//     after the countdown. On the 10th, the account itself is disabled
//     (server-side, via disableAccountAfterLockout) and can't sign in
//     again until an admin re-enables it in Maintenance -> User
//     Management (the existing Activate/Deactivate toggle).
const TIER1_ATTEMPTS = 5
const TIER2_ATTEMPTS = 10
const LOCKOUT_MS = 60_000 // 1 minute

function attemptsKey(email) {
  return `loginAttempts:${email.trim().toLowerCase()}`
}
function getAttempts(email) {
  try {
    return JSON.parse(localStorage.getItem(attemptsKey(email))) || { phase: 'tier1', count: 0, lockUntil: 0 }
  } catch {
    return { phase: 'tier1', count: 0, lockUntil: 0 }
  }
}
function setAttempts(email, data) {
  localStorage.setItem(attemptsKey(email), JSON.stringify(data))
}
function clearAttempts(email) {
  localStorage.removeItem(attemptsKey(email))
}

// Lazy — jsQR is a sizable library that most visitors (anyone signing in
// with email/password, which is most people, most of the time) never
// need. Only fetched once someone actually clicks "Scan ID".
const QrLoginScan = lazy(() => import('./QrLoginScan'))
// Forgot-password is a small, rarely-clicked modal — no real bundle-size
// reason to defer it the same way, but consistent with the surrounding
// lazy pattern for auth-adjacent modals anyway.
const ForgotPasswordModal = lazy(() => import('./ForgotPasswordModal'))
// Same idea — the emergency report form (with its patient search) is only
// needed if someone actually confirms they want to file a report.
const EmergencyReportModal = lazy(() => import('@features/emergency-alerts/EmergencyReportModal'))

export default function LoginPage() {
  const { isAuthenticated, role, signIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mode, setMode] = useState('password') // 'password' | 'scan'
  // Seeded directly from router state (not via an Effect) when arriving
  // here right after a successful sign-up on the separate /register route
  // — see RegisterPage's onRegistered, which navigates here with
  // { registeredEmail, registeredMessage }. That state is already present
  // on this component's very first render (RegisterPage navigates before
  // LoginPage mounts), so reading it into useState's lazy initializer here
  // avoids needing a setState call inside an Effect at all.
  const [email, setEmail] = useState(() => location.state?.registeredEmail || '')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState(() => location.state?.registeredMessage || '')
  const [submitting, setSubmitting] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [emgConfirmOpen, setEmgConfirmOpen] = useState(false)
  const [emgFormOpen, setEmgFormOpen] = useState(false)
  const [emgSuccess, setEmgSuccess] = useState(null)
  const [lockUntil, setLockUntil] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (!lockUntil) return
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining <= 0) setLockUntil(0)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lockUntil])

  // Clears the router state that carried registeredEmail/registeredMessage
  // (already read directly into email/info's useState initializers above)
  // so a page refresh or the browser back button doesn't keep re-delivering
  // the same success message. Runs once on mount only, and deliberately
  // calls ONLY navigate() here — no setState — since synchronously calling
  // a state setter inside an Effect is exactly the cascading-render pattern
  // the react-hooks/set-state-in-effect rule flags; reading the state
  // straight into the initializers above sidesteps that entirely.
  useEffect(() => {
    if (location.state?.registeredEmail || location.state?.registeredMessage) {
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isAuthenticated) {
    const fromPath = location.state?.from?.pathname
    const redirectTo = fromPath && isRouteAllowedForRole(fromPath, role) ? fromPath : '/dashboard'
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

    // Checked first, before anything else. An already-disabled account
    // must show this same message every time, no matter what password
    // was typed — Supabase Auth itself has no concept of `is_active`, so
    // a wrong password on a disabled account looks identical to any
    // other wrong password unless this is checked upfront. Without this,
    // retrying with the SAME email just falls back into ordinary
    // "Invalid email or password, N attempts left" counting (the
    // localStorage record was already cleared when the account got
    // disabled), which made it look like the only way forward was to
    // try a different email entirely — it isn't; the account is still
    // there, it just needs an admin to re-enable it.
    try {
      const active = await checkAccountActive(email)
      if (active === false) {
        setError('Invalid email or password. Your account is disabled — contact admin.')
        return
      }
    } catch {
      // Unknown email, RPC hiccup, etc. — fall through to the normal
      // sign-in flow below instead of blocking on an inconclusive check.
    }

    const record = getAttempts(email)
    if (record.lockUntil && Date.now() < record.lockUntil) {
      setLockUntil(record.lockUntil)
      setError(`Too many failed attempts. Try again in ${Math.ceil((record.lockUntil - Date.now()) / 1000)}s.`)
      return
    }

    setSubmitting(true)
    try {
      // Trim + lowercase before the real auth call — Supabase stores/
      // matches emails case-insensitively on the backend, but the input
      // here was still being passed through with whatever casing the
      // person typed (e.g. "Nurse@clinic.edu"), which could mismatch an
      // account whose email was normalized to lowercase at creation time
      // (see createUserProfile()/RegisterModal.jsx, which both already
      // lowercase). getAttempts()/clearAttempts() below already
      // normalize for the lockout tracker; the actual signIn() call
      // needs the same normalization, not just a matching lockout key.
      const normalizedEmail = email.trim().toLowerCase()
      persistRememberMeChoice(rememberMe)
      await signIn(normalizedEmail, password)
      clearAttempts(email)
      setLockUntil(0)
    } catch (err) {
      if (err.message === 'ACCOUNT_DISABLED') {
        clearAttempts(email)
        setLockUntil(0)
        setError('Invalid email or password. Your account is disabled — contact admin.')
      } else {
        // Admin accounts are exempt from the entire lockout/disable
        // escalation below — see getRoleByEmail's doc comment in
        // usersService.js for why (only an admin can undo a disable, so
        // letting this system disable the only admin is a real
        // denial-of-service risk).
        //
        // This same lookup also tells us whether the email is
        // registered at all — reused here rather than a second RPC
        // call. Three distinct outcomes matter:
        //   - role is a real string (admin/staff/patient) → account
        //     exists, proceed with normal counting below
        //   - role === null → confirmed NOT registered. Shown as its
        //     own message and explicitly does NOT count toward the
        //     lockout — there's nothing to brute-force against an
        //     account that doesn't exist.
        //     Security tradeoff, stated plainly: this does let someone
        //     probe which emails have accounts by watching which
        //     response comes back (account enumeration) — the more
        //     conservative default most login systems use is an
        //     identical generic error either way, specifically to
        //     avoid this. Implemented as requested regardless.
        //   - role === undefined → the lookup itself failed (network
        //     hiccup, etc.), not a confirmed answer either way. Falls
        //     through to normal counting rather than skipping it —
        //     treating "unknown" as "not registered" would let anyone
        //     dodge the lockout just by causing this lookup to error.
        let role
        try {
          role = await getRoleByEmail(email)
        } catch {
          role = undefined
        }

        if (role === null) {
          setError('This account is not registered. Please register first.')
          return
        }

        if (role === 'admin') {
          setError('Invalid email or password.')
          return
        }

        const phase = record.phase === 'tier2' ? 'tier2' : 'tier1'
        const nextCount = (record.count || 0) + 1

        if (phase === 'tier1') {
          if (nextCount >= TIER1_ATTEMPTS) {
            // 5th wrong attempt — lock input for 60s, then move into
            // Tier 2 with a fresh count for the next round of attempts.
            const until = Date.now() + LOCKOUT_MS
            setAttempts(email, { phase: 'tier2', count: 0, lockUntil: until })
            setLockUntil(until)
            setError(`Too many failed attempts. Try again in ${Math.ceil(LOCKOUT_MS / 1000)}s.`)
          } else {
            setAttempts(email, { phase: 'tier1', count: nextCount, lockUntil: 0 })
            setError(`Invalid email or password. ${TIER1_ATTEMPTS - nextCount} attempt(s) left before temporary lockout.`)
          }
        } else {
          if (nextCount >= TIER2_ATTEMPTS) {
            // 10th wrong attempt in Tier 2 — disable the account
            // server-side. Best-effort: even if the RPC call itself
            // fails (offline, etc.), still show the disabled message and
            // stop counting rather than looping forever.
            try {
              await disableAccountAfterLockout(email)
            } catch {
              // ignore — see comment above
            }
            clearAttempts(email)
            setLockUntil(0)
            setError('Invalid email or password. Your account is disabled — contact admin.')
          } else {
            setAttempts(email, { phase: 'tier2', count: nextCount, lockUntil: 0 })
            setError(`Invalid email or password. ${TIER2_ATTEMPTS - nextCount} attempt(s) left before your account is disabled.`)
          }
        }
      }
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

  const isLocked = lockUntil > 0

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
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError('')
              }}
              required
              style={error ? { borderColor: '#EF4444' } : undefined}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <label className="login-remember-me" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer', color: '#B4A89E' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
                Remember me
              </label>
              <button type="button" className="login-forgot-link" onClick={() => setForgotOpen(true)} style={{ fontSize: 12.5, cursor: 'pointer' }}>
                Forgot password?
              </button>
            </div>
          </div>
          <button type="submit" className="login-btn" disabled={submitting || isLocked}>
            {submitting ? 'Signing in…' : isLocked ? `Locked — ${secondsLeft}s` : 'Sign In →'}
          </button>
        </form>
      ) : (
        <Suspense fallback={<div style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)', fontSize: 12 }}>Loading scanner…</div>}>
          <QrLoginScan onIdentified={handleIdentified} onError={setError} />
        </Suspense>
      )}

      {mode === 'password' && (
        <div className="login-register-link">
          Don&apos;t have an account? <button type="button" onClick={() => navigate('/register')}>Register here</button>
        </div>
      )}

      {forgotOpen && (
        <Suspense fallback={null}>
          <ForgotPasswordModal isOpen={forgotOpen} onClose={() => setForgotOpen(false)} initialEmail={email} />
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