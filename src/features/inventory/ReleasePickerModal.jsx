import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { MinusIcon, InventoryIcon } from '@components/ui/icons'
import SearchableSelect from '@components/ui/SearchableSelect'
import { getInventoryStatus, itemKey } from './lib/inventoryHelpers'

export default function ReleasePickerModal({ isOpen, inventory, onClose, onSubmit, onError }) {
  const [selectedId, setSelectedId] = useState('')
  const [qty, setQty] = useState('1')
  const [notes, setNotes] = useState('')

  const releasable = inventory.filter((i) => {
    const st = getInventoryStatus(i)
    return st !== 'Expired' && st !== 'Needs Maintenance'
  })
  const options = releasable.map((i) => ({
    value: itemKey(i),
    label: i.name,
    sub: `${i.category} · ${i.quantity} ${i.unit} available`,
  }))
  const selectedItem = releasable.find((i) => itemKey(i) === selectedId) || null

  function handleSelect(val) {
    setSelectedId(val)
    setQty('1')
    setNotes('')
  }

  function handleClose() {
    setSelectedId('')
    onClose()
  }

  function handleSubmit() {
    if (!selectedItem) return onError('Select an item first')
    const q = parseInt(qty, 10) || 0
    if (q <= 0) return onError('Enter a valid quantity')
    if (q > selectedItem.quantity) return onError(`Cannot release more than available stock (${selectedItem.quantity} ${selectedItem.unit})`)
    onSubmit(itemKey(selectedItem), { qty: q, notes })
    setSelectedId('')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Release Inventory Item"
      icon={<MinusIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-orange"
            disabled={!selectedItem}
            style={!selectedItem ? { opacity: 0.5 } : undefined}
            onClick={handleSubmit}
          >
            <MinusIcon width={13} height={13} /> Release
          </button>
        </>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
        Only non-expired, non-maintenance items are shown.
      </div>
      <div className="form-group" style={{ marginBottom: 14 }}>
        <label>SEARCH ITEM</label>
        <SearchableSelect
          options={options}
          value={selectedId}
          displayValue={selectedItem?.name || ''}
          onSelect={handleSelect}
          onClear={() => setSelectedId('')}
          placeholder="Type to filter items…"
          emptyLabel="No non-expired items found"
        />
      </div>
      {selectedItem && (
        <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, padding: '10px 14px', background: 'var(--surface)', borderRadius: 8 }}>
            <InventoryIcon width={13} height={13} style={{ verticalAlign: -2 }} /> <strong>{selectedItem.name}</strong>{' '}
            <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>
              · Available: <strong>{selectedItem.quantity}</strong> {selectedItem.unit}
            </span>
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
