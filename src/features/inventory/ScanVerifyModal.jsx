import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { CameraIcon, AlertTriangleIcon, SaveIcon } from '@components/ui/icons'
import SearchableSelect from '@components/ui/SearchableSelect'

// Maps one parsed JSON object's fields into the shape this app's forms
// use — shared by both parseQRPayload (single item) and
// parseMultiQRPayload (many items in one code) below so the two don't
// carry two separate copies of the same field-name fallbacks.
function mapItemFields(obj) {
  return {
    name: obj.name || obj.itemName || '',
    category: obj.category || 'Medicine',
    qty: parseInt(obj.qty || obj.quantity || 0, 10),
    unit: obj.unit || 'Units',
    batch: obj.batch || obj.batchNo || obj.batchId || '',
    expiry: obj.expiry || obj.expirationDate || obj.expDate || '',
    receivedDate: obj.receivedDate || obj.dateReceived || obj.received || '',
    supplier: obj.supplier || obj.source || '',
    minStock: parseInt(obj.minStock || obj.minimumStock || 10, 10),
  }
}

function parseQRPayload(raw) {
  const trimmed = raw.trim()
  try {
    const obj = JSON.parse(trimmed)
    // An array (or {items:[...]}) is a MULTI-item code — let
    // parseMultiQRPayload handle it instead of reading it here as if
    // it were a single item's own field set (which would silently
    // produce a garbage/empty single item rather than a useful error).
    if (Array.isArray(obj) || Array.isArray(obj.items)) return null
    return mapItemFields(obj)
  } catch {
    // fall through to pipe-delimited parsing
  }
  const parts = trimmed.split('|').map((p) => p.trim())
  if (parts.length >= 3) {
    return {
      name: parts[0] || '',
      category: parts[1] || 'Medicine',
      qty: parseInt(parts[2], 10) || 0,
      unit: parts[3] || 'Units',
      batch: parts[4] || '',
      expiry: parts[5] || '',
      supplier: parts[6] || '',
      minStock: parseInt(parts[7], 10) || 10,
      receivedDate: parts[8] || '',
    }
  }
  return null
}

// A single QR normally encodes one item's restock details — this reads
// the OTHER shape a code can arrive in: a whole delivery/shipment as one
// scan, encoded either as a bare JSON array (`[{...},{...}]`) or as
// `{"items":[{...},{...}]}`. Only treated as "multi" once there are
// actually 2+ usable (named) items — a single-element array/`items`
// list falls back to the ordinary single-item flow above instead of
// opening the extra multi-item review step for no real benefit.
function parseMultiQRPayload(raw) {
  const trimmed = raw.trim()
  let obj
  try {
    obj = JSON.parse(trimmed)
  } catch {
    return null
  }
  const list = Array.isArray(obj) ? obj : Array.isArray(obj.items) ? obj.items : null
  if (!list) return null
  const items = list.map(mapItemFields).filter((it) => it.name)
  return items.length >= 2 ? items : null
}

// Re-exported so InventoryPage.jsx, ScanTab.jsx, and
// ScanMultiVerifyModal.jsx can all reuse this exact same QR-parsing
// logic (recognizing our own item/batch/multi-item payload shapes)
// instead of each duplicating it.
// eslint-disable-next-line react-refresh/only-export-components
export { parseQRPayload, parseMultiQRPayload }

export default function ScanVerifyModal({ isOpen, rawData, matchedItem, onClose, onSave, suppliers = [] }) {
  const parsed = rawData ? parseQRPayload(rawData) : null
  const [form, setForm] = useState(() => {
    const base = parsed || {
      name: '',
      category: 'Medicine',
      qty: 0,
      unit: 'Units',
      batch: '',
      expiry: '',
      receivedDate: new Date().toISOString().slice(0, 10),
      minStock: 10,
    }
    // The scanned QR payload only ever contains a supplier NAME as plain
    // text — resolve it against known suppliers so the field starts as a
    // proper selection when there's an exact match, rather than silently
    // discarding what was scanned.
    const scannedName = parsed?.supplier || ''
    const matched = scannedName ? suppliers.find((s) => s.supplier_name.toLowerCase() === scannedName.toLowerCase()) : null
    return { ...base, supplierId: matched ? String(matched.supplier_id) : '', supplierName: matched?.supplier_name || '' }
  })

  if (!isOpen) return null
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  function handleSave() {
    if (!form.name.trim()) return
    onSave({ ...form, name: form.name.trim() })
  }

  const dupWarning = matchedItem ? (
    <div className="alert alert-warning" style={{ marginBottom: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <AlertTriangleIcon width={15} height={15} style={{ flexShrink: 0, marginTop: 2 }} />
      <span><strong>Matching Item Detected:</strong> "{form.name}" already exists with the same category, unit, and
      supplier (Stock: {matchedItem.quantity} {matchedItem.unit}). Saving will <strong>merge stock</strong>.</span>
    </div>
  ) : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="QR Scan Verification"
      icon={<CameraIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-blue" onClick={handleSave}>
            <SaveIcon width={13} height={13} /> Save to Inventory
          </button>
        </>
      }
    >
      {dupWarning}
      <div className="scan-verify-header">
        <div className="scan-verify-icon"><CameraIcon width={20} height={20} /></div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>QR Scan Successful</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Review and edit fields before saving</div>
        </div>
      </div>
      {!parsed ? (
        <div className="alert alert-danger" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangleIcon width={15} height={15} style={{ flexShrink: 0 }} /> Could not extract item information from this data.
        </div>
      ) : (
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="form-group full">
            <label>ITEM NAME *</label>
            <input className="form-input" value={form.name} onChange={(e) => setField('name')(e.target.value)} />
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
            <label>UNIT</label>
            <input className="form-input" value={form.unit} onChange={(e) => setField('unit')(e.target.value)} />
          </div>
          <div className="form-group">
            <label>QUANTITY *</label>
            <input className="form-input" type="number" min="0" value={form.qty} onChange={(e) => setField('qty')(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
          <div className="form-group">
            <label>MIN STOCK LEVEL</label>
            <input className="form-input" type="number" min="0" value={form.minStock} onChange={(e) => setField('minStock')(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
          <div className="form-group">
            <label>BATCH NUMBER</label>
            <input className="form-input" value={form.batch} onChange={(e) => setField('batch')(e.target.value)} />
          </div>
          <div className="form-group">
            <label>EXPIRY DATE</label>
            <input className="form-input" type="date" value={form.expiry} onChange={(e) => setField('expiry')(e.target.value)} />
          </div>
          <div className="form-group">
            <label>DATE RECEIVED</label>
            <input className="form-input" type="date" value={form.receivedDate} onChange={(e) => setField('receivedDate')(e.target.value)} />
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
        </div>
      )}
      <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
        <strong>Raw QR Data:</strong> <code style={{ wordBreak: 'break-all' }}>{(rawData || '').substring(0, 200)}</code>
      </div>
    </Modal>
  )
}
