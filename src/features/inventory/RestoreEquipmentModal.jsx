import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { CheckCircleIcon } from '@components/ui/icons'

export default function RestoreEquipmentModal({ isOpen, item, onClose, onSubmit, onError }) {
  const [restoreQty, setRestoreQty] = useState(item ? String(item.quantity) : '')
  const [expiry, setExpiry] = useState('')
  const [notes, setNotes] = useState('')

  if (!isOpen || !item) return null

  const remaining = item.quantity - Math.min(Math.max(parseInt(restoreQty, 10) || 0, 0), item.quantity)
  const today = new Date().toISOString().slice(0, 10)

  function handleSubmit() {
    if (!expiry) return onError('Next maintenance date is required')
    if (expiry <= today) return onError('Maintenance date must be a future date')
    const qty = parseInt(restoreQty, 10)
    if (!qty || qty < 1 || qty > item.quantity) return onError(`Enter a quantity between 1 and ${item.quantity}`)
    onSubmit({ restoreQty: qty, expiry, notes: notes.trim() || 'Maintenance completed — restored to active inventory' })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Restore Equipment — ${item.name}`}
      icon={<CheckCircleIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-teal" onClick={handleSubmit}>
            <CheckCircleIcon width={13} height={13} /> Restore to Active Inventory
          </button>
        </>
      }
    >
      <div className="alert alert-info" style={{ marginBottom: 18 }}>
        Maintenance complete. Choose how many units to restore and set the next maintenance date. Restored units move back to Non-Expired Items; any units you don't restore are held back and removed from tracked inventory.
      </div>
      <div className="form-group full">
        <label>UNITS TO RESTORE *</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            className="form-input"
            type="number"
            min="1"
            max={item.quantity}
            value={restoreQty}
            onChange={(e) => setRestoreQty(e.target.value.replace(/[^0-9]/g, ''))}
            style={{ width: 110, fontSize: 16, fontWeight: 700, textAlign: 'center' }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            of <strong>{item.quantity}</strong> {item.unit}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>
          {remaining} {item.unit} will be held back and removed from tracked inventory
        </div>
      </div>
      <div className="form-group full" style={{ marginTop: 12 }}>
        <label>NEXT MAINTENANCE DATE *</label>
        <input className="form-input" type="date" value={expiry} min={today} onChange={(e) => setExpiry(e.target.value)} />
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Must be a future date. Restored units will appear as non-expired.</div>
      </div>
      <div className="form-group full" style={{ marginTop: 12 }}>
        <label>
          NOTES <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(optional)</span>
        </label>
        <input className="form-input" placeholder="e.g., Calibrated and tested — ready for use" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  )
}
