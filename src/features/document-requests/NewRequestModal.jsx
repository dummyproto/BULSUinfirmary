import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { DocumentIcon } from '@components/ui/icons'

export const DOC_TYPES = [
  'Medical Certificate',
  'Health Clearance',
  'Fit to Work Certificate',
  'Physical Exam Form',
]

const EMPTY_FORM = { docType: '', purpose: '', dateNeeded: '' }

export default function NewRequestModal({ isOpen, onClose, onSubmit, onError }) {
  const [form, setForm] = useState(EMPTY_FORM)

  const setField = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = () => {
    if (!form.docType) return onError('Please select a document type')
    if (!form.purpose.trim()) return onError('Please enter the purpose')
    if (!form.dateNeeded) return onError('Please enter the date needed')

    const selected = new Date(form.dateNeeded)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (selected < today) {
      return onError('Date needed cannot be in the past. Please select a valid future date.')
    }

    onSubmit({ docType: form.docType, purpose: form.purpose.trim(), dateNeeded: form.dateNeeded })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Document Request"
      icon={<DocumentIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-blue" onClick={handleSubmit}>
            Submit Request
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-group full">
          <label>DOCUMENT TYPE *</label>
          <select className="form-select" value={form.docType} onChange={setField('docType')}>
            <option value="">-- Select Document Type --</option>
            {DOC_TYPES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group full">
          <label>PURPOSE / REASON *</label>
          <textarea
            className="form-textarea"
            placeholder="Explain why you need this document…"
            style={{ minHeight: 70 }}
            value={form.purpose}
            onChange={setField('purpose')}
          />
        </div>
        <div className="form-group">
          <label>DATE NEEDED *</label>
          <input
            className="form-input"
            type="date"
            value={form.dateNeeded}
            onChange={setField('dateNeeded')}
          />
        </div>
      </div>
      <div className="alert alert-info" style={{ marginTop: 12 }}>
        ⏱️ Processing takes 2–3 working days. Bring your school ID for pickup.
      </div>
    </Modal>
  )
}
