import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import Modal from '@components/ui/Modal'
import { COURSES, YEAR_LEVELS } from './data/formOptions'
import { EditIcon, DownloadIcon } from '@components/ui/icons'

// Same format as registration (RegisterModal.jsx) — 4-3-3 digit groups,
// e.g. "2030-000-000". The underlying state is always plain digits
// only (matching how registration's own form.userId is stored); this
// is purely a display-time formatter, applied the same way in both
// places so a patient's User ID always looks identical here and at
// registration, regardless of which screen someone's looking at it on.
function formatUserNumber(digits) {
  const parts = [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 10)].filter(Boolean)
  return parts.join('-')
}

function buildForm(user) {
  return {
    name: user.name,
    email: user.email || '',
    phone: user.phone || '',
    // Sanitized to plain digits even on load — existing data entered
    // before this restriction existed could contain letters/dashes;
    // this keeps the field's internal state consistent with
    // registration's own plain-digits convention regardless of what's
    // actually stored for a given legacy account.
    studentNumber: String(user.student_number || '').replace(/\D/g, '').slice(0, 10),
    course: user.course || '',
    yearLevel: user.year_level || '',
    department: user.department || '',
    position: user.position || '',
  }
}

export default function EditUserModal({ isOpen, user, onClose, onSave }) {
  const [form, setForm] = useState(() => (user ? buildForm(user) : null))
  const [qrDataUrl, setQrDataUrl] = useState(null)

  // Regenerated fresh each time this modal opens for a given user — the
  // QR always reflects user.school_id_barcode as it currently stands in
  // the database, not a stale value from a previous open.
  useEffect(() => {
    if (!user?.school_id_barcode) return undefined
    let cancelled = false
    QRCode.toDataURL(user.school_id_barcode, { width: 240, margin: 2 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [user?.school_id_barcode])

  if (!isOpen || !form) return null
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))
  // Guards against showing a stale QR image left over from a previous
  // user if this component instance were ever reused without a fresh
  // mount — the actual render decision, not just the fetch above.
  const showQr = !!user?.school_id_barcode && !!qrDataUrl

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
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '2px 2px 16px', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {showQr ? (
          <img src={qrDataUrl} alt="User ID QR code" width={80} height={80} style={{ borderRadius: 6, background: '#fff', padding: 4, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 80, height: 80, borderRadius: 6, background: 'var(--surface2)', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-3)', textAlign: 'center', flexShrink: 0 }}>
            No QR yet
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 3 }}>ID QR Code</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
            Used to sign in by scanning ID. <strong>Saving changes below generates a new code</strong> — any previously
            printed/shared QR for this person will stop working.
          </div>
          {showQr && (
            <a
              href={qrDataUrl}
              download={`id-qr-${user.name.replace(/\s+/g, '-').toLowerCase()}.png`}
              className="btn btn-xs btn-outline"
              style={{ marginTop: 8, display: 'inline-flex' }}
            >
              <DownloadIcon width={11} height={11} /> Download Current QR
            </a>
          )}
        </div>
      </div>
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
              <input
                className="form-input"
                value={formatUserNumber(form.studentNumber)}
                inputMode="numeric"
                placeholder="2030-000-000"
                onChange={(e) => setField('studentNumber')(e.target.value.replace(/\D/g, '').slice(0, 10))}
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
              <label>USER ID</label>
              <input
                className="form-input"
                value={`UID-${String(user.user_id).padStart(6, '0')}`}
                disabled
                title="This account's actual ID in the Supabase database (users.user_id) — not editable, unlike a patient's User ID, which is a separate, admin-entered school number."
                style={{ opacity: 0.7, cursor: 'not-allowed' }}
              />
            </div>
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