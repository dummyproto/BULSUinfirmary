import { formatDate } from '@lib/format'
import { getInventoryStatus, isPastISODate, itemKey, daysUntil } from './lib/inventoryHelpers'
import { CheckCircleIcon, AlertOctagonIcon, WrenchIcon, AlertTriangleIcon, BellIcon, PackageXIcon } from '@components/ui/icons'

function AlertSection({ title, Icon, items, color, onItemClick, renderRow }) {
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
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={itemKey(i)} onClick={() => onItemClick(i)} style={{ cursor: 'pointer' }}>
                {renderRow(i)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Every bucket here is derived purely from getInventoryStatus(i) — the
// same single, shared, automatically-computed status function used
// everywhere else (Items tab, badges, etc.). Nothing here maintains its
// own separate threshold logic anymore (Phase 8 consolidation).
//
// Rows have no per-row action buttons — clicking anywhere on a row calls
// onItemClick, which the parent uses to jump to the Items tab with that
// item's detail open, rather than exposing a different quick-action per
// alert type here.
export default function AlertsTab({ inventory, onItemClick }) {
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
        onItemClick={onItemClick}
        renderRow={(i) => (
          <>
            <td>
              <strong>{i.name}</strong>
            </td>
            <td>
              <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
            </td>
            <td style={{ color: 'var(--danger)', fontWeight: 600 }}>
              0 {i.unit} on hand{i.latest_batch_status === 'Archived' ? ' · all batches archived' : i.latest_batch_status === 'Damaged' ? ' · last batch reported damaged' : ''}
            </td>
          </>
        )}
      />

      <AlertSection
        title="Expired Items"
        Icon={AlertOctagonIcon}
        items={expired}
        color="var(--danger)"
        onItemClick={onItemClick}
        renderRow={(i) => (
          <>
            <td>
              <strong>{i.name}</strong>
            </td>
            <td>
              <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
            </td>
            <td style={{ color: 'var(--danger)', fontWeight: 600 }}>Expired: {formatDate(i.expiration_date)}</td>
          </>
        )}
      />

      <AlertSection
        title="Needs Maintenance Equipment"
        Icon={WrenchIcon}
        items={needsMaint}
        color="#7C3AED"
        onItemClick={onItemClick}
        renderRow={(i) => (
          <>
            <td>
              <strong>{i.name}</strong>
            </td>
            <td>
              <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
            </td>
            <td style={{ color: '#7C3AED', fontWeight: 600 }}>
              Flagged for maintenance{i.expiration_date ? ` · Last: ${formatDate(i.expiration_date)}` : ''}
            </td>
          </>
        )}
      />

      <AlertSection
        title="Critical Stock"
        Icon={AlertTriangleIcon}
        items={critical}
        color="var(--danger)"
        onItemClick={onItemClick}
        renderRow={(i) => (
          <>
            <td>
              <strong>{i.name}</strong>
            </td>
            <td>
              <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
            </td>
            <td style={{ color: 'var(--danger)', fontWeight: 600 }}>
              {i.quantity} / {i.min_stock} (min) — at or below half of reorder point
            </td>
          </>
        )}
      />

      <AlertSection
        title="Low Stock Items"
        Icon={AlertTriangleIcon}
        items={low}
        color="var(--warning)"
        onItemClick={onItemClick}
        renderRow={(i) => (
          <>
            <td>
              <strong>{i.name}</strong>
            </td>
            <td>
              <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
            </td>
            <td style={{ color: 'var(--warning)', fontWeight: 600 }}>
              {i.quantity} / {i.min_stock} (min)
            </td>
          </>
        )}
      />

      <AlertSection
        title="Near Expiry (Within 30 Days)"
        Icon={BellIcon}
        items={nearExpiry}
        color="var(--primary)"
        onItemClick={onItemClick}
        renderRow={(i) => {
          const d = daysUntil(i.expiration_date)
          return (
            <>
              <td>
                <strong>{i.name}</strong>
              </td>
              <td>
                <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
              </td>
              <td style={{ color: 'var(--warning)', fontWeight: 600 }}>
                {formatDate(i.expiration_date)} ({d} days)
              </td>
            </>
          )
        }}
      />
    </>
  )
}