import { useState } from 'react'
import Modal from '@components/ui/Modal'
import Toggle from '@components/ui/Toggle'
import SearchableSelect from '@components/ui/SearchableSelect'
import { PlusIcon, SaveIcon, XIcon, EditIcon, TrashIcon } from '@components/ui/icons'

const UNITS = ['Tablets', 'Capsules', 'Bottles', 'Boxes', 'Vials', 'Ampules', 'Rolls', 'Pieces', 'Packs', 'Sachets', 'Units', 'Other']

const EMPTY_FORM = {
  name: '',
  category: 'Medicine',
  unit: '',
  quantity: '',
  minStock: '',
  batchNo: '',
  expiry: '',
  received: new Date().toISOString().slice(0, 10),
  supplierId: '',
  supplierName: '',
  fifo: true,
}

export default function AddItemModal({ isOpen, onClose, onSaveAll, onError, suppliers }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [staged, setStaged] = useState([])
  const [editIdx, setEditIdx] = useState(null)

  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  function stageItem() {
    if (!form.name.trim()) return onError('Item name is required')
    if (!form.unit.trim()) return onError('Unit is required')
    const entry = { ...form, name: form.name.trim(), unit: form.unit.trim(), quantity: parseInt(form.quantity, 10) || 0, minStock: parseInt(form.minStock, 10) || 10 }

    if (editIdx !== null) {
      setStaged((list) => list.map((it, i) => (i === editIdx ? entry : it)))
      setEditIdx(null)
    } else {
      setStaged((list) => [...list, entry])
    }
    setForm(EMPTY_FORM)
  }

  function editStaged(idx) {
    setForm(staged[idx])
    setEditIdx(idx)
  }

  function removeStaged(idx) {
    setStaged((list) => list.filter((_, i) => i !== idx))
    if (editIdx === idx) {
      setEditIdx(null)
      setForm(EMPTY_FORM)
    }
  }

  function cancelEdit() {
    setEditIdx(null)
    setForm(EMPTY_FORM)
  }

  function handleClose() {
    setStaged([])
    setForm(EMPTY_FORM)
    setEditIdx(null)
    onClose()
  }

  function handleSaveAll() {
    if (staged.length === 0) return
    onSaveAll(staged)
    handleClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Register Inventory Items"
      icon={<PlusIcon width={16} height={16} />}
      actions={
        <>
          <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 'auto', alignSelf: 'center' }}>
            {staged.length} item{staged.length !== 1 ? 's' : ''} staged
          </span>
          <button type="button" className="btn btn-outline" onClick={handleClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-blue" disabled={staged.length === 0} onClick={handleSaveAll} style={staged.length === 0 ? { opacity: 0.5 } : undefined}>
            <SaveIcon width={13} height={13} /> Save All to Inventory
          </button>
        </>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
        Fill the form and click <strong>Add to Batch List</strong>. Add as many items as needed, then <strong>Save All</strong>.
      </div>

      <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em', marginBottom: 12 }}>
          {editIdx !== null ? 'EDIT STAGED ITEM' : 'NEW ITEM'}
        </div>
        <div className="form-grid">
          <div className="form-group full">
            <label>ITEM NAME *</label>
            <input className="form-input" placeholder="e.g., Paracetamol 500mg" value={form.name} onChange={(e) => setField('name')(e.target.value)} />
          </div>
          <div className="form-group">
            <label>CATEGORY *</label>
            <select className="form-select" value={form.category} onChange={(e) => setField('category')(e.target.value)}>
              <option>Medicine</option>
              <option>Supply</option>
              <option>Equipment</option>
            </select>
          </div>
          <div className="form-group">
            <label>UNIT *</label>
            <select className="form-select" value={form.unit} onChange={(e) => setField('unit')(e.target.value)}>
              <option value="">-- Select Unit --</option>
              {UNITS.map((u) => (
                <option value={u} key={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>QUANTITY *</label>
            <input className="form-input" type="number" min="0" value={form.quantity} onChange={(e) => setField('quantity')(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
          <div className="form-group">
            <label>MIN STOCK LEVEL</label>
            <input className="form-input" type="number" min="0" value={form.minStock} onChange={(e) => setField('minStock')(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
          <div className="form-group">
            <label>BATCH NUMBER</label>
            <input className="form-input" placeholder="e.g., AMX-001" value={form.batchNo} onChange={(e) => setField('batchNo')(e.target.value)} />
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
          {form.category === 'Medicine' && (
            <div className="form-group">
              <label>FIFO TRACKING</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Toggle checked={form.fifo} onChange={setField('fifo')} label="FIFO tracking" />
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>First-In-First-Out</span>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          {editIdx !== null && (
            <button type="button" className="btn btn-outline btn-sm" onClick={cancelEdit}>
              <XIcon width={12} height={12} /> Cancel Edit
            </button>
          )}
          <button type="button" className="btn btn-blue btn-sm" onClick={stageItem}>
            <PlusIcon width={13} height={13} /> {editIdx !== null ? 'Update in Batch List' : 'Add to Batch List'}
          </button>
        </div>
      </div>

      {staged.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {staged.map((it, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--surface)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{it.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  {it.category} · {it.quantity} {it.unit} · Min {it.minStock}
                  {it.batchNo ? ` · Batch: ${it.batchNo}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => editStaged(idx)} title="Edit" aria-label="Edit">
                  <EditIcon width={13} height={13} />
                </button>
                <button type="button" className="btn btn-sm btn-red" onClick={() => removeStaged(idx)} title="Remove" aria-label="Remove">
                  <TrashIcon width={13} height={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}