import { useState } from 'react'
import Modal from '@components/ui/Modal'
import SearchableSelect from '@components/ui/SearchableSelect'
import { FolderIcon } from '@components/ui/icons'
import { itemKey } from './lib/inventoryHelpers'

const EMPTY = { itemId: '', itemDisplay: '', creatingNew: false, newName: '', newCategory: 'Medicine', newUnit: '', newMinStock: '10', batchCode: '', qty: '1', expiry: '', received: new Date().toISOString().slice(0, 10), supplierId: '', supplierName: '', invoiceNumber: '', notes: '' }

export default function AddBatchModal({ isOpen, onClose, onSubmit, onError, inventory, suppliers }) {
  const [form, setForm] = useState(EMPTY)
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  const itemOptions = inventory.map((i) => ({ value: itemKey(i), label: i.name, sub: `${i.category} · ${i.quantity} ${i.unit} on hand` }))

  function toggleCreateNew() {
    setForm((f) => ({ ...f, creatingNew: !f.creatingNew, itemId: '', itemDisplay: '' }))
  }

  function handleClose() {
    setForm(EMPTY)
    onClose()
  }

  function handleSubmit() {
    if (!form.creatingNew && !form.itemId) return onError('Please select an inventory item, or switch to creating a new one')
    if (form.creatingNew && !form.newName.trim()) return onError('Item name is required')
    if (form.creatingNew && !form.newUnit.trim()) return onError('Unit is required for a new item')
    if (!form.batchCode.trim()) return onError('Batch number is required')
    const qty = parseInt(form.qty, 10) || 0
    if (qty <= 0) return onError('Quantity must be greater than 0')

    onSubmit({
      itemId: form.creatingNew ? null : form.itemId,
      newItem: form.creatingNew ? { name: form.newName.trim(), category: form.newCategory, unit: form.newUnit.trim(), minStock: parseInt(form.newMinStock, 10) || 10 } : null,
      batchCode: form.batchCode.trim(),
      qty,
      expiry: form.expiry || null,
      received: form.received,
      supplierId: form.supplierId || null,
      invoiceNumber: form.invoiceNumber.trim(),
      notes: form.notes.trim(),
    })
    setForm(EMPTY)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Batch"
      icon={<FolderIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={handleClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-teal" onClick={handleSubmit}>
            <FolderIcon width={13} height={13} /> Add Batch
          </button>
        </>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>Select an existing item, or create a new one for this batch.</div>

      <div className="form-grid">
        <div className="form-group full">
          <label>INVENTORY ITEM *</label>
          {!form.creatingNew ? (
            <SearchableSelect
              options={itemOptions}
              value={form.itemId}
              displayValue={form.itemDisplay}
              placeholder="Search existing item…"
              onSelect={(val) => {
                const opt = itemOptions.find((o) => o.value === val)
                setForm((f) => ({ ...f, itemId: val, itemDisplay: opt?.label || '' }))
              }}
              onClear={() => setField('itemId')('')}
              emptyLabel="No items found"
            />
          ) : (
            <input className="form-input" placeholder="New item name…" value={form.newName} onChange={(e) => setField('newName')(e.target.value)} />
          )}
          <button type="button" className="btn btn-sm btn-outline" style={{ marginTop: 8 }} onClick={toggleCreateNew}>
            {form.creatingNew ? '← Choose Existing Item Instead' : '+ Create New Item Instead'}
          </button>
        </div>

        {form.creatingNew && (
          <div className="form-group full" style={{ background: 'rgba(30,123,94,.07)', border: '1.5px dashed var(--primary)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', letterSpacing: '.06em', marginBottom: 10 }}>🆕 NEW ITEM — FILL IN DETAILS</div>
            <div className="form-grid">
              <div className="form-group">
                <label>CATEGORY *</label>
                <select className="form-select" value={form.newCategory} onChange={(e) => setField('newCategory')(e.target.value)}>
                  <option>Medicine</option>
                  <option>Supply</option>
                  <option>Equipment</option>
                </select>
              </div>
              <div className="form-group">
                <label>UNIT *</label>
                <input className="form-input" placeholder="e.g., Tablets, Rolls, Units" value={form.newUnit} onChange={(e) => setField('newUnit')(e.target.value)} />
              </div>
              <div className="form-group">
                <label>MIN STOCK LEVEL</label>
                <input className="form-input" type="number" min="0" value={form.newMinStock} onChange={(e) => setField('newMinStock')(e.target.value.replace(/[^0-9]/g, ''))} />
              </div>
            </div>
          </div>
        )}

        <div className="form-group">
          <label>BATCH NUMBER *</label>
          <input className="form-input" placeholder="e.g., AMX-2026-001" value={form.batchCode} onChange={(e) => setField('batchCode')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>QUANTITY TO ADD *</label>
          <input className="form-input" type="number" min="1" value={form.qty} onChange={(e) => setField('qty')(e.target.value.replace(/[^0-9]/g, ''))} />
        </div>
        <div className="form-group">
          <label>EXPIRY / MAINTENANCE DATE</label>
          <input className="form-input" type="date" value={form.expiry} onChange={(e) => setField('expiry')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>RECEIVED DATE</label>
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
        <div className="form-group">
          <label>INVOICE NUMBER</label>
          <input className="form-input" placeholder="Optional — for medicine receiving records" value={form.invoiceNumber} onChange={(e) => setField('invoiceNumber')(e.target.value)} />
        </div>
        <div className="form-group full">
          <label>NOTES</label>
          <input className="form-input" placeholder="Optional notes about this batch" value={form.notes} onChange={(e) => setField('notes')(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
