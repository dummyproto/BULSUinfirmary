import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { PlusIcon, EditIcon } from '@components/ui/icons'

const EMPTY = { supplierName: '', contactPerson: '', phone: '', email: '', address: '', remarks: '' }

// Phone numbers are digits only, max 11 (e.g. 09171234567), same limit the
// registration form uses. Existing saved values that contain spaces,
// dashes or a +63 prefix are cleaned up when the edit form opens, so
// they don't fail validation on save.
const PHONE_MAX = 11
const PHONE_MIN = 7 // shortest accepted — allows landlines
function cleanPhone(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length === 12) digits = `0${digits.slice(2)}`
  return digits.slice(0, PHONE_MAX)
}

function toForm(supplier) {
  if (!supplier) return EMPTY
  return {
    supplierName: supplier.supplier_name || '',
    contactPerson: supplier.contact_person || '',
    phone: cleanPhone(supplier.phone),
    email: supplier.email || '',
    address: supplier.address || '',
    remarks: supplier.remarks || '',
  }
}

export default function AddEditSupplierModal({ isOpen, supplier, onClose, onSubmit, onError }) {
  const [form, setForm] = useState(() => toForm(supplier))
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))
  const isEdit = !!supplier

  if (!isOpen) return null

  function handleSubmit() {
    if (!form.supplierName.trim()) return onError('Supplier name is required')
    if (form.phone && form.phone.length < PHONE_MIN) return onError(`Phone number must be ${PHONE_MIN}–${PHONE_MAX} digits`)
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return onError('Enter a valid email address')
    onSubmit({
      supplier_name: form.supplierName.trim(),
      contact_person: form.contactPerson.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      remarks: form.remarks.trim() || null,
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Supplier' : 'Add Supplier'}
      icon={isEdit ? <EditIcon width={16} height={16} /> : <PlusIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-teal" onClick={handleSubmit}>
            {isEdit ? <EditIcon width={13} height={13} /> : <PlusIcon width={13} height={13} />} {isEdit ? 'Save Changes' : 'Add Supplier'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-group full">
          <label>SUPPLIER NAME *</label>
          <input className="form-input" value={form.supplierName} onChange={(e) => setField('supplierName')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>CONTACT PERSON</label>
          <input className="form-input" placeholder="Optional" value={form.contactPerson} onChange={(e) => setField('contactPerson')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>PHONE</label>
          <input
            className="form-input"
            type="tel"
            inputMode="numeric"
            maxLength={PHONE_MAX}
            placeholder="e.g., 09171234567"
            value={form.phone}
            onChange={(e) => setField('phone')(cleanPhone(e.target.value))}
          />
        </div>
        <div className="form-group">
          <label>EMAIL</label>
          <input className="form-input" type="email" placeholder="Optional" value={form.email} onChange={(e) => setField('email')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>ADDRESS</label>
          <input className="form-input" placeholder="Optional" value={form.address} onChange={(e) => setField('address')(e.target.value)} />
        </div>
        <div className="form-group full">
          <label>REMARKS</label>
          <input className="form-input" placeholder="Optional notes" value={form.remarks} onChange={(e) => setField('remarks')(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}