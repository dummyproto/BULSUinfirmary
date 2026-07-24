import SearchInput from '@components/ui/SearchInput'
import { formatDate } from '@lib/format'
import { batchKey, getBatchStatus, daysUntil } from './lib/inventoryHelpers'
import { FolderIcon, MinusIcon, PlusIcon, EditIcon, TrashIcon, RefreshCwIcon, AlertTriangleIcon, QrCodeIcon } from '@components/ui/icons'

function statusColor(status) {
  if (status === 'Expired' || status === 'Recalled' || status === 'Damaged') return 'badge-red'
  if (status === 'Near Expiry') return 'badge-orange'
  if (status === 'Depleted' || status === 'Archived') return 'badge-gray'
  return 'badge-green'
}

function BatchRow({ b, onEditBatch, onReplenishBatch, onReleaseBatch, onArchiveBatch, onUnarchiveBatch, onReportDamaged, onViewQR, showItemColumn }) {
  const status = getBatchStatus(b)
  const daysLeft = daysUntil(b.expiration_date)
  const archived = b.status === 'Archived'
  const isMedicine = b._source === 'medicine'

  return (
    <tr style={archived ? { opacity: 0.6 } : undefined}>
      <td>
        <code style={{ fontSize: 12, background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>{b.batch_code}</code>
        {b.lot_number && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Lot: {b.lot_number}</div>}
      </td>
      {showItemColumn && (
        <td>
          <strong>{b.item_name}</strong>
        </td>
      )}
      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{b.quantity}</td>
      <td style={{ fontSize: 12 }}>{b.received_date ? formatDate(b.received_date) : '—'}</td>
      <td
        style={{
          fontSize: 12,
          fontWeight: status !== 'Available' && status !== 'No Expiry' ? 700 : 400,
          color: status === 'Expired' ? 'var(--danger)' : status === 'Near Expiry' ? 'var(--warning)' : 'var(--text)',
        }}
      >
        {b.expiration_date ? formatDate(b.expiration_date) : 'N/A'}
      </td>
      <td style={{ fontSize: 12, color: daysLeft !== null && daysLeft < 0 ? 'var(--danger)' : daysLeft !== null && daysLeft <= 30 ? 'var(--warning)' : 'var(--text-2)' }}>
        {daysLeft === null ? '—' : daysLeft < 0 ? <strong>EXPIRED</strong> : daysLeft === 0 ? <strong>Today</strong> : `${daysLeft}d`}
      </td>
      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{b.supplier || '—'}</td>
      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{b.purchase_reference || '—'}</td>
      <td>
        <span className={`badge ${statusColor(status)} badge-no-dot`} style={{ fontSize: 11 }}>
          {status}
        </span>
      </td>
      <td>
        <div className="inv-action-group">
          {isMedicine && (
            <div className="inv-action-secondary">
              <button type="button" className="btn btn-sm btn-outline inv-action-btn" onClick={() => onViewQR(batchKey(b))} title="View / download this batch's QR code" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <QrCodeIcon width={13} height={13} /> QR
              </button>
            </div>
          )}
          {archived ? (
            isMedicine && (
              <div className="inv-action-primary">
                <button type="button" className="btn btn-sm btn-outline inv-action-btn" onClick={() => onUnarchiveBatch(batchKey(b))} title="Restore this batch to active" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <RefreshCwIcon width={13} height={13} /> Unarchive
                </button>
              </div>
            )
          ) : (
            <>
              {isMedicine && (
                <div className="inv-action-primary">
                  <button type="button" className="btn btn-sm btn-blue inv-action-btn" onClick={() => onEditBatch(batchKey(b))} title="Edit this batch's details" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <EditIcon width={13} height={13} /> Edit
                  </button>
                </div>
              )}
              <div className="inv-action-secondary">
                <button type="button" className="btn btn-sm btn-teal inv-action-btn" onClick={() => onReplenishBatch(batchKey(b))} title="Add stock to this batch" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <PlusIcon width={13} height={13} /> Replenish
                </button>
              </div>
              {!['Expired', 'Depleted', 'Damaged'].includes(status) && (
                <div className="inv-action-secondary">
                  <button type="button" className="btn btn-sm btn-orange inv-action-btn" onClick={() => onReleaseBatch(batchKey(b))} title="Release stock from this batch" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <MinusIcon width={13} height={13} /> Release
                  </button>
                </div>
              )}
              {isMedicine && (
                <div className="inv-action-secondary">
                  <button type="button" className="btn btn-sm btn-outline inv-action-btn" onClick={() => onReportDamaged(batchKey(b))} title="Report a quantity of this batch as damaged" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <AlertTriangleIcon width={13} height={13} /> Damaged
                  </button>
                </div>
              )}
              {isMedicine && (
                <div className="inv-action-destructive">
                  <button type="button" className="btn btn-sm btn-red inv-action-btn" onClick={() => onArchiveBatch(batchKey(b))} title="Archive this batch — removes it from active stock, keeps its history" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <TrashIcon width={13} height={13} /> Archive
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function BatchesTab({ batches, search, onSearchChange, onAddBatch, onReleaseBatchPicker, onEditBatch, onReplenishBatch, onReleaseBatch, onArchiveBatch, onUnarchiveBatch, onReportDamaged, onViewQR }) {
  const q = search.toLowerCase()
  const filtered = search
    ? batches.filter((b) => b.batch_code.toLowerCase().includes(q) || b.item_name.toLowerCase().includes(q) || (b.supplier || '').toLowerCase().includes(q))
    : batches

  // Batches must display grouped under each medicine, not as one flat
  // list — one section per medicine, its batches listed beneath it.
  // Legacy (Supply/Equipment) batches don't have a "medicine" to group
  // under, so they stay in their own flat section, exactly as before.
  const medicineBatches = filtered.filter((b) => b._source === 'medicine')
  const legacyBatches = filtered.filter((b) => b._source !== 'medicine')

  const medicineGroups = []
  for (const b of medicineBatches) {
    let group = medicineGroups.find((g) => g.medicine_id === b.medicine_id)
    if (!group) {
      group = { medicine_id: b.medicine_id, name: b.item_name, unit: b.item_unit, batches: [] }
      medicineGroups.push(group)
    }
    group.batches.push(b)
  }
  medicineGroups.sort((a, b) => a.name.localeCompare(b.name))
  for (const g of medicineGroups) {
    g.batches.sort((a, b) => (a.expiration_date || '9999').localeCompare(b.expiration_date || '9999'))
  }

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <FolderIcon width={15} height={15} /> Batch Tracking
        </h3>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={onSearchChange} placeholder="Search batch ID, item, supplier…" width={220} />
          <button type="button" className="btn btn-sm btn-teal" onClick={onAddBatch} title="Add a new batch to an item" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <FolderIcon width={13} height={13} /> Add Batch
          </button>
          <button type="button" className="btn btn-sm btn-orange" onClick={onReleaseBatchPicker} title="Choose a batch and release stock" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MinusIcon width={13} height={13} /> Release Batch
          </button>
        </div>
      </div>

      {medicineGroups.length === 0 && legacyBatches.length === 0 && (
        <div className="empty-state" style={{ padding: 40 }}>
          <p>No batches found</p>
        </div>
      )}

      {medicineGroups.map((group) => {
        const activeTotal = group.batches.filter((b) => b.status === 'Active').reduce((sum, b) => sum + b.quantity, 0)
        return (
          <div key={group.medicine_id} style={{ marginBottom: 4 }}>
            <div style={{ padding: '10px 18px', background: 'var(--surface2)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong style={{ fontSize: 13 }}>{group.name}</strong>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {group.batches.length} batch{group.batches.length !== 1 ? 'es' : ''} · {activeTotal} {group.unit} active on hand
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Batch / Lot</th>
                    <th>Qty in Batch</th>
                    <th>Received Date</th>
                    <th>Expiry Date</th>
                    <th>Days Left</th>
                    <th>Supplier</th>
                    <th>Purchase Ref.</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.batches.map((b) => (
                    <BatchRow
                      key={batchKey(b)}
                      b={b}
                      showItemColumn={false}
                      onEditBatch={onEditBatch}
                      onReplenishBatch={onReplenishBatch}
                      onReleaseBatch={onReleaseBatch}
                      onArchiveBatch={onArchiveBatch}
                      onViewQR={onViewQR}
                      onReportDamaged={onReportDamaged}
                      onUnarchiveBatch={onUnarchiveBatch}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {legacyBatches.length > 0 && (
        <div>
          <div style={{ padding: '10px 18px', background: 'var(--surface2)', borderTop: '1px solid var(--border)' }}>
            <strong style={{ fontSize: 13 }}>Other Items (Supply / Equipment)</strong>
            <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>{legacyBatches.length} batch{legacyBatches.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Batch ID</th>
                  <th>Item Name</th>
                  <th>Qty in Batch</th>
                  <th>Received Date</th>
                  <th>Expiry Date</th>
                  <th>Days Left</th>
                  <th>Supplier</th>
                  <th>Purchase Ref.</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {legacyBatches.map((b) => (
                  <BatchRow key={batchKey(b)} b={b} showItemColumn onReplenishBatch={onReplenishBatch} onReleaseBatch={onReleaseBatch} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ padding: '12px 18px', fontSize: 12, color: 'var(--text-3)' }}>
        Batches are never merged automatically — Replenish always adds to the specific batch you choose; a new delivery is always a new batch.
      </div>
    </div>
  )
}
