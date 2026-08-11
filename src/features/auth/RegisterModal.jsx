import { lazy, Suspense, useState } from 'react'
import { createPortal } from 'react-dom'
import { COURSES, YEAR_LEVELS } from '@features/maintenance/data/formOptions'
import { validatePassword } from '@features/maintenance/lib/userHelpers'
import { registerPatient, checkStudentNumberRegistered } from '@services/usersService'
import { notify } from '@services/notificationsService'
import PasswordInput from '@components/ui/PasswordInput'
import { AlertTriangleIcon, MailIcon, CreditCardIcon } from '@components/ui/icons'

// Lazy — same reasoning as QrLoginScan's lazy import in LoginPage.jsx:
// jsQR is a sizable library most people opening the register modal (the
// "fill in manually" path, still the default) never need.
const RegisterQrScan = lazy(() => import('./RegisterQrScan'))

// Display-only formatting for the User Number field — inserts dashes as
// 4-3-3 (matching the field's own "e.g. 2023-000-000" placeholder) while
// the underlying form.userId state stays plain digits. Kept separate from
// state deliberately: validation (`/^\d+$/`), the duplicate-number check,
// and the final registerPatient() payload all already expect a plain
// digit string — formatting only the input's rendered value avoids
// touching any of that.
function formatUserNumber(digits) {
  const parts = [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 10)].filter(Boolean)
  return parts.join('-')
}

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

export default function RegisterModal({ isOpen, onClose }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [entryMode, setEntryMode] = useState('manual') // 'manual' | 'scan' — Step 1 only
  const [checkingDuplicate, setCheckingDuplicate] = useState(false)
  const [duplicateBlocked, setDuplicateBlocked] = useState(false)

  if (!isOpen) return null

  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  function handleClose() {
    setStep(1)
    setForm(EMPTY)
    setErr('')
    setSuccess('')
    setEntryMode('manual')
    setDuplicateBlocked(false)
    onClose()
  }

  function handleScanned({ studentNumber, fullName, course, yearLevel, rawCode }) {
    // Split "Juan dela Cruz" -> lastName "Cruz", firstName "Juan dela" —
    // same last-token convention `createUserProfile()` already uses
    // elsewhere in this file's sibling service (usersService.js). Sanitize
    // through the exact same character/length rules Step 1's own inputs
    // use, so a prefilled value can never violate validation silently.
    const nameParts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
    const lastName = nameParts.length > 1 ? nameParts.pop() : ''
    const firstName = nameParts.join(' ')
    const sanitizeName = (s) => s.replace(/[^A-Za-z\u00C0-\u00FF '-]/g, '').slice(0, 20)
    const sanitizeId = (s) => String(s || '').replace(/\D/g, '').slice(0, 10)

    setForm((f) => ({
      ...f,
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
      if (!form.firstName.trim()) return setErr('First name is required.')
      if (!form.lastName.trim()) return setErr('Last name is required.')
      if (!form.userId.trim()) return setErr('User Number is required.')
      if (!/^\d+$/.test(form.userId.trim())) return setErr('User Number must contain numbers only.')
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

  async function handleSubmit() {
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
      setSuccess(
        needsEmailConfirmation
          ? 'Account created! Check your email to confirm your address, then sign in.'
          : 'Account created successfully! You can now sign in with your email and password.'
      )
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
    } finally {
      setSubmitting(false)
    }
  }

  const strength = strengthOf(form.password)

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
                      onChange={(e) => setField('firstName')(e.target.value.replace(/[^A-Za-z\u00C0-\u00FF '-]/g, '').slice(0, 20))}
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
                      onChange={(e) => setField('lastName')(e.target.value.replace(/[^A-Za-z\u00C0-\u00FF '-]/g, '').slice(0, 20))}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: form.lastName.length >= 20 ? '#EF4444' : 'var(--text-3)' }}>{form.lastName.length}/20</span>
                    </div>
                  </div>
                </div>
                <div className="reg-form-row">
                  <div className="reg-field">
                    <label>
                      User Number <span className="reg-req">*</span>
                    </label>
                    <input
                      type="text"
                      className="reg-input"
                      placeholder="e.g. 2023-000-000"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={12}
                      value={formatUserNumber(form.userId)}
                      onChange={(e) => {
                        setDuplicateBlocked(false)
                        setField('userId')(e.target.value.replace(/\D/g, '').slice(0, 10))
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Numbers only</span>
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
                      <span style={{ fontSize: 11, color: form.phone.length === 11 ? '#16A34A' : 'var(--text-3)' }}>{form.phone.length}/11</span>
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
                <div className="reg-field" style={{ marginBottom: 14 }}>
                  <label>
                    Course / Program <span className="reg-req">*</span>
                  </label>
                  <input
                    className="reg-input"
                    list="course-options"
                    placeholder="Type to search your course…"
                    autoComplete="off"
                    value={form.course}
                    onChange={(e) => setField('course')(e.target.value)}
                  />
                  <datalist id="course-options">
                    {COURSES.map((c) => (
                      <option value={c} key={c} />
                    ))}
                  </datalist>
                </div>
                <div className="reg-field">
                  <label>
                    Year Level <span className="reg-req">*</span>
                  </label>
                  <select className="reg-input reg-select" value={form.year} onChange={(e) => setField('year')(e.target.value)}>
                    <option value="">— Select year level —</option>
                    {YEAR_LEVELS.map((y) => (
                      <option value={y} key={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {step === 3 && (
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
                  <span className="reg-hint-text">We'll send your account confirmation and reset codes here.</span>
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
                    onChange={(e) => setField('username')(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50))}
                  />
                  <span className="reg-hint-text">Letters and numbers only. This is what you'll sign in with, along with your password.</span>
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
                </div>
                <div className="reg-pw-strength-wrap" style={{ marginTop: 10 }}>
                  <div className="reg-pw-strength-bar">
                    <div className="reg-pw-bar-fill" style={{ transform: `scaleX(${strength.scale})`, background: strength.color }} />
                  </div>
                  <span className="reg-pw-label" style={{ color: strength.color }}>
                    {strength.text}
                  </span>
                </div>
              </div>
            )}

            <div className={`reg-nav${step === 2 ? ' reg-nav-split' : step === 3 ? ' reg-nav-final' : ''}`}>
              {step > 1 && !duplicateBlocked && (
                <button type="button" className="btn btn-outline" onClick={stepBack}>
                  ← Back
                </button>
              )}
              {step < 3 && !(step === 1 && entryMode === 'scan') && !duplicateBlocked && (
                <button type="button" className="reg-next-btn" onClick={stepNext} disabled={checkingDuplicate}>
                  {checkingDuplicate ? 'Checking…' : 'Next →'}
                </button>
              )}
              {step === 3 && (
                <button type="button" className="reg-submit-btn" onClick={handleSubmit} disabled={submitting}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  {submitting ? 'Creating…' : 'Create Account'}
                </button>
              )}
            </div>
          </>
        )}

        <div className="reg-login-link">
          {success ? (
            <button type="button" onClick={handleClose}>Back to sign in</button>
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