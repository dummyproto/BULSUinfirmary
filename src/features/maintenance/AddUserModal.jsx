import { useState } from 'react'
import Modal from '@components/ui/Modal'
import PasswordInput from '@components/ui/PasswordInput'
import { COURSES, YEAR_LEVELS } from './data/formOptions'
import { validatePassword, initialsFor } from './lib/userHelpers'
import { buildFullName } from '@features/profile/lib/profileHelpers'
import { PlusIcon } from '@components/ui/icons'
import { capitalizeWords } from '@lib/format'

// Same format as registration (RegisterModal.jsx) and EditUserModal.jsx
// — 4-3-3 digit groups, e.g. "2023-000-000". The underlying form state
// stays plain digits only; this is purely a display-time formatter, so
// a patient's User ID looks identical no matter which of these three
// screens it's being entered/viewed on.
function formatUserNumber(digits) {
  const parts = [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 10)].filter(Boolean)
  return parts.join('-')
}

const EMPTY = { name: '', surname: '', givenName: '', email: '', password: '', role: 'patient', phone: '', studentNumber: '', course: '', yearLevel: '', department: '', position: '' }

// Clinic Staff's Department is always "Clinic" and Position is picked
// from this fixed list — Administrator's Department/Position are each a
// single fixed value ("Administrator" / "Admin"), set automatically by
// handleRoleChange below rather than typed, so both fields stay
// consistent across every admin/staff account instead of drifting into
// free-text variants ("Clinic" vs "clinic" vs "Health Clinic", etc.).
const STAFF_POSITIONS = ['Doctor', 'Nurse', 'Clinic Assistant']

