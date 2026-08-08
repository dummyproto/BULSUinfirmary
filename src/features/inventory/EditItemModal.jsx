import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { EditIcon } from '@components/ui/icons'
import SearchableSelect from '@components/ui/SearchableSelect'
import ItemPhotoUpload from './ItemPhotoUpload'

function buildForm(item, suppliers) {
  const matched = item.supplier ? suppliers.find((s) => s.supplier_name === item.supplier) : null
  return {
    name: item.name,
    category: item.category,
    unit: item.unit,
    minStock: String(item.min_stock),
    batchNo: item.batch_no || '',
    expiry: item.expiration_date || '',
    received: item.received_date || new Date().toISOString().slice(0, 10),
    supplierId: matched ? String(matched.supplier_id) : '',
    supplierName: item.supplier || '',
    // Medicine reads image_url straight off the medicine record (via
    // medicine_inventory_view); legacy Supply/Equipment items read it
    // off the same-named column added to the `inventory` table —
    // whichever source this item came from, the app-level shape already
    // exposes it as item.image_url either way.
    photoUrl: item.image_url || '',
  }
}

export default function EditItemModal({ isOpen, item, onClose, onSave, suppliers, onError }) {
  const [form, setForm] = useState(() => (item ? buildForm(item, suppliers) : null))

  if (!isOpen || !form) return null
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))
  const isMedicine = item._source === 'medicine'

  function handleSave() {
    if (!form.name.trim()) return
    onSave({
      ...form,
      name: form.name.trim(),
      minStock: parseInt(form.minStock, 10) || 10,
      batchNo: form.batchNo || null,
      expiry: form.expiry || null,
      supplierId: form.supplierId || null,
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Inventory Item"
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
        <ItemPhotoUpload value={form.photoUrl} onChange={(url) => setField('photoUrl')(url)} onError={onError} />
        <div className="form-group full">
          <label>ITEM NAME *</label>
          <input className="form-input" value={form.name} onChange={(e) => setField('name')(e.target.value)} />
        </div>

        {isMedicine ? (
          // Medicine's quantity/batch/expiration/supplier all live on its
          // batches, not the medicine record itself — Edit Batch is where
          // those actually get changed. Showing them here would look
          // editable but be silently discarded on save (found during the
          // Phase 4c audit — handleEditSave's medicine branch only ever
          // reads name/unit/minStock from this form), so they're not
          // shown at all for a medicine item, rather than shown and lied
          // about.
          <div className="form-group full" style={{ fontSize: 12, color: 'var(--text-3)', background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
            This is a Medicine item — quantity, batch details, expiration, and supplier are managed per-batch on the Batches tab, not here.
          </div>
        ) : (
          <div className="form-group">
            <label>CATEGORY</label>
            <select className="form-select" value={form.category} onChange={(e) => setField('category')(e.target.value)}>
              {/* 'Medicine' deliberately excluded here — this select writes
                  straight into the legacy `inventory.category` column, and
                  a legacy row saved with category='Medicine' would be
                  silently filtered out of every view (Medicine rows are
                  expected to live in the `medicines` table instead), not
                  actually migrated there. To reclassify an item as
                  Medicine, add it fresh via Add Item, which already routes
                  correctly, then remove the old Supply/Equipment entry. */}
              <option>Supply</option>
              <option>Equipment</option>
            </select>
          </div>
        )}

        <div className="form-group">
          <label>UNIT</label>
          <input className="form-input" value={form.unit} onChange={(e) => setField('unit')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>MIN STOCK</label>
          <input className="form-input" type="number" min="0" value={form.minStock} onChange={(e) => setField('minStock')(e.target.value.replace(/[^0-9]/g, ''))} />
        </div>

        {!isMedicine && (
          <>
            <div className="form-group">
              <label>BATCH NUMBER</label>
              <input className="form-input" value={form.batchNo} onChange={(e) => setField('batchNo')(e.target.value)} />
            </div>
            <div className="form-group">
              <label>{form.category === 'Equipment' ? 'MAINTENANCE DATE' : 'EXPIRATION DATE'}</label>
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
          </>
        )}
      </div>
    </Modal>
  )
}