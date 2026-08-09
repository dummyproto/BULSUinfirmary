import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { ClockIcon } from '@components/ui/icons'

// 1 hour of no activity before sign-out; the warning modal appears 60
// seconds before that actually happens, so the real "do nothing and get
// logged out" point is IDLE_LIMIT_MS, not IDLE_LIMIT_MS + WARNING_MS.
const IDLE_LIMIT_MS = 60 * 60 * 1000
const WARNING_MS = 60 * 1000
const WARNING_AT_MS = IDLE_LIMIT_MS - WARNING_MS

// How often the poll below checks elapsed time. Deliberately short (not
// a single long setTimeout for the full hour) — see the big comment on
// the effect below for why that distinction actually matters here.
const POLL_MS = 5_000

// Activity signals that count as "still here" — deliberately broad
// (mouse, keyboard, touch, scroll) so this never fires while someone is
// actively reading a long consultation note or filling out a form with
// long pauses between keystrokes, as long as SOME input happens.
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel']

/**
 * Mounted once in AppShell (so only for authenticated routes — logged-out
 * visitors on /login have nothing to time out). Purely a background
 * timer + the warning modal; sign-in/out itself still goes entirely
 * through AuthContext, this just decides *when* to call signOut().
 */
export default function SessionTimeoutManager() {
  const { isAuthenticated, signOut } = useAuth()
  const navigate = useNavigate()
  const [secondsLeft, setSecondsLeft] = useState(null) // null = warning not showing

  const lastActivityRef = useRef(null)
  const loggedOutRef = useRef(false)

  const handleSignOut = useCallback(async () => {
    if (loggedOutRef.current) return
    loggedOutRef.current = true
    setSecondsLeft(null)
    try {
      await signOut()
    } finally {
      // Land on /login even if signOut() itself throws (e.g. already
      // expired server-side) — the person still needs to be moved off
      // whatever protected page they were idling on.
      navigate('/login', { replace: true })
    }
  }, [signOut, navigate])

  // "Still here" — dismisses the warning and resets the idle clock.
  const stayActive = useCallback(() => {
    lastActivityRef.current = Date.now()
    setSecondsLeft(null)
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      loggedOutRef.current = false
      return undefined
    }

    lastActivityRef.current = Date.now()
    loggedOutRef.current = false

    // Cheap throttle on the activity listeners themselves — a raw
    // mousemove firing on every pixel of movement would be wasteful.
    let throttled = false
    const onActivity = () => {
      if (throttled) return
      throttled = true
      setTimeout(() => {
        throttled = false
      }, 1000)
      lastActivityRef.current = Date.now()
      // Any real activity while the warning is showing dismisses it —
      // same effect as clicking the Stay Signed In button.
      setSecondsLeft((s) => (s === null ? null : null))
    }
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }))

    // Polling elapsed real time (Date.now() - lastActivityRef.current) on
    // a short interval, rather than pre-scheduling one setTimeout for 59
    // minutes and another for 60 — a single long-duration setTimeout is
    // NOT reliable here. Browsers throttle timers heavily in background/
    // unfocused tabs (Chrome's intensive throttling can delay them far
    // past their nominal duration), and a sleeping laptop pauses JS
    // execution entirely, so a 1-hour setTimeout set right before the
    // tab is backgrounded or the machine sleeps may fire very late or,
    // in practice, not usefully at all. Each poll tick uses Date.now(),
    // real wall-clock time unaffected by timer throttling, so even if a
    // tick itself gets delayed, the very next one that does run still
    // computes the correct elapsed idle time and reacts immediately
    // instead of having missed the moment entirely.
    const intervalId = setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current
      if (idleFor >= IDLE_LIMIT_MS) {
        handleSignOut()
      } else if (idleFor >= WARNING_AT_MS) {
        setSecondsLeft(Math.max(0, Math.ceil((IDLE_LIMIT_MS - idleFor) / 1000)))
      } else {
        setSecondsLeft(null)
      }
    }, POLL_MS)

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity))
      clearInterval(intervalId)
    }
  }, [isAuthenticated, handleSignOut])

  if (!isAuthenticated || secondsLeft === null) return null

  return (
    <div className="modal-overlay open" style={{ zIndex: 9999 }}>
      <div className="modal open" role="alertdialog" aria-modal="true" aria-label="Session expiring">
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClockIcon width={16} height={16} /> Session Expiring
          </h3>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)', margin: 0 }}>
            You've been inactive for a while. For your security, you'll be signed out in{' '}
            <strong style={{ color: 'var(--danger)' }}>{secondsLeft}s</strong> unless you stay active.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={handleSignOut}>
            Sign Out Now
          </button>
          <button type="button" className="btn btn-blue" onClick={stayActive}>
            Stay Signed In
          </button>
        </div>
      </div>
    </div>
  )
}