import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { PlusIcon, EditIcon } from '@components/ui/icons'

const EMPTY = { supplierName: '', contactPerson: '', phone: '', email: '', address: '', remarks: '' }

function toForm(supplier) {
  if (!supplier) return EMPTY
  return {
    supplierName: supplier.supplier_name || '',
    contactPerson: supplier.contact_person || '',
    phone: supplier.phone || '',
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
          <input className="form-input" placeholder="Optional" value={form.phone} onChange={(e) => setField('phone')(e.target.value)} />
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
