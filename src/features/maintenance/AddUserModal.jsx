import { useState } from 'react'
import Modal from '@components/ui/Modal'
import PasswordInput from '@components/ui/PasswordInput'
import { COURSES, YEAR_LEVELS } from './data/formOptions'
import { validatePassword, initialsFor } from './lib/userHelpers'
import { PlusIcon } from '@components/ui/icons'

const EMPTY = { name: '', email: '', password: '', role: 'patient', phone: '', studentNumber: '', course: '', yearLevel: '', department: '', position: '' }

export default function AddUserModal({ isOpen, existingUsers, onClose, onSave, onError }) {
  const [form, setForm] = useState(EMPTY)
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  function handleClose() {
    setForm(EMPTY)
    onClose()
  }

  function handleSave() {
    const name = form.name.trim()
    const email = form.email.trim().toLowerCase()
    if (!name || !email || !form.password) return onError('Name, email, and password are required')

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
      record.permissions = { print_inventory: false, print_appointments: false, print_health: false }
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
          <PasswordInput placeholder="Min 8 characters" value={form.password} onChange={(e) => setField('password')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>ROLE *</label>
          <select className="form-select" value={form.role} onChange={(e) => setField('role')(e.target.value)}>
            <option value="patient">Patient</option>
            <option value="staff">Clinic Staff</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div className="form-group">
          <label>PHONE</label>
          <input className="form-input" placeholder="09XXXXXXXXX" value={form.phone} onChange={(e) => setField('phone')(e.target.value)} />
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
              <input className="form-input" placeholder="e.g., Clinic" value={form.department} onChange={(e) => setField('department')(e.target.value)} />
            </div>
            <div className="form-group">
              <label>POSITION</label>
              <input className="form-input" placeholder="e.g., Nurse" value={form.position} onChange={(e) => setField('position')(e.target.value)} />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
