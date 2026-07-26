import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { MinusIcon, InventoryIcon } from '@components/ui/icons'

export default function ReleaseModal({ isOpen, item, onClose, onSubmit, onError }) {
  const [qty, setQty] = useState('1')
  const [notes, setNotes] = useState('')

  if (!isOpen || !item) return null

  function handleSubmit() {
    const q = parseInt(qty, 10) || 0
    if (q <= 0) return onError('Enter a valid quantity')
    if (q > item.quantity) return onError(`Cannot release more than available stock (${item.quantity} ${item.unit})`)
    onSubmit({ qty: q, notes })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Release Stock"
      icon={<MinusIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-orange" onClick={handleSubmit}>
            <MinusIcon width={13} height={13} /> Release
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8 }}>
        <InventoryIcon width={13} height={13} style={{ verticalAlign: -2 }} /> <strong>{item.name}</strong> <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>· Available: <strong>{item.quantity}</strong> {item.unit}</span>
      </div>
      <div className="form-group">
        <label>QUANTITY TO RELEASE *</label>
        <input className="form-input" type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} />
      </div>
      <div className="form-group" style={{ marginTop: 10 }}>
        <label>PURPOSE / NOTES</label>
        <input className="form-input" placeholder="e.g., Dispensed to patient, Consumed" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  )
}
