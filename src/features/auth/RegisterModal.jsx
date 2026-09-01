import { lazy, Suspense, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { COURSES, YEAR_LEVELS } from '@features/maintenance/data/formOptions'
import SearchableSelect from '@components/ui/SearchableSelect'
import { validatePassword } from '@features/maintenance/lib/userHelpers'
import { registerPatient, checkStudentNumberRegistered } from '@services/usersService'
import { notify } from '@services/notificationsService'
import { supabase } from '@services/supabaseClient'
import PasswordInput from '@components/ui/PasswordInput'
import { AlertTriangleIcon, MailIcon, CreditCardIcon } from '@components/ui/icons'
import { capitalizeWords } from '@lib/format'
import { prefetchOnIdle } from '@routes/prefetchRoutes'

import { formatUserNumber } from '@lib/format'

// Lazy — same reasoning as QrLoginScan's lazy import in LoginPage.jsx:
// jsQR is a sizable library most people opening the register modal (the
// "fill in manually" path, still the default) never need.
const RegisterQrScan = lazy(() => import('./RegisterQrScan'))

/**
 * Best-effort match of a scanned QR value against a fixed dropdown option
 * list (COURSES / YEAR_LEVELS). The register form binds `course`/`year` to
 * a `<select>`, which only renders correctly for an EXACT option string —
 * so a scanned value that doesn't match anything is left blank (forcing a
 * manual pick) rather than silently setting an invalid/invisible selection.
 * Case-insensitive exact match first; for year level only, also accepts a
 * bare leading digit (e.g. "1" or "1st") matching an option that starts
 * with the same digit, since that's a common QR encoding for year level.
 */
function matchOption(value, options) {
  const v = String(value || '').trim()
  if (!v) return ''
  const exact = options.find((o) => o.toLowerCase() === v.toLowerCase())
  if (exact) return exact
  const digit = v.match(/^(\d)/)?.[1]
  if (digit) {
    const byDigit = options.find((o) => o.startsWith(digit))
    if (byDigit) return byDigit
  }
  return ''
}

// Phase Q additions: `qrCode` is the normalized code to claim on
// successful submission (Phase 4); `profileIncomplete` is set by the
// Step 2 skip path; `prefilledFromQr` only controls the "double-check"
// banner on Step 1. Bookkeeping, not fields the person types into directly.
const EMPTY = {
  firstName: '',
  lastName: '',
  fullName: '',
  userId: '',
  phone: '',
  course: '',
  year: '',
  email: '',
  username: '',
  password: '',
  confirm: '',
  qrCode: '',
  profileIncomplete: false,
  prefilledFromQr: false,
}

// Persists an in-progress registration form across the modal being
// closed/unmounted — the X button, backdrop click, "Sign in here",
// navigating away, or a full browser refresh — so an accidental exit
// never loses what was already typed. localStorage (not sessionStorage)
// specifically so it survives a hard refresh reliably; it's only ever
// cleared explicitly, via clearDraft() once registration succeeds.
const DRAFT_KEY = 'bulsu_register_draft'

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveDraft(data) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
  } catch {
    // Storage full/unavailable (e.g. private browsing) — draft persistence
    // is a nice-to-have, never worth breaking registration over.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Nothing to clean up if storage isn't available.
  }
}

// Exposed so AuthContext.jsx's signOut() can wipe any abandoned
// registration draft on logout — otherwise this survives (by design,
// for surviving an accidental refresh/close mid-registration) all the
// way through an entirely unrelated login/logout cycle, resurfacing
// stale half-filled data long after it should have been forgotten. Kept
// as a thin re-export of the same private clearDraft() this file
// already uses internally, so there's only one place that knows the
// actual storage key.
// eslint-disable-next-line react-refresh/only-export-components
export function clearRegistrationDraft() {
  clearDraft()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', clearDraft)
}

