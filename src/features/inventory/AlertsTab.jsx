import { formatDate } from '@lib/format'
import { getInventoryStatus, isPastISODate, itemKey, daysUntil } from './lib/inventoryHelpers'
import { CheckCircleIcon, AlertOctagonIcon, WrenchIcon, AlertTriangleIcon, BellIcon, TrashIcon, PlusIcon, ClipboardIcon, PackageXIcon } from '@components/ui/icons'

function AlertSection({ title, Icon, items, color, renderRow }) {
  if (items.length === 0) return null
  return (
    <div className="card" style={{ marginBottom: 14, borderTop: `3px solid ${color}` }}>
      <div className="card-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon width={15} height={15} /> {title} ({items.length})
        </h3>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Detail</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>{items.map(renderRow)}</tbody>
        </table>
      </div>
    </div>
  )
}

// Every bucket here is derived purely from getInventoryStatus(i) — the
// same single, shared, automatically-computed status function used
// everywhere else (Items tab, badges, etc.). Nothing here maintains its
// own separate threshold logic anymore (Phase 8 consolidation).
export default function AlertsTab({ inventory, onRemove, onRestore, onReplenish }) {
  const outOfStock = inventory.filter((i) => getInventoryStatus(i) === 'Out of Stock')
  const expired = inventory.filter((i) => getInventoryStatus(i) === 'Expired')
  const needsMaint = inventory.filter(
    (i) =>
      (getInventoryStatus(i) === 'Needs Maintenance' && i.category === 'Equipment') ||
      (i.category === 'Equipment' && isPastISODate(i.expiration_date) && !i.needs_maintenance)
  )
  const critical = inventory.filter((i) => getInventoryStatus(i) === 'Critical Stock')
  const low = inventory.filter((i) => getInventoryStatus(i) === 'Low Stock')
  const nearExpiry = inventory.filter((i) => getInventoryStatus(i) === 'Near Expiry')

  const totalAlerts = outOfStock.length + expired.length + critical.length + low.length + nearExpiry.length + needsMaint.length

  return (
    <>
      {totalAlerts === 0 && (
        <div className="empty-state" style={{ padding: 60 }}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: 'var(--success)' }}>
            <CheckCircleIcon width={48} height={48} />
          </div>
          <h3>All Clear!</h3>
          <p>No inventory alerts at this time.</p>
        </div>
      )}

      <AlertSection
        title="Out of Stock"
        Icon={PackageXIcon}
        items={outOfStock}
        color="var(--danger)"
        renderRow={(i) => (
          <tr key={itemKey(i)}>
            <td>
              <strong>{i.name}</strong>
            </td>
            <td>
              <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
            </td>
            <td style={{ color: 'var(--danger)', fontWeight: 600 }}>
              0 {i.unit} on hand{i.latest_batch_status === 'Archived' ? ' · all batches archived' : i.latest_batch_status === 'Damaged' ? ' · last batch reported damaged' : ''}
            </td>
            <td>
              <button type="button" className="btn btn-sm btn-teal" onClick={() => onReplenish(itemKey(i))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <PlusIcon width={13} height={13} /> Restock
              </button>
            </td>
          </tr>
        )}
      />

      <AlertSection
        title="Expired Items"
        Icon={AlertOctagonIcon}
        items={expired}
        color="var(--danger)"
        renderRow={(i) => (
          <tr key={itemKey(i)}>
            <td>
              <strong>{i.name}</strong>
            </td>
            <td>
              <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
            </td>
            <td style={{ color: 'var(--danger)', fontWeight: 600 }}>Expired: {formatDate(i.expiration_date)}</td>
            <td>
              <button type="button" className="btn btn-sm btn-red" onClick={() => onRemove(itemKey(i))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <TrashIcon width={13} height={13} /> Remove ({i.quantity})
              </button>
            </td>
          </tr>
        )}
      />

      <AlertSection
        title="Needs Maintenance Equipment"
        Icon={WrenchIcon}
        items={needsMaint}
        color="#7C3AED"
        renderRow={(i) => (
          <tr key={itemKey(i)}>
            <td>
              <strong>{i.name}</strong>
            </td>
            <td>
              <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
            </td>
            <td style={{ color: '#7C3AED', fontWeight: 600 }}>
              Flagged for maintenance{i.expiration_date ? ` · Last: ${formatDate(i.expiration_date)}` : ''}
            </td>
            <td>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm btn-teal" onClick={() => onRestore(itemKey(i))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircleIcon width={13} height={13} /> Restore
                </button>
                <button type="button" className="btn btn-sm btn-red" onClick={() => onRemove(itemKey(i))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <TrashIcon width={13} height={13} /> Remove
                </button>
              </div>
            </td>
          </tr>
        )}
      />

      <AlertSection
        title="Critical Stock"
        Icon={AlertTriangleIcon}
        items={critical}
        color="var(--danger)"
        renderRow={(i) => (
          <tr key={itemKey(i)}>
            <td>
              <strong>{i.name}</strong>
            </td>
            <td>
              <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
            </td>
            <td style={{ color: 'var(--danger)', fontWeight: 600 }}>
              {i.quantity} / {i.min_stock} (min) — at or below half of reorder point
            </td>
            <td>
              <button type="button" className="btn btn-sm btn-teal" onClick={() => onReplenish(itemKey(i))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <PlusIcon width={13} height={13} /> Replenish
              </button>
            </td>
          </tr>
        )}
      />

      <AlertSection
        title="Low Stock Items"
        Icon={AlertTriangleIcon}
        items={low}
        color="var(--warning)"
        renderRow={(i) => (
          <tr key={itemKey(i)}>
            <td>
              <strong>{i.name}</strong>
            </td>
            <td>
              <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
            </td>
            <td style={{ color: 'var(--warning)', fontWeight: 600 }}>
              {i.quantity} / {i.min_stock} (min)
            </td>
            <td>
              <button type="button" className="btn btn-sm btn-teal" onClick={() => onReplenish(itemKey(i))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <PlusIcon width={13} height={13} /> Replenish
              </button>
            </td>
          </tr>
        )}
      />

      <AlertSection
        title="Near Expiry (Within 30 Days)"
        Icon={BellIcon}
        items={nearExpiry}
        color="var(--primary)"
        renderRow={(i) => {
          const d = daysUntil(i.expiration_date)
          return (
            <tr key={itemKey(i)}>
              <td>
                <strong>{i.name}</strong>
              </td>
              <td>
                <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
              </td>
              <td style={{ color: 'var(--warning)', fontWeight: 600 }}>
                {formatDate(i.expiration_date)} ({d} days)
              </td>
              <td>
                <button type="button" className="btn btn-sm btn-blue" onClick={() => onReplenish(itemKey(i))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <ClipboardIcon width={13} height={13} /> Review
                </button>
              </td>
            </tr>
          )
        }}
      />
    </>
  )
}
