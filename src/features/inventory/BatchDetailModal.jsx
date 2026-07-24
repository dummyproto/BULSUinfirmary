import Modal from '@components/ui/Modal'
import StatusBadge from '@components/ui/StatusBadge'
import { formatDate } from '@lib/format'
import { QrCodeIcon, EditIcon, PlusIcon, MinusIcon, TrashIcon } from '@components/ui/icons'
import { batchKey, getBatchStatus } from './lib/inventoryHelpers'

// Opened automatically when a batch's own QR code is scanned (Phase 9) —
// "scanning the QR code should immediately open the corresponding batch
// details". A read-only detail view plus quick-action shortcuts that
// reuse the exact same handlers the Batches tab already uses, so acting
// on a batch found via scan behaves identically to acting on it from the
// table.
export default function BatchDetailModal({ isOpen, batch, onClose, onEditBatch, onReplenishBatch, onReleaseBatch, onArchiveBatch }) {
  if (!isOpen || !batch) return null
  const status = getBatchStatus(batch)
  const archived = batch.status === 'Archived'

  const row = (label, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Batch Details"
      icon={<QrCodeIcon width={16} height={16} />}
      actions={
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Close
        </button>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{batch.item_name}</h3>
        <StatusBadge status={status} />
      </div>
      <div style={{ marginBottom: 10 }}>
        {row('Batch Number', batch.batch_code)}
        {row('Lot Number', batch.lot_number || '—')}
        {row('Quantity on Hand', `${batch.quantity} ${batch.item_unit}`)}
        {row('Received Date', batch.received_date ? formatDate(batch.received_date) : '—')}
        {row('Expiration Date', batch.expiration_date ? formatDate(batch.expiration_date) : 'N/A')}
        {row('Supplier', batch.supplier || '—')}
        {row('Purchase Reference', batch.purchase_reference || '—')}
      </div>

      {!archived && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm btn-blue" onClick={() => onEditBatch(batchKey(batch))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <EditIcon width={13} height={13} /> Edit
          </button>
          <button type="button" className="btn btn-sm btn-teal" onClick={() => onReplenishBatch(batchKey(batch))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <PlusIcon width={13} height={13} /> Replenish
          </button>
          {!['Expired', 'Depleted', 'Damaged'].includes(status) && (
            <button type="button" className="btn btn-sm btn-orange" onClick={() => onReleaseBatch(batchKey(batch))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <MinusIcon width={13} height={13} /> Release
            </button>
          )}
          <button type="button" className="btn btn-sm btn-red" onClick={() => onArchiveBatch(batchKey(batch))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <TrashIcon width={13} height={13} /> Archive
          </button>
        </div>
      )}
    </Modal>
  )
}
