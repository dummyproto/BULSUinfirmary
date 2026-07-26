import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { COURSES, YEAR_LEVELS } from './data/formOptions'
import { EditIcon } from '@components/ui/icons'

function buildForm(user) {
  return {
    name: user.name,
    email: user.email || '',
    phone: user.phone || '',
    studentNumber: user.student_number || '',
    course: user.course || '',
    yearLevel: user.year_level || '',
    department: user.department || '',
    position: user.position || '',
  }
}

export default function EditUserModal({ isOpen, user, onClose, onSave }) {
  const [form, setForm] = useState(() => (user ? buildForm(user) : null))
  if (!isOpen || !form) return null
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  function handleSave() {
    const updates = {
      name: form.name.trim() || user.name,
      email: form.email.trim().toLowerCase() || user.email,
      phone: form.phone.trim() || user.phone,
    }
    if (user.role === 'patient') {
      updates.student_number = form.studentNumber.trim() || user.student_number
      updates.course = form.course || user.course
      updates.year_level = form.yearLevel || user.year_level
    } else {
      updates.department = form.department.trim() || user.department
      updates.position = form.position.trim() || user.position
    }
    onSave(updates)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit User"
      icon={<EditIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-blue" onClick={handleSave}>
            Save Changes
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-group full">
          <label>FULL NAME</label>
          <input className="form-input" value={form.name} onChange={(e) => setField('name')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>EMAIL</label>
          <input className="form-input" value={form.email} onChange={(e) => setField('email')(e.target.value)} />
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
        {user.role === 'patient' ? (
          <>
            <div className="form-group">
              <label>USER ID</label>
              <input className="form-input" value={form.studentNumber} onChange={(e) => setField('studentNumber')(e.target.value)} />
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
              <input className="form-input" value={form.department} onChange={(e) => setField('department')(e.target.value)} />
            </div>
            <div className="form-group">
              <label>POSITION</label>
              <input className="form-input" value={form.position} onChange={(e) => setField('position')(e.target.value)} />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
