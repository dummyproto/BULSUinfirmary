import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { PlusIcon, InventoryIcon } from '@components/ui/icons'
import SearchableSelect from '@components/ui/SearchableSelect'

const EMPTY = { qty: '10', batchNo: '', expiry: '', received: new Date().toISOString().slice(0, 10), supplierId: '', supplierName: '', notes: '' }

export default function ReplenishModal({ isOpen, item, onClose, onSubmit, onError, suppliers }) {
  const [form, setForm] = useState(EMPTY)

  if (!isOpen || !item) return null
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  function handleSubmit() {
    const qty = parseInt(form.qty, 10) || 0
    if (qty <= 0) return onError('Enter a valid quantity')
    onSubmit({
      qty,
      batchNo: form.batchNo.trim() || null,
      expiry: form.expiry || null,
      received: form.received || new Date().toISOString().slice(0, 10),
      supplierId: form.supplierId || null,
      notes: form.notes,
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Replenish Stock"
      icon={<PlusIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-teal" onClick={handleSubmit}>
            <PlusIcon width={13} height={13} /> Replenish
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8 }}>
        <InventoryIcon width={13} height={13} style={{ verticalAlign: -2 }} /> <strong>{item.name}</strong> <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>· Current stock: <strong>{item.quantity}</strong> {item.unit}</span>
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label>QUANTITY TO ADD *</label>
          <input className="form-input" type="number" min="1" value={form.qty} onChange={(e) => setField('qty')(e.target.value.replace(/[^0-9]/g, ''))} />
        </div>
        <div className="form-group">
          <label>BATCH NUMBER</label>
          <input className="form-input" placeholder="e.g., AMX-002" value={form.batchNo} onChange={(e) => setField('batchNo')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>{item.category === 'Equipment' ? 'NEW MAINTENANCE DATE' : 'NEW EXPIRY DATE'}</label>
          <input className="form-input" type="date" value={form.expiry} onChange={(e) => setField('expiry')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>DATE RECEIVED</label>
          <input className="form-input" type="date" value={form.received} onChange={(e) => setField('received')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>SUPPLIER</label>
          <SearchableSelect
            options={suppliers.map((s) => ({ value: String(s.supplier_id), label: s.supplier_name, sub: s.contact_person || '' }))}
            value={form.supplierId}
            displayValue={form.supplierName}
            onSelect={(val) => {
              const s = suppliers.find((sup) => String(sup.supplier_id) === val)
              setForm((f) => ({ ...f, supplierId: val, supplierName: s?.supplier_name || '' }))
            }}
            onClear={() => setForm((f) => ({ ...f, supplierId: '', supplierName: '' }))}
            placeholder="Search suppliers…"
            emptyLabel="No suppliers yet — add one from the Suppliers tab"
          />
        </div>
        <div className="form-group full">
          <label>NOTES</label>
          <input className="form-input" placeholder="e.g., Monthly restock" value={form.notes} onChange={(e) => setField('notes')(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
