import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { EditIcon, FolderIcon } from '@components/ui/icons'
import SearchableSelect from '@components/ui/SearchableSelect'

// Edits a batch's OWN details directly (batch/lot number, dates,
// quantity, cost, supplier, purchase reference) — unlike the legacy
// item-edit flow, this NEVER searches for a "matching" batch to merge
// into. Editing here always updates exactly the one batch that was
// opened, full stop — batches only ever combine when a person explicitly
// chooses Replenish on a specific existing batch.
export default function EditBatchModal({ isOpen, batch, onClose, onSubmit, onError, suppliers }) {
  const [form, setForm] = useState(() => ({
    batchNumber: batch?.batch_code || '',
    lotNumber: batch?.lot_number || '',
    supplierId: batch?.supplier_id ? String(batch.supplier_id) : '',
    supplierName: batch?.supplier || '',
    received: batch?.received_date || '',
    expiry: batch?.expiration_date || '',
    quantity: String(batch?.quantity ?? 0),
    unitCost: batch?.unit_cost != null ? String(batch.unit_cost) : '',
    purchaseReference: batch?.purchase_reference || '',
  }))
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  if (!isOpen || !batch) return null

  function handleSubmit() {
    if (!form.batchNumber.trim()) return onError('Batch number is required')
    const qty = parseInt(form.quantity, 10)
    if (!Number.isFinite(qty) || qty < 0) return onError('Enter a valid quantity')
    const unitCost = form.unitCost.trim() ? parseFloat(form.unitCost) : null
    if (form.unitCost.trim() && !Number.isFinite(unitCost)) return onError('Enter a valid unit cost')

    onSubmit({
      batchNumber: form.batchNumber.trim(),
      lotNumber: form.lotNumber.trim() || null,
      supplierId: form.supplierId || null,
      received: form.received || null,
      expiry: form.expiry || null,
      quantity: qty,
      unitCost,
      purchaseReference: form.purchaseReference.trim() || null,
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Batch"
      icon={<EditIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-blue" onClick={handleSubmit}>
            <EditIcon width={13} height={13} /> Save Changes
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8 }}>
        <FolderIcon width={13} height={13} style={{ verticalAlign: -2 }} /> <strong>{batch.item_name}</strong>{' '}
        <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>· editing this batch only — will not merge with any other batch</span>
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label>BATCH NUMBER *</label>
          <input className="form-input" value={form.batchNumber} onChange={(e) => setField('batchNumber')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>LOT NUMBER</label>
          <input className="form-input" placeholder="Manufacturer's lot number" value={form.lotNumber} onChange={(e) => setField('lotNumber')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>QUANTITY ON HAND *</label>
          <input className="form-input" type="number" min="0" value={form.quantity} onChange={(e) => setField('quantity')(e.target.value.replace(/[^0-9]/g, ''))} />
        </div>
        <div className="form-group">
          <label>UNIT COST</label>
          <input className="form-input" type="number" min="0" step="0.01" placeholder="Optional" value={form.unitCost} onChange={(e) => setField('unitCost')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>RECEIVED DATE</label>
          <input className="form-input" type="date" value={form.received} onChange={(e) => setField('received')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>EXPIRATION DATE</label>
          <input className="form-input" type="date" value={form.expiry} onChange={(e) => setField('expiry')(e.target.value)} />
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
        <div className="form-group">
          <label>PURCHASE REFERENCE</label>
          <input className="form-input" placeholder="PO # / invoice #" value={form.purchaseReference} onChange={(e) => setField('purchaseReference')(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
