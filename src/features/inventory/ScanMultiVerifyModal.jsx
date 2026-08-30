import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { CameraIcon, SaveIcon, ClipboardIcon } from '@components/ui/icons'

// Companion to ScanVerifyModal, for the other shape a QR code can
// arrive in — a whole delivery encoded as one scan (parseMultiQRPayload
// in ScanVerifyModal.jsx), rather than one item per code. Deliberately
// kept lighter than the single-item modal's full field-by-field form:
// with potentially many rows on screen at once, a full form per row
// would be unreviewable at a glance. Each row stays checked/included by
// default (unchecking is the "no, skip that one" action) and only
// quantity is directly editable here — the one field most worth a
// last-second correction on a delivery manifest — everything else
// (category/unit/batch/expiry/supplier) is shown read-only from what
// the code encoded; anything genuinely wrong there is better fixed via
// Edit on the item afterward than by rebuilding a full per-row form.
export default function ScanMultiVerifyModal({ isOpen, rawData, items, onClose, onSave }) {
  const [rows, setRows] = useState(() => (items || []).map((it, idx) => ({ ...it, _id: idx, _include: true })))

  if (!isOpen) return null

  const includedCount = rows.filter((r) => r._include).length

  function toggleRow(id) {
    setRows((rs) => rs.map((r) => (r._id === id ? { ...r, _include: !r._include } : r)))
  }
  function setQty(id, qty) {
    setRows((rs) => rs.map((r) => (r._id === id ? { ...r, qty: qty.replace(/[^0-9]/g, '') } : r)))
  }

  function handleSave() {
    const selected = rows.filter((r) => r._include).map(({ _id, _include, ...rest }) => ({ ...rest, qty: parseInt(rest.qty, 10) || 0 }))
    if (selected.length === 0) return
    onSave(selected)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Multi-Item QR Scan"
      icon={<ClipboardIcon width={16} height={16} />}
      wide
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-blue" onClick={handleSave} disabled={includedCount === 0}>
            <SaveIcon width={13} height={13} /> Save {includedCount} Item{includedCount === 1 ? '' : 's'} to Inventory
          </button>
        </>
      }
    >
      <div className="scan-verify-header">
        <div className="scan-verify-icon">
          <CameraIcon width={20} height={20} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{rows.length} Items Found in This Code</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Uncheck any item you don't want to add, review quantities, then save</div>
        </div>
      </div>
      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table className="compact-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Item</th>
              <th>Category</th>
              <th style={{ width: 90 }}>Quantity</th>
              <th>Unit</th>
              <th>Batch</th>
              <th>Expiry</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} style={{ opacity: r._include ? 1 : 0.45 }}>
                <td>
                  <input type="checkbox" checked={r._include} onChange={() => toggleRow(r._id)} aria-label={`Include ${r.name || 'this item'}`} />
                </td>
                <td>
                  <strong>{r.name || '—'}</strong>
                </td>
                <td style={{ fontSize: 12 }}>{r.category}</td>
                <td>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={r.qty}
                    onChange={(e) => setQty(r._id, e.target.value)}
                    disabled={!r._include}
                    style={{ padding: '4px 8px', fontSize: 12 }}
                  />
                </td>
                <td style={{ fontSize: 12 }}>{r.unit}</td>
                <td style={{ fontSize: 12 }}>{r.batch || '—'}</td>
                <td style={{ fontSize: 12 }}>{r.expiry || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginTop: 14, fontSize: 11, color: 'var(--text-3)' }}>
        <strong>Raw QR Data:</strong> <code style={{ wordBreak: 'break-all' }}>{(rawData || '').substring(0, 200)}</code>
      </div>
    </Modal>
  )
}