function strengthOf(pw) {
  if (!pw) return { scale: 0, color: 'transparent', text: '' }

  let score = 0
  // Length carries the most real-world weight — each threshold crossed
  // adds a point, so a long password scores higher even with a narrower
  // character set.
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (pw.length >= 16) score++
  // Character variety — each type present adds one point, so mixing
  // types (not just length) genuinely moves the needle.
  if (/[a-z]/.test(pw)) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  // Penalize length actually being too short outright, regardless of how
  // varied the few characters are — "Ab1!" shouldn't score well just
  // because it hits 4 of the character-type boxes.
  if (pw.length < 8) score = Math.min(score, 1)

  const levels = [
    { scale: 0, color: 'transparent', text: '' },
    { scale: 0.2, color: '#EF4444', text: 'Weak' },
    { scale: 0.4, color: '#F97316', text: 'Fair' },
    { scale: 0.6, color: '#EAB308', text: 'Good' },
    { scale: 0.8, color: '#84CC16', text: 'Strong' },
    { scale: 1, color: '#22C55E', text: 'Very Strong' },
  ]
  return levels[Math.min(score, 5)]
}

export default function RegisterModal({ isOpen, onClose, onRegistered }) {
  const [step, setStep] = useState(() => loadDraft()?.step || 1)
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(loadDraft()?.form || {}) }))
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [entryMode, setEntryMode] = useState(() => loadDraft()?.entryMode || 'manual') // 'manual' | 'scan' — Step 1 only
   const [checkingDuplicate, setCheckingDuplicate] = useState(false)
  const [duplicateBlocked, setDuplicateBlocked] = useState(false)
  // Step 3's "Create Account" no longer submits immediately — it first
  // flips this on to show a read-only summary of everything typed across
  // all 3 steps, so the person can catch a typo (wrong email, mistyped
  // User Number, etc.) before the account actually gets created. Cancel
  // just flips it back off (nothing is discarded); Confirm calls the
  // actual submission.
   const [reviewing, setReviewing] = useState(false)

  useEffect(() => {
    if (isOpen) prefetchOnIdle([() => import('./RegisterQrScan')])
  }, [isOpen])
  // Deliberately its own local state, NOT part of `form` — `form` gets
  // persisted to a localStorage draft on every change (see the effect
  // just below), and a PIN has no business sitting in plaintext in
  // localStorage even briefly. Only ever used in-memory, for the one
  // best-effort sign-in-and-set attempt in doRegister() below.
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  // Keep the saved draft in sync with whatever's currently typed, so if
  // this component unmounts (X button, backdrop, navigating away, a
  // refresh) there's something to restore from the next time Register
  // is opened.
  useEffect(() => {
    saveDraft({ form, step, entryMode })
  }, [form, step, entryMode])

  if (!isOpen) return null

  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  // Just hides the modal — deliberately does NOT touch `form`/`step`/etc.
  // Used by the X button, clicking the backdrop, and the "Sign in here"
  // link, so an accidental or intentional exit mid-registration never
  // loses what the person already typed. RegisterModal is kept mounted
  // by LoginPage (see registerMounted there) specifically so this state
  // survives the modal being closed and reopened.
  function handleClose() {
    onClose()
  }

  // Clears the form back to empty. Only called once registration has
  // actually succeeded (see handleSubmit) — at that point there's
  // nothing left worth preserving, and the next time someone opens
  // Register they should get a blank form, not the just-submitted data.
    function resetForm() {
    setStep(1)
    setForm(EMPTY)
    setErr('')
    setEntryMode('manual')
    setDuplicateBlocked(false)
    setReviewing(false)
    setPin('')
    setConfirmPin('')
    clearDraft()
  }

  // Used only by the post-success "Back to sign in" button (the fallback
  // path when no onRegistered callback was passed in) — resets the form
  // AND closes, since the account was already created successfully.
  function handleDoneClose() {
    resetForm()
    setSuccess('')
    onClose()
  }

  function handleScanned({ studentNumber, fullName, course, yearLevel, rawCode }) {
    // "Full Name" from the ID is kept as ONE field for QR-scanned
    // registrants (see Step 1's JSX below, gated on prefilledFromQr) —
    // splitting a multi-part Filipino name into just two boxes is
    // error-prone and not what the ID itself shows. firstName/lastName
    // are still derived and kept in sync alongside it purely because
    // registerPatient() / patient_profiles still store surname and
    // given_name as separate columns — same last-token convention
    // `createUserProfile()` already uses elsewhere in this file's
    // sibling service (usersService.js). Sanitize through the exact
    // same character/length rules Step 1's own inputs use, so a
    // prefilled value can never violate validation silently.
    const sanitizeName = (s) => s.replace(/[^A-Za-z\u00C0-\u00FF '-]/g, '').slice(0, 20)
    const sanitizeFullName = (s) => s.replace(/[^A-Za-z\u00C0-\u00FF '-]/g, '').slice(0, 60)
    const sanitizeId = (s) => String(s || '').replace(/\D/g, '').slice(0, 10)
    const cleanFullName = sanitizeFullName(String(fullName || '').trim())
    const nameParts = cleanFullName.split(/\s+/).filter(Boolean)
    const lastName = nameParts.length > 1 ? nameParts.pop() : ''
    const firstName = nameParts.join(' ')

    setForm((f) => ({
      ...f,
      fullName: cleanFullName,
      firstName: sanitizeName(firstName),
      lastName: sanitizeName(lastName),
      userId: sanitizeId(studentNumber),
      course: matchOption(course, COURSES),
      year: matchOption(yearLevel, YEAR_LEVELS),
      qrCode: rawCode || '',
      prefilledFromQr: true,
    }))
    setErr('')
    setEntryMode('manual')
    setStep(1)
  }

  async function stepNext() {
    setErr('')
    if (step === 1) {
      if (form.prefilledFromQr) {
        if (!form.fullName.trim()) return setErr('Full name is required.')
      } else {
        if (!form.firstName.trim()) return setErr('First name is required.')
        if (!form.lastName.trim()) return setErr('Last name is required.')
        if (form.firstName.trim().length < 2) return setErr('First name must be at least 2 letters.')
        if (form.lastName.trim().length < 2) return setErr('Last name must be at least 2 letters.')
      }
      if (!form.userId.trim()) return setErr('User Number is required.')
      const rawUserId = form.userId.trim().toUpperCase()
      const isStudentNumber = /^\d{10}$/.test(rawUserId)
      const isPersonnelNumber = /^[A-Z]{2,6}\d{4,10}$/.test(rawUserId)
      if (!isStudentNumber && !isPersonnelNumber) {
        return setErr('User Number must be a 10-digit student number (2023-400-878) or a personnel ID like CMP-123456.')
      }
      if (form.phone.trim() && !/^09\d{9}$/.test(form.phone.trim())) return setErr('Phone must be in format 09XXXXXXXXX (11 digits).')

      setCheckingDuplicate(true)
      try {
        const alreadyRegistered = await checkStudentNumberRegistered(form.userId.trim())
        if (alreadyRegistered) {
          setForm((f) => ({ ...f, prefilledFromQr: false }))
          setDuplicateBlocked(true)
          return setErr('This Student / User Number is already registered. Please sign in instead, or contact the clinic if this is a mistake.')
        }
        setDuplicateBlocked(false)
      } catch (err) {
        return setErr(`Could not verify Student / User Number right now: ${err.message}`)
      } finally {
        setCheckingDuplicate(false)
      }

      setStep(2)
    } else if (step === 2) {
      if (!form.course) return setErr('Please select your course.')
      const matched = COURSES.find((c) => c.toLowerCase() === form.course.trim().toLowerCase())
      if (!matched) return setErr('Please select a valid course from the list.')
      if (!form.year) return setErr('Please select your year level.')
      setForm((f) => ({ ...f, course: matched }))
      setStep(3)
    }
  }

  function stepBack() {
    setErr('')
    if (step > 1) setStep(step - 1)
  }

  // Step 2 (Academic Info) has no separate "Next" anymore — its one button
  // always advances without requiring course/year, so instructors/campus
  // personnel (who have neither) can get past it. profileIncomplete is only
  // set when those fields are actually still empty, so a student who did
  // fill them in isn't wrongly flagged incomplete just for using this button.
  function stepSkip() {
    setErr('')
    setForm((f) => ({ ...f, profileIncomplete: !f.course.trim() || !f.year.trim() }))
    setStep(3)
  }

    // Runs Step 3's field validation (same checks as before) and, if
  // everything's valid, shows the review summary instead of submitting
  // right away. Nothing is sent to the server here.
  function handleReviewClick() {
    setErr('')
    const email = form.email.trim().toLowerCase()
    if (!email) return setErr('Email address is required.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErr('Please enter a valid email address.')
    const username = form.username.trim().toLowerCase()
    if (!username) return setErr('Username is required.')
    if (username.length < 3) return setErr('Username must be at least 3 characters.')
    if (!form.password) return setErr('Password is required.')
    const pwCheck = validatePassword(form.password)
    if (!pwCheck.ok) return setErr(pwCheck.msg)
    if (form.password !== form.confirm) return setErr('Passwords do not match.')
    // Quick-login PIN is entirely optional — only validated at all if the
    // person actually started filling it in. Only offered for QR-scan
    // registrants (see the Step 3 form below and doRegister()'s own
    // comment on why manual registrants don't get this prompt). Gated on
    // form.prefilledFromQr, NOT entryMode — entryMode flips back to
    // 'manual' right after a successful scan (handleScanned() above) so
    // Step 1 shows the normal editable fields instead of the camera, but
    // prefilledFromQr keeps remembering that this registration actually
    // started from a QR scan all the way through Step 3.
    if (form.prefilledFromQr && (pin || confirmPin)) {
      if (!/^[0-9]{4}$/.test(pin)) return setErr('Quick-login PIN must be exactly 4 digits, or leave both PIN fields blank to skip it.')
      if (pin !== confirmPin) return setErr('PINs do not match.')
    }
    setReviewing(true)
  }

  // Actually creates the account — only ever called from the review
  // screen's "Confirm" button, once the person has looked over their own
  // summary and chosen to proceed.
  async function doRegister() {
    setErr('')
    const email = form.email.trim().toLowerCase()
    const username = form.username.trim().toLowerCase()

    setSubmitting(true)
    try {
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`
      const { needsEmailConfirmation } = await registerPatient({
        email,
        password: form.password,
        username,
        name: fullName,
        surname: form.lastName.trim(),
        givenName: form.firstName.trim(),
        phone: form.phone.trim(),
        studentNumber: form.userId.trim(),
        course: form.course,
        yearLevel: form.year,
        qrCode: form.qrCode || undefined,
        profileIncomplete: form.profileIncomplete,
      })
      try {
        await notify({
          targetRole: 'admin',
          message: `New patient registered: ${fullName} (${form.userId.trim()})`,
          type: 'info',
          module: '/maintenance',
        })
      } catch {
        // Non-critical — registration itself already succeeded.
      }
      const message = needsEmailConfirmation
        ? "Almost done! We've sent a confirmation link to your email — your account is created but not active yet. Click that link to activate it, then come back and sign in."
        : 'Account created successfully! You can now sign in with your email and password.'

      // Best-effort quick-login PIN setup — only attempted for QR-scan
      // registrants who actually filled in a PIN (see the Step 3 form and
      // the validation above doRegister()). Registration itself has
      // already fully succeeded by this point regardless of what happens
      // here, so any failure below is swallowed rather than surfaced —
      // worst case, they just set the PIN later in Account Settings
      // instead, exactly like the fallback message already says.
      //
      // set_own_pin() is scoped to the CALLING session's own account
      // (auth.uid()), and there's no session yet this early in
      // registration — signInWithPassword() with the credentials just
      // chosen establishes one just long enough to call it, then signs
      // back out immediately so the rest of this flow (redirect to the
      // login screen) behaves exactly as it did before this feature
      // existed. Skipped entirely when email confirmation is required —
      // signing in would just fail anyway until that's done.
      if (form.prefilledFromQr && pin && !needsEmailConfirmation) {
        try {
          const { error: pinSignInError } = await supabase.auth.signInWithPassword({ email, password: form.password })
          if (!pinSignInError) {
            await supabase.rpc('set_own_pin', { p_pin: pin })
          }
        } catch {
          // Swallowed — see comment above.
        } finally {
          await supabase.auth.signOut().catch(() => {})
        }
      }

      resetForm()
      if (onRegistered) {
        // Straight back to the login screen — no extra click needed.
        onRegistered(email, message)
      } else {
        setSuccess(message)
      }
    } catch (error) {
      // Postgres unique-violation (23505) on email/username/student_number
      // — friendlier message than the raw constraint error. Pre-checking
      // for duplicates before this point isn't possible: RLS blocks
      // anonymous reads of `users`/`patient_profiles` by design, so this
      // is the earliest point a real duplicate can be detected.
      if (error.code === '23505' || /duplicate key/i.test(error.message)) {
        if (/student_number/i.test(error.message)) {
          setErr('This student/user number is already registered.')
        } else if (/username/i.test(error.message)) {
          // Genuinely possible now that username is chosen at Step 3
          // rather than silently auto-derived from the (already
          // uniqueness-checked) email — a collision here no longer
          // implies an email collision too, so it needs its own message
          // rather than falling through to "email already exists" and
          // sending someone to sign in with an account that isn't theirs.
          setErr('That username is already taken. Please choose another.')
        } else {
                    setErr('An account with this email already exists. Please sign in.')
        }
      } else {
        setErr(error.message)
      }
      // Back to the editable fields — the review screen has no inputs to
      // fix the problem the server just reported (duplicate email/username,
      // etc.), so staying on it would leave the error message with nothing
      // the person can act on.
      setReviewing(false)
    } finally {
      setSubmitting(false)
    }
  }

  const strength = strengthOf(form.password)
  const passwordCheck = validatePassword(form.password)
  // Same pattern stepNext() uses to validate the User Number at Step 1 —
  // recomputed here (not stored in state) so Step 2 always reflects the
  // current value of form.userId without an extra effect to keep in sync.
  const isPersonnel = /^[A-Z]{2,6}\d{4,10}$/.test(form.userId.trim().toUpperCase())

  return createPortal(
    <div className="reg-overlay open" onMouseDown={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="reg-box">
        <div className="reg-header">
          <div className="reg-header-left">
            <div className="reg-header-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <h3>Create an Account</h3>
              <p>Register as a patient to access clinic services</p>
            </div>
          </div>
          <button type="button" className="reg-close-btn" onClick={handleClose}>
            ×
          </button>
        </div>

        {err && (
          <div className="reg-err" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangleIcon width={13} height={13} style={{ flexShrink: 0 }} /> {err}
          </div>
        )}
        {success && <div className="reg-success">{success}</div>}

        {!success && (
          <>
            {!duplicateBlocked && (
              <div className="reg-steps">
                <div className={`reg-step${step >= 1 ? ' active' : ''}${step > 1 ? ' done' : ''}`}>
                  <span>1</span>
                  <p>Personal Info</p>
                </div>
                <div className="reg-step-line" />
                <div className={`reg-step${step >= 2 ? ' active' : ''}${step > 2 ? ' done' : ''}`}>
                  <span>2</span>
                  <p>Academic Info</p>
                </div>
                <div className="reg-step-line" />
                <div className={`reg-step${step >= 3 ? ' active' : ''}`}>
                  <span>3</span>
                  <p>Account Setup</p>
                </div>
              </div>
            )}

            {step === 1 && !duplicateBlocked && (
              <div className="reg-step-content">
                <div className="alert alert-info" style={{ marginBottom: 14, fontSize: 12.5 }}>
                  Please complete your personal information in Account Settings.
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${entryMode === 'manual' ? 'btn-blue' : 'btn-outline'}`}
                    style={{ flex: 1 }}
                    onClick={() => {
                      setErr('')
                      setEntryMode('manual')
                    }}
                  >
                    <MailIcon width={13} height={13} /> Fill in manually
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${entryMode === 'scan' ? 'btn-blue' : 'btn-outline'}`}
                    style={{ flex: 1 }}
                    onClick={() => {
                      setErr('')
                      setEntryMode('scan')
                    }}
                  >
                    <CreditCardIcon width={13} height={13} /> Scan my ID
                  </button>
                </div>

                {entryMode === 'scan' ? (
                  <Suspense fallback={<div style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)', fontSize: 12 }}>Loading scanner…</div>}>
                    <RegisterQrScan onScanned={handleScanned} onError={setErr} />
                  </Suspense>
                ) : (
                  <>
                    {form.prefilledFromQr && (
                      <div className="alert alert-success" style={{ marginBottom: 14, fontSize: 12.5 }}>
                        Pulled from your ID — please double-check before continuing.
                      </div>
                    )}
                    {form.prefilledFromQr ? (
                      <div className="reg-field">
                        <label>
                          Full Name <span className="reg-req">*</span>
                        </label>
                        <input
                          type="text"
                          className="reg-input"
                          placeholder="Full Name"
                          maxLength={60}
                          value={form.fullName}
                          onChange={(e) => {
                            // Kept in sync with firstName/lastName on every
                            // keystroke (same last-token split
                            // handleScanned() uses) — those two are what
                            // actually get sent to registerPatient() at
                            // submit time, since patient_profiles still
                            // stores surname/given_name as separate
                            // columns; this field is just the single-box
                            // editing experience on top of that.
                            const cleaned = e.target.value.replace(/[^A-Za-z\u00C0-\u00FF '-]/g, '').slice(0, 60)
                            const parts = cleaned.trim().split(/\s+/).filter(Boolean)
                            const last = parts.length > 1 ? parts.pop() : ''
                            const first = parts.join(' ')
                            setForm((f) => ({
                              ...f,
                              fullName: cleaned,
                              firstName: first.slice(0, 20),
                              lastName: last.slice(0, 20),
                            }))
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}>
                          <span style={{ fontSize: 11, color: form.fullName.length >= 60 ? '#EF4444' : 'var(--text-3)' }}>{form.fullName.length}/60</span>
                        </div>
                      </div>
                    ) : (
                    <div className="reg-form-row">
                  <div className="reg-field">
                    <label>
                      First Name <span className="reg-req">*</span>
                    </label>
                    <input
                      type="text"
                      className="reg-input"
                      placeholder="Firstname"
                      maxLength={20}
                      value={form.firstName}
                      onChange={(e) => setField('firstName')(capitalizeWords(e.target.value.replace(/[^A-Za-z\u00C0-\u00FF '-]/g, '')).slice(0, 20))}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: form.firstName.length >= 20 ? '#EF4444' : 'var(--text-3)' }}>{form.firstName.length}/20</span>
                    </div>
                  </div>
                  <div className="reg-field">
                    <label>
                      Last Name <span className="reg-req">*</span>
                    </label>
                    <input
                      type="text"
                      className="reg-input"
                      placeholder="Lastname"
                      maxLength={20}
                      value={form.lastName}
                      onChange={(e) => setField('lastName')(capitalizeWords(e.target.value.replace(/[^A-Za-z\u00C0-\u00FF '-]/g, '')).slice(0, 20))}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: form.lastName.length >= 20 ? '#EF4444' : 'var(--text-3)' }}>{form.lastName.length}/20</span>
                    </div>
                  </div>
                </div>
                    )}
                <div className="reg-form-row">
                  <div className="reg-field">
                    <label>
                      User Number <span className="reg-req">*</span>
                    </label>
                    <input
                      type="text"
                      className="reg-input"
                      placeholder="2023-000-000 or PID-0498"
                      autoComplete="off"
                      maxLength={13}
                      value={formatUserNumber(form.userId)}
                      onChange={(e) => {
                        setDuplicateBlocked(false)
                        const raw = e.target.value.toUpperCase()
                        // Mode is read fresh from the first character typed,
                        // not stored anywhere — a digit start means a
                        // student number attempt (digits only, matching
                        // stepNext()'s own 10-digit check below), a letter
                        // start means a personnel ID attempt (letters +
                        // digits, matching the CMP-123456 pattern) — same
                        // two formats stepNext() already validates against.
                        // Recomputing from e.target.value on every keystroke
                        // (instead of caching which mode was picked) means
                        // clearing the field back to empty and starting over
                        // with the other kind of ID just works, with no
                        // extra state to keep in sync.
                        const isDigitStart = /^[0-9]/.test(raw)
                        const cleaned = isDigitStart ? raw.replace(/[^0-9]/g, '') : raw.replace(/[^A-Z0-9]/g, '')
                        setField('userId')(cleaned.slice(0, 10))
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Student number or personnel ID</span>
                      <span style={{ fontSize: 11, color: form.userId.length >= 10 ? '#EF4444' : 'var(--text-3)' }}>{form.userId.length}/10</span>
                    </div>
                  </div>
                  <div className="reg-field">
                    <label>Phone Number <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
                    <input
                      type="tel"
                      className="reg-input"
                      placeholder="09XXXXXXXXX"
                      maxLength={11}
                      inputMode="numeric"
                      value={form.phone}
                      onChange={(e) => setField('phone')(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Numbers only · starts with 09</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{form.phone.length}/11</span>
                    </div>
                  </div>
                </div>
                  </>
                )}
              </div>
            )}

            {step === 1 && duplicateBlocked && (
              <div className="reg-step-content" style={{ textAlign: 'center', padding: '10px 0' }}>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{ fontSize: 13, cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', textDecoration: 'none', padding: 0, font: 'inherit' }}
                >
                  Close and sign in instead
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="reg-step-content">
                {isPersonnel && (
                  <div className="alert alert-info" style={{ marginBottom: 14, fontSize: 12.5 }}>
                    Detected a personnel ID — course and year level aren't needed. Click Skip below.
                  </div>
                )}
                <div className="reg-field" style={{ marginBottom: 14 }}>
                  <label>
                    Course / Program <span className="reg-req">*</span>
                  </label>
                  <SearchableSelect
                    options={COURSES.map((c) => ({ value: c, label: c }))}
                    value={form.course}
                    displayValue={form.course}
                    onSelect={(val) => setField('course')(val)}
                    onClear={() => setForm((f) => ({ ...f, course: '', year: '' }))}
                    placeholder="Type to search your course…"
                    emptyLabel="No matching course"
                    disabled={isPersonnel}
                    dropdownClassName="reg-dropdown-dark"
                  />
                </div>
                <div className="reg-field">
                  <label>
                    Year Level <span className="reg-req">*</span>
                  </label>
                  <select
                    className="reg-input reg-select"
                    value={form.year}
                    onChange={(e) => setField('year')(e.target.value)}
                    disabled={isPersonnel}
                    style={isPersonnel ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                  >
                    <option value="" disabled>
                      — Select year level —
                    </option>
                    {YEAR_LEVELS.map((y) => (
                      <option value={y} key={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

                        {step === 3 && !reviewing && (
              <div className="reg-step-content">
                <div className="reg-field" style={{ marginBottom: 14 }}>
                  <label>
                    Email Address <span className="reg-req">*</span>
                  </label>
                  <input
                    type="email"
                    className="reg-input"
                    placeholder="Enter your email address"
                    value={form.email}
                    onChange={(e) => setField('email')(e.target.value)}
                  />
                  <span className="reg-hint-text">
                  Use a real, active email address — we'll send a confirmation link and QR code here, and you must verify it before your account is activated. Your account will not be created if you enter an email you can't access.
                </span>
                </div>
                <div className="reg-field" style={{ marginBottom: 14 }}>
                  <label>
                    Username <span className="reg-req">*</span>
                  </label>
                  <input
                    type="text"
                    className="reg-input"
                    placeholder="Choose a username"
                    maxLength={50}
                    value={form.username}
                    onChange={(e) => setField('username')(e.target.value.replace(/[\s'"`]/g, '').slice(0, 50))}
                  />
                  <span className="reg-hint-text">Letters, numbers, and special characters allowed (no spaces). This is what you'll sign in with, along with your password.</span>
                </div>
                <div className="reg-field" style={{ marginBottom: 14 }}>
                  <label>
                    Password <span className="reg-req">*</span>
                  </label>
                  <PasswordInput
                    wrapperClassName="reg-pw-wrap"
                    inputClassName="reg-input"
                    toggleClassName="login-pw-toggle reg-eye"
                    placeholder="Enter your Password"
                    value={form.password}
                    onChange={(e) => setField('password')(e.target.value)}
                  />
                  <span className="reg-hint-text">Must be 8+ chars with uppercase, number, and special character (!@#$%)</span>
                  {form.password && !passwordCheck.ok && (
                    <span className="reg-hint-text" style={{ color: '#EF4444' }}>{passwordCheck.msg}</span>
                  )}
                  <div className="reg-pw-strength-wrap" style={{ marginTop: 8 }}>
                    <div className="reg-pw-strength-bar">
                      <div className="reg-pw-bar-fill" style={{ transform: `scaleX(${strength.scale})`, background: strength.color }} />
                    </div>
                    <span className="reg-pw-label" style={{ color: strength.color }}>
                      {strength.text}
                    </span>
                  </div>
                </div>
                <div className="reg-field">
                  <label>
                    Confirm Password <span className="reg-req">*</span>
                  </label>
                  <PasswordInput
                    wrapperClassName="reg-pw-wrap"
                    inputClassName="reg-input"
                    toggleClassName="login-pw-toggle reg-eye"
                    placeholder="Re-enter your password"
                    value={form.confirm}
                    onChange={(e) => setField('confirm')(e.target.value)}
                  />
                                    {form.confirm && form.confirm !== form.password && (
                    <span className="reg-hint-text" style={{ color: '#EF4444' }}>Passwords do not match.</span>
                  )}
                </div>

                {form.prefilledFromQr && (
                  <div className="reg-field" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <div className="alert alert-info" style={{ marginBottom: 14, fontSize: 12.5 }}>
                      Since you're signing up with QR scan, you can set a 4-digit PIN now for instant sign-in next
                      time you scan your ID — or skip this and set it up later in Account Settings.
                    </div>
                    <label>Quick-Login PIN (optional)</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={4}
                      className="reg-input"
                      placeholder="••••"
                      style={{ letterSpacing: 8, fontSize: 18, textAlign: 'center' }}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    />
                    <span className="reg-hint-text">Leave blank to skip — you can always set this up later in Account Settings.</span>
                  </div>
                )}
                {form.prefilledFromQr && pin && (
                  <div className="reg-field" style={{ marginTop: 14 }}>
                    <label>Confirm PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={4}
                      className="reg-input"
                      placeholder="••••"
                      style={{ letterSpacing: 8, fontSize: 18, textAlign: 'center' }}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    />
                    {confirmPin && confirmPin !== pin && (
                      <span className="reg-hint-text" style={{ color: '#EF4444' }}>PINs do not match.</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 3 && reviewing && (
              <div className="reg-step-content">
                <div className="alert alert-info" style={{ marginBottom: 14, fontSize: 12.5 }}>
                  Please review your details below. Click "Confirm & Create Account" if everything is correct, or "Cancel" to go back and fix anything.
                </div>
                <div className="reg-review-list" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {[
                    ...(form.prefilledFromQr
                      ? [['Full Name', form.fullName]]
                      : [['First Name', form.firstName], ['Last Name', form.lastName]]),
                    ['User Number', formatUserNumber(form.userId)],
                    ['Phone Number', form.phone || '—'],
                    ...(isPersonnel ? [] : [
                      ['Course / Program', form.course || '—'],
                      ['Year Level', form.year || '—'],
                    ]),
                    ['Email Address', form.email.trim()],
                    ['Username', form.username.trim()],
                    ...(form.prefilledFromQr ? [['Quick-Login PIN', pin ? 'Will be set up' : 'Skipped — set up later in Account Settings']] : []),
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '9px 0',
                        borderBottom: '1px solid var(--border)',
                        fontSize: 13,
                      }}
                    >
                    <span style={{ color: 'rgba(255,255,255,0.65)' }}>{label}</span>
                      <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word', color: '#FFFFFF' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

                        <div className={`reg-nav${step === 2 ? ' reg-nav-split' : step === 3 ? ' reg-nav-final' : ''}`}>
              {step > 1 && !duplicateBlocked && !reviewing && (
                <button type="button" className="btn btn-outline" onClick={stepBack}>
                  Back
                </button>
              )}
              {step < 3 && !(step === 1 && entryMode === 'scan') && !duplicateBlocked && (
                <button
                  type="button"
                  className="reg-next-btn"
                  // Skip is only ever offered to a detected personnel ID —
                  // a student-pattern User Number has no skip path and must
                  // clear stepNext()'s course/year validation like any other
                  // step, so this always calls stepNext for them.
                  onClick={step === 2 ? (isPersonnel ? stepSkip : stepNext) : stepNext}
                  disabled={checkingDuplicate}
                >
                  {checkingDuplicate
                  ? 'Checking…'
                  : step === 2
                  ? isPersonnel
                    ? 'Skip'
                    : 'Next'
                  : 'Next'}
                </button>
              )}
              {step === 3 && !reviewing && (
                <button type="button" className="reg-submit-btn" onClick={handleReviewClick} disabled={submitting}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Create Account
                </button>
              )}
              {step === 3 && reviewing && (
                <>
                  <button type="button" className="btn btn-outline" onClick={() => setReviewing(false)} disabled={submitting}>
                    Cancel
                  </button>
                  <button type="button" className="reg-submit-btn" onClick={doRegister} disabled={submitting}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    {submitting ? 'Creating…' : 'Confirm & Create Account'}
                  </button>
                </>
              )}
            </div>
          </>
        )}

        <div className="reg-login-link">
          {success ? (
            <button type="button" onClick={handleDoneClose}>Back to sign in</button>
          ) : (
            <>
              Already have an account? <button type="button" onClick={handleClose}>Sign in here</button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}