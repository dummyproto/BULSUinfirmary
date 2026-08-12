import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { DocumentIcon } from '@components/ui/icons'
import { DOC_TYPES } from './data/docTypes'

const EMPTY_FORM = { docType: '', customDocType: '', purpose: '', dateNeeded: '' }

export default function NewRequestModal({ isOpen, onClose, onSubmit, onError }) {
  const [form, setForm] = useState(EMPTY_FORM)

  const setField = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = () => {
    if (!form.docType) return onError('Please select a document type')
    if (form.docType === 'Other' && !form.customDocType.trim()) return onError('Please specify the document type')
    if (!form.purpose.trim()) return onError('Please enter the purpose')
    if (!form.dateNeeded) return onError('Please enter the date needed')

    const selected = new Date(form.dateNeeded)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (selected < today) {
      return onError('Date needed cannot be in the past. Please select a valid future date.')
    }

    // Sends the actual typed-in name for "Other", not the literal word
    // "Other" — staff reviewing the request should see what document
    // was actually asked for, not a placeholder category label.
    const docType = form.docType === 'Other' ? form.customDocType.trim() : form.docType
    onSubmit({ docType, purpose: form.purpose.trim(), dateNeeded: form.dateNeeded })
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
          <label htmlFor="new-request-doc-type">DOCUMENT TYPE *</label>
          <select id="new-request-doc-type" name="docType" className="form-select" value={form.docType} onChange={setField('docType')}>
            <option value="" disabled>
              -- Select Document Type --
            </option>
            {DOC_TYPES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        {form.docType === 'Other' && (
          <div className="form-group full">
            <label htmlFor="new-request-custom-doc-type">PLEASE SPECIFY *</label>
            <input
              id="new-request-custom-doc-type"
              name="customDocType"
              className="form-input"
              placeholder="Enter the document type you need…"
              value={form.customDocType}
              onChange={setField('customDocType')}
            />
          </div>
        )}
        <div className="form-group full">
          <label htmlFor="new-request-purpose">PURPOSE / REASON *</label>
          <textarea
            id="new-request-purpose"
            name="purpose"
            className="form-textarea"
            placeholder="Explain why you need this document…"
            style={{ minHeight: 70 }}
            value={form.purpose}
            onChange={setField('purpose')}
          />
        </div>
        <div className="form-group">
          <label htmlFor="new-request-date-needed">DATE NEEDED *</label>
          <input
            id="new-request-date-needed"
            name="dateNeeded"
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