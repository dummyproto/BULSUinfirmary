import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { MinusIcon, FolderIcon } from '@components/ui/icons'
import SearchableSelect from '@components/ui/SearchableSelect'
import { isPastISODate, batchKey } from './lib/inventoryHelpers'

export default function ReleaseBatchPickerModal({ isOpen, batches, onClose, onSubmit, onError }) {
  const [batchId, setBatchId] = useState('')
  const [qty, setQty] = useState('1')
  const [notes, setNotes] = useState('')

  const releasable = batches.filter((b) => !isPastISODate(b.expiration_date) && b.quantity > 0)
  const options = releasable.map((b) => ({ value: batchKey(b), label: `${b.item_name} — ${b.batch_code}`, sub: `${b.quantity} ${b.item_unit} available` }))
  const selected = releasable.find((b) => batchKey(b) === batchId) || null

  function handleClose() {
    setBatchId('')
    setQty('1')
    setNotes('')
    onClose()
  }

  function handleSubmit() {
    if (!selected) return onError('Select a batch first')
    const q = parseInt(qty, 10) || 0
    if (q <= 0) return onError('Enter a valid quantity')
    if (q > selected.quantity) return onError(`Cannot release more than available batch stock (${selected.quantity})`)
    onSubmit(batchKey(selected), { qty: q, notes: notes.trim() })
    handleClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Release Batch"
      icon={<MinusIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={handleClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-orange" disabled={!selected} style={!selected ? { opacity: 0.5 } : undefined} onClick={handleSubmit}>
            <MinusIcon width={13} height={13} /> Release
          </button>
        </>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>Only non-expired batches with remaining stock are shown.</div>
      <div className="form-group" style={{ marginBottom: 14 }}>
        <label>SEARCH BATCH</label>
        <SearchableSelect
          options={options}
          value={batchId}
          displayValue={selected ? `${selected.item_name} — ${selected.batch_code}` : ''}
          onSelect={setBatchId}
          onClear={() => setBatchId('')}
          placeholder="Type item name or batch ID…"
          emptyLabel="No releasable batches found"
        />
      </div>
      {selected && (
        <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, padding: '10px 14px', background: 'var(--surface)', borderRadius: 8 }}>
            <FolderIcon width={13} height={13} style={{ verticalAlign: -2 }} /> <strong>{selected.item_name}</strong> · Batch {selected.batch_code} · Available: <strong>{selected.quantity}</strong> {selected.item_unit}
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>QUANTITY TO RELEASE *</label>
              <input className="form-input" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
            <div className="form-group">
              <label>PURPOSE / NOTES</label>
              <input className="form-input" placeholder="e.g., Dispensed to patient" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
