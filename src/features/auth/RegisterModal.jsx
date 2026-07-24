import { useState } from 'react'
import { COURSES, YEAR_LEVELS } from '@features/maintenance/data/formOptions'
import { validatePassword } from '@features/maintenance/lib/userHelpers'
import { registerPatient } from '@services/usersService'
import { notify } from '@services/notificationsService'
import PasswordInput from '@components/ui/PasswordInput'
import { AlertTriangleIcon } from '@components/ui/icons'

const EMPTY = { firstName: '', lastName: '', userId: '', phone: '', course: '', year: '', email: '', password: '', confirm: '' }

function strengthOf(pw) {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const levels = [
    { w: '0%', color: 'transparent', text: '' },
    { w: '25%', color: '#EF4444', text: 'Weak' },
    { w: '50%', color: '#F97316', text: 'Fair' },
    { w: '75%', color: '#EAB308', text: 'Good' },
    { w: '100%', color: '#22C55E', text: 'Strong' },
  ]
  return levels[Math.min(score, 4)]
}

export default function RegisterModal({ isOpen, onClose }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  function handleClose() {
    setStep(1)
    setForm(EMPTY)
    setErr('')
    setSuccess('')
    onClose()
  }

  function stepNext() {
    setErr('')
    if (step === 1) {
      if (!form.firstName.trim()) return setErr('First name is required.')
      if (!form.lastName.trim()) return setErr('Last name is required.')
      if (!form.userId.trim()) return setErr('Student / User Number is required.')
      if (!/^\d+$/.test(form.userId.trim())) return setErr('Student / User Number must contain numbers only.')
      if (!form.phone.trim()) return setErr('Phone number is required.')
      if (!/^09\d{9}$/.test(form.phone.trim())) return setErr('Phone must be in format 09XXXXXXXXX (11 digits).')
      setStep(2)
    } else if (step === 2) {
      if (!form.course) return setErr('Please select your course.')
      if (!form.year) return setErr('Please select your year level.')
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
        name: fullName,
        surname: form.lastName.trim(),
        givenName: form.firstName.trim(),
        phone: form.phone.trim(),
        studentNumber: form.userId.trim(),
        course: form.course,
        yearLevel: form.year,
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
        setErr(/student_number/i.test(error.message) ? 'This student/user number is already registered.' : 'An account with this email already exists. Please sign in.')
      } else {
        setErr(error.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const strength = strengthOf(form.password)

  return (
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

            {step === 1 && (
              <div className="reg-step-content">
                <div className="reg-form-row">
                  <div className="reg-field">
                    <label>
                      First Name <span className="reg-req">*</span>
                    </label>
                    <input
                      type="text"
                      className="reg-input"
                      placeholder="Juan"
                      maxLength={20}
                      value={form.firstName}
                      onChange={(e) => setField('firstName')(e.target.value.replace(/[^A-Za-z\u00C0-\u00FF '-]/g, '').slice(0, 20))}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: form.firstName.length >= 20 ? '#EF4444' : '#94A3B8' }}>{form.firstName.length}/20</span>
                    </div>
                  </div>
                  <div className="reg-field">
                    <label>
                      Last Name <span className="reg-req">*</span>
                    </label>
                    <input
                      type="text"
                      className="reg-input"
                      placeholder="dela Cruz"
                      maxLength={20}
                      value={form.lastName}
                      onChange={(e) => setField('lastName')(e.target.value.replace(/[^A-Za-z\u00C0-\u00FF '-]/g, '').slice(0, 20))}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: form.lastName.length >= 20 ? '#EF4444' : '#94A3B8' }}>{form.lastName.length}/20</span>
                    </div>
                  </div>
                </div>
                <div className="reg-form-row">
                  <div className="reg-field">
                    <label>
                      Student / User Number <span className="reg-req">*</span>
                    </label>
                    <input
                      type="text"
                      className="reg-input"
                      placeholder="e.g. 202400001"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={15}
                      value={form.userId}
                      onChange={(e) => setField('userId')(e.target.value.replace(/\D/g, '').slice(0, 15))}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>Numbers only</span>
                      <span style={{ fontSize: 11, color: form.userId.length >= 15 ? '#EF4444' : '#94A3B8' }}>{form.userId.length}/15</span>
                    </div>
                  </div>
                  <div className="reg-field">
                    <label>
                      Phone Number <span className="reg-req">*</span>
                    </label>
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
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>Numbers only · starts with 09</span>
                      <span style={{ fontSize: 11, color: form.phone.length === 11 ? '#16A34A' : '#94A3B8' }}>{form.phone.length}/11</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="reg-step-content">
                <div className="reg-field" style={{ marginBottom: 14 }}>
                  <label>
                    Course / Program <span className="reg-req">*</span>
                  </label>
                  <select className="reg-input reg-select" value={form.course} onChange={(e) => setField('course')(e.target.value)}>
                    <option value="">— Select your course —</option>
                    {COURSES.map((c) => (
                      <option value={c} key={c}>
                        {c}
                      </option>
                    ))}
                  </select>
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
                  <input type="email" className="reg-input" placeholder="you@school.edu" value={form.email} onChange={(e) => setField('email')(e.target.value)} />
                  <span className="reg-hint-text">Use your school email address</span>
                </div>
                <div className="reg-field" style={{ marginBottom: 14 }}>
                  <label>
                    Password <span className="reg-req">*</span>
                  </label>
                  <PasswordInput
                    wrapperClassName="reg-pw-wrap"
                    inputClassName="reg-input"
                    toggleClassName="login-pw-toggle reg-eye"
                    placeholder="Min 8 chars, uppercase, number & special char"
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
                    <div className="reg-pw-bar-fill" style={{ width: strength.w, background: strength.color }} />
                  </div>
                  <span className="reg-pw-label" style={{ color: strength.color }}>
                    {strength.text}
                  </span>
                </div>
              </div>
            )}

            <div className="reg-nav">
              {step > 1 && (
                <button type="button" className="btn btn-outline" onClick={stepBack}>
                  ← Back
                </button>
              )}
              {step < 3 && (
                <button type="button" className="reg-next-btn" onClick={stepNext}>
                  Next →
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
            <a onClick={handleClose}>Back to sign in</a>
          ) : (
            <>
              Already have an account? <a onClick={handleClose}>Sign in here</a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
