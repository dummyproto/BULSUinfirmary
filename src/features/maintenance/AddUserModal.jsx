import { useState } from 'react'
import Modal from '@components/ui/Modal'
import PasswordInput from '@components/ui/PasswordInput'
import { COURSES, YEAR_LEVELS } from './data/formOptions'
import { validatePassword, initialsFor } from './lib/userHelpers'
import { PlusIcon } from '@components/ui/icons'

const EMPTY = { name: '', email: '', password: '', role: 'patient', phone: '', studentNumber: '', course: '', yearLevel: '', department: '', position: '' }

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
    const name = form.name.trim()
    const email = form.email.trim().toLowerCase()
    if (!name || !email || !form.password) return onError('Name, email, and password are required')
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
      role: form.role,
      active: true,
      avatar_initials: initialsFor(name),
      phone: form.phone.trim() || null,
      profile_img_url: null,
    }
    if (form.role === 'patient') {
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
        <div className="form-group full">
          <label>FULL NAME *</label>
          <input className="form-input" placeholder="e.g., Juan dela Cruz" value={form.name} onChange={(e) => setField('name')(e.target.value)} />
        </div>
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
              <input className="form-input" placeholder="2024-00001" value={form.studentNumber} onChange={(e) => setField('studentNumber')(e.target.value)} />
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