export default function AddUserModal({ isOpen, existingUsers, onClose, onSave, onError }) {
  const [form, setForm] = useState(EMPTY)
  const passwordValid = form.password ? validatePassword(form.password).ok : null
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  // Department/Position aren't independently editable once a role is
  // picked — this is the single place that decides their value for each
  // role, so switching Role always leaves both fields in a valid state
  // rather than carrying over a stale value from whatever role was
  // selected before.
  function handleRoleChange(role) {
    setForm((f) => {
      if (role === 'admin') return { ...f, role, department: 'Administrator', position: 'Admin' }
      if (role === 'staff') return { ...f, role, department: 'Clinic', position: STAFF_POSITIONS.includes(f.position) ? f.position : '' }
      return { ...f, role, department: '', position: '' }
    })
  }

  function handleClose() {
    setForm(EMPTY)
    onClose()
  }

  function handleSave() {
    // Patients: name is derived from Surname + First Name, same as
    // EditUserModal.jsx and EditProfileModal.jsx already do — never
    // typed as one freeform "Full Name" field for this role, so all
    // three name-editing surfaces in the app stay consistent instead of
    // three different ways to end up with a name that doesn't match a
    // patient's own Surname/First Name fields.
    const isPatient = form.role === 'patient'
    const surname = form.surname.trim()
    const givenName = form.givenName.trim()
    const name = isPatient ? buildFullName({ surname, givenName }, '') : form.name.trim()
    const email = form.email.trim().toLowerCase()
    if (isPatient) {
      if (!surname || !givenName) return onError('Surname and First Name are required')
    } else if (!name) {
      return onError('Full Name is required')
    }
    if (!email || !form.password) return onError('Email and password are required')
    if (form.role === 'staff' && !form.position) return onError('Position is required for Clinic Staff')

    const pwCheck = validatePassword(form.password)
    if (!pwCheck.ok) return onError(pwCheck.msg)
    if (existingUsers.some((u) => u.email === email)) return onError('Email already exists')
    if (form.role === 'patient' && form.studentNumber.trim()) {
      const uid = form.studentNumber.trim().toLowerCase()
      if (existingUsers.some((u) => u.student_number?.toLowerCase() === uid)) {
        return onError('This student/user number is already registered')
      }
    }

    const record = {
      name,
      email,
      password: form.password,
      role: form.role,
      active: true,
      avatar_initials: initialsFor(name),
      phone: form.phone.trim() || null,
      profile_img_url: null,
    }
    if (form.role === 'patient') {
      record.surname = surname
      record.givenName = givenName
      record.student_number = form.studentNumber.trim() || null
      record.course = form.course || null
      record.year_level = form.yearLevel || null
    } else {
      record.department = form.department.trim() || null
      record.position = form.position.trim() || null
      record.permissions = { print_inventory: false, print_documents: false, print_health: false }
    }
    onSave(record)
    setForm(EMPTY)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add New User"
      icon={<PlusIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={handleClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-blue" onClick={handleSave}>
            Add User
          </button>
        </>
      }
    >
      <div className="form-grid">
        {form.role === 'patient' ? (
          <>
            <div className="form-group">
              <label>SURNAME *</label>
              <input className="form-input" placeholder="e.g., Dela Cruz" value={form.surname} onChange={(e) => setField('surname')(capitalizeWords(e.target.value))} />
            </div>
            <div className="form-group">
              <label>FIRST NAME *</label>
              <input className="form-input" placeholder="e.g., Juan" value={form.givenName} onChange={(e) => setField('givenName')(capitalizeWords(e.target.value))} />
            </div>
          </>
        ) : (
          <div className="form-group full">
            <label>FULL NAME *</label>
            <input className="form-input" placeholder="e.g., Juan dela Cruz" value={form.name} onChange={(e) => setField('name')(e.target.value)} />
          </div>
        )}
        <div className="form-group">
          <label>EMAIL *</label>
          <input className="form-input" type="email" placeholder="user@school.edu" value={form.email} onChange={(e) => setField('email')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>PASSWORD *</label>
          <PasswordInput
          placeholder="Min 8 characters"
          value={form.password}
          onChange={(e) => setField('password')(e.target.value)}
          style={passwordValid === null ? undefined : { borderColor: passwordValid ? '#22C55E' : '#EF4444' }}
        />
        </div>
        <div className="form-group">
          <label>ROLE *</label>
          <select className="form-select" value={form.role} onChange={(e) => handleRoleChange(e.target.value)}>
            <option value="patient">Patient</option>
            <option value="staff">Clinic Staff</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div className="form-group">
          <label>PHONE</label>
          <input
  className="form-input"
  placeholder="09XXXXXXXXX"
  inputMode="numeric"
  maxLength={11}
  value={form.phone}
  onChange={(e) => setField('phone')(e.target.value.replace(/\D/g, '').slice(0, 11))}
/>
        </div>

        {form.role === 'patient' ? (
          <>
            <div className="form-group">
              <label>USER ID</label>
              <input
                className="form-input"
                value={formatUserNumber(form.studentNumber)}
                placeholder="2023-000-000 or CMP-123456"
                onChange={(e) => {
                  const raw = e.target.value.toUpperCase()
                  // Same dual-format rule RegisterModal.jsx's own User
                  // Number field uses — a patient here can be either an
                  // actual student (numeric ID, e.g. 2023-000-000) or
                  // campus personnel registered as a patient (letters +
                  // digits, e.g. CMP-123456), same as at registration.
                  // This field used to force digits-only unconditionally
                  // (inputMode="numeric" + a raw .replace(/\D/g, '')),
                  // which meant Maintenance couldn't create or edit a
                  // personnel-type patient account with its real ID at
                  // all — any letters typed were silently stripped.
                  // Read fresh from the first character on every
                  // keystroke rather than a stored mode, so clearing the
                  // field and switching to the other format just works.
                  const isDigitStart = /^[0-9]/.test(raw)
                  const cleaned = isDigitStart ? raw.replace(/[^0-9]/g, '') : raw.replace(/[^A-Z0-9]/g, '')
                  setField('studentNumber')(cleaned.slice(0, 10))
                }}
              />
              <span style={{ fontSize: 11, color: form.studentNumber.length >= 10 ? '#EF4444' : 'var(--text-3)' }}>{form.studentNumber.length}/10</span>
            </div>
            <div className="form-group">
              <label>COURSE</label>
              <select className="form-select" value={form.course} onChange={(e) => setField('course')(e.target.value)}>
                <option value="">-- Select --</option>
                {COURSES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>YEAR LEVEL</label>
              <select className="form-select" value={form.yearLevel} onChange={(e) => setField('yearLevel')(e.target.value)}>
                <option value="">-- Select --</option>
                {YEAR_LEVELS.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label>DEPARTMENT</label>
              <input className="form-input" value={form.department} readOnly disabled title="Set automatically based on Role" style={{ opacity: 0.75, cursor: 'not-allowed' }} />
            </div>
            <div className="form-group">
              <label>POSITION</label>
              {form.role === 'admin' ? (
                <input className="form-input" value={form.position} readOnly disabled title="Set automatically based on Role" style={{ opacity: 0.75, cursor: 'not-allowed' }} />
              ) : (
                <select className="form-select" value={form.position} onChange={(e) => setField('position')(e.target.value)}>
                  <option value="">-- Select --</option>
                  {STAFF_POSITIONS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}