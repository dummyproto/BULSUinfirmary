import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { PlusIcon, FolderIcon } from '@components/ui/icons'
import SearchableSelect from '@components/ui/SearchableSelect'

export default function ReplenishBatchModal({ isOpen, batch, onClose, onSubmit, onError, suppliers }) {
  const [qty, setQty] = useState('1')
  const [expiry, setExpiry] = useState('')
  const [received, setReceived] = useState(new Date().toISOString().slice(0, 10))
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [notes, setNotes] = useState('')

  if (!isOpen || !batch) return null

  function handleSubmit() {
    const q = parseInt(qty, 10) || 0
    if (q <= 0) return onError('Enter a valid quantity')
    onSubmit({ qty: q, expiry: expiry || null, received, supplierId: supplierId || null, notes: notes.trim() })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Replenish Batch"
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
        <FolderIcon width={13} height={13} style={{ verticalAlign: -2 }} /> <strong>{batch.item_name}</strong> <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>· Batch {batch.batch_code} · Currently {batch.quantity} {batch.item_unit}</span>
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label>QUANTITY TO ADD *</label>
          <input className="form-input" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} />
        </div>
        <div className="form-group">
          <label>NEW EXPIRY DATE</label>
          <input className="form-input" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </div>
        <div className="form-group">
          <label>RECEIVED DATE</label>
          <input className="form-input" type="date" value={received} onChange={(e) => setReceived(e.target.value)} />
        </div>
        <div className="form-group">
          <label>SUPPLIER</label>
          <SearchableSelect
            options={suppliers.map((s) => ({ value: String(s.supplier_id), label: s.supplier_name, sub: s.contact_person || '' }))}
            value={supplierId}
            displayValue={supplierName}
            onSelect={(val) => {
              const s = suppliers.find((sup) => String(sup.supplier_id) === val)
              setSupplierId(val)
              setSupplierName(s?.supplier_name || '')
            }}
            onClear={() => {
              setSupplierId('')
              setSupplierName('')
            }}
            placeholder="Search suppliers…"
            emptyLabel="No suppliers yet — add one from the Suppliers tab"
          />
        </div>
        <div className="form-group full">
          <label>NOTES</label>
          <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
