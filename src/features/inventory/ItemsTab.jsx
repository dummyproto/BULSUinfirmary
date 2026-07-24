import StatusBadge from '@components/ui/StatusBadge'
import SearchInput from '@components/ui/SearchInput'
import { formatDate } from '@lib/format'
import { getInventoryStatus, sortInventoryByCategory, inventoryCategorySummary, itemKey, daysUntil } from './lib/inventoryHelpers'
import { InventoryIcon, PlusIcon, MinusIcon, TagIcon, DownloadIcon, WrenchIcon, CheckCircleIcon, TrashIcon, EditIcon, ClipboardIcon } from '@components/ui/icons'

const CATEGORIES = ['All', 'Medicine', 'Supply', 'Equipment']
const STATUSES = ['All', 'Available', 'Low Stock', 'Critical Stock', 'Out of Stock', 'Near Expiry', 'Expired', 'Damaged', 'Archived', 'Needs Maintenance']

// Flattens sections into a render-ready row list: section headers, category
// sub-headers (inserted whenever the category changes within a section),
// and item rows — mirrors the `lastCategory` tracking loop in the legacy
// renderItemsTab() but as a pure data transform instead of a DOM string
// builder, so it doesn't need any mutable state during render.
function buildRows(sections) {
  const rows = []
  sections.forEach((section) => {
    rows.push({ kind: 'section', key: `section-${section.type}`, section })
    let lastCategory = null
    section.items.forEach((item) => {
      if (item.category !== lastCategory) {
        rows.push({
          kind: 'category',
          key: `cat-${section.type}-${item.category}`,
          category: item.category,
          summary: inventoryCategorySummary(section.items, item.category),
        })
        lastCategory = item.category
      }
      rows.push({ kind: 'item', key: `item-${itemKey(item)}`, item })
    })
  })
  return rows
}

export default function ItemsTab({
  inventory,
  filters,
  onFiltersChange,
  onAddItem,
  onReleasePicker,
  onEdit,
  onRelease,
  onRemove,
  onRestore,
}) {
  const { search, category, status } = filters
  const set = (patch) => onFiltersChange({ ...filters, ...patch })

  let filtered = inventory
  if (category !== 'All') filtered = filtered.filter((i) => i.category === category)
  if (status !== 'All') filtered = filtered.filter((i) => getInventoryStatus(i) === status)
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.batch_no || '').toLowerCase().includes(q) ||
        (i.supplier || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q)
    )
  }

  const sorted = sortInventoryByCategory(filtered)
  const nonExpired = sorted.filter((i) => getInventoryStatus(i) !== 'Expired' && getInventoryStatus(i) !== 'Needs Maintenance')
  const expired = sorted.filter((i) => getInventoryStatus(i) === 'Expired' && i.category !== 'Equipment')
  const maintenance = sorted.filter((i) => getInventoryStatus(i) === 'Needs Maintenance')

  const sections = [
    { label: 'Non-Expired Items', note: `${nonExpired.length} usable item${nonExpired.length !== 1 ? 's' : ''}`, items: nonExpired, type: 'usable' },
    { label: 'Expired Items', note: `${expired.length} expired item${expired.length !== 1 ? 's' : ''}`, items: expired, type: 'expired' },
    { label: 'Needs Maintenance Equipment', note: `${maintenance.length} item${maintenance.length !== 1 ? 's' : ''} pending maintenance`, items: maintenance, type: 'maintenance' },
  ].filter((s) => s.items.length)

  const rows = buildRows(sections)

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <InventoryIcon width={15} height={15} /> Inventory Items
        </h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
          <select className="form-select" style={{ fontSize: 12, padding: '5px 8px' }} value={category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className="form-select" style={{ fontSize: 12, padding: '5px 8px' }} value={status} onChange={(e) => set({ status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <SearchInput value={search} onChange={(v) => set({ search: v })} placeholder="Search items…" width={170} />
          <button type="button" className="btn btn-sm btn-blue" onClick={onAddItem} title="Add one item or a batch of items" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <PlusIcon width={13} height={13} /> Add Item
          </button>
          <button type="button" className="btn btn-sm btn-orange" onClick={onReleasePicker} title="Release stock from a non-expired item" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MinusIcon width={13} height={13} /> Release
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item Name / Batch</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Unit</th>
              <th>Level</th>
              <th>Expiry / Maint.</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
                  No items found
                </td>
              </tr>
            )}
            {rows.map((row) => {
              if (row.kind === 'section') {
                return (
                  <tr className={`inv-expiry-row ${row.section.type}`} key={row.key}>
                    <td colSpan={9}>
                      <span>{row.section.label}</span>
                      <small>{row.section.note}</small>
                    </td>
                  </tr>
                )
              }
              if (row.kind === 'category') {
                return (
                  <tr className="inv-category-row" key={row.key}>
                    <td colSpan={9}>
                      <span>{row.category || 'Uncategorized'}</span>
                      <small>{row.summary}</small>
                    </td>
                  </tr>
                )
              }
              return (
                <ItemRow key={row.key} item={row.item} onEdit={onEdit} onRelease={onRelease} onRemove={onRemove} onRestore={onRestore} />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ItemRow({ item: i, onEdit, onRelease, onRemove, onRestore }) {
  const st = getInventoryStatus(i)
  const pct = Math.min(100, Math.round((i.quantity / Math.max(i.min_stock, 1)) * 100))
  const barCls = st === 'Available' ? 'high' : ['Low Stock', 'Critical Stock'].includes(st) ? 'medium' : 'low'
  const daysLeft = daysUntil(i.expiration_date)
  const expColor = daysLeft !== null ? (daysLeft < 0 ? 'var(--danger)' : daysLeft <= 30 ? 'var(--warning)' : 'var(--text)') : 'var(--text-3)'

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{i.name}</div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', gap: 8, marginTop: 2 }}>
          {i.batch_no && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <TagIcon width={10} height={10} /> {i.batch_no}
            </span>
          )}
          {i.received_date && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <DownloadIcon width={10} height={10} /> {formatDate(i.received_date)}
            </span>
          )}
          {i.purchase_reference && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title="Purchase Reference">
              <ClipboardIcon width={10} height={10} /> {i.purchase_reference}
            </span>
          )}
          {i.is_fifo && i.category === 'Medicine' && <span className="fifo-tag">FIFO</span>}
        </div>
      </td>
      <td>
        <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
      </td>
      <td style={{ fontWeight: 700, color: st === 'Expired' ? 'var(--danger)' : st === 'Low Stock' ? 'var(--warning)' : 'var(--success)', fontSize: 16 }}>
        {i.quantity}
      </td>
      <td style={{ color: 'var(--text-2)' }}>{i.unit}</td>
      <td style={{ minWidth: 120 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="stock-bar" style={{ flex: 1 }}>
            <div className={`stock-fill ${barCls}`} style={{ width: `${pct}%` }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-3)', width: 28 }}>{pct}%</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>Min: {i.min_stock}</div>
      </td>
      <td style={{ color: expColor, fontSize: 12 }}>
        {i.category === 'Equipment' ? (
          i.expiration_date ? (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.05em', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                <WrenchIcon width={10} height={10} /> MAINTENANCE
              </div>
              <div style={{ fontWeight: daysLeft !== null && daysLeft <= 30 ? 700 : 400 }}>{formatDate(i.expiration_date)}</div>
              <div style={{ fontSize: 10 }}>{daysLeft !== null ? (daysLeft < 0 ? 'OVERDUE' : daysLeft === 0 ? 'Today' : `${daysLeft} days`) : '—'}</div>
            </>
          ) : (
            <span style={{ color: 'var(--text-3)' }}>N/A</span>
          )
        ) : i.expiration_date ? (
          <>
            <div style={{ fontWeight: daysLeft !== null && daysLeft <= 30 ? 700 : 400 }}>{formatDate(i.expiration_date)}</div>
            <div style={{ fontSize: 10 }}>{daysLeft !== null ? (daysLeft < 0 ? 'EXPIRED' : daysLeft === 0 ? 'Today' : `${daysLeft} days`) : '—'}</div>
          </>
        ) : (
          <span style={{ color: 'var(--text-3)' }}>N/A</span>
        )}
      </td>
      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{i.supplier || '—'}</td>
      <td>
        <StatusBadge status={st} />
      </td>
      <td>
        <div className="inv-action-group">
          {st === 'Needs Maintenance' ? (
            <>
              <div className="inv-action-primary">
                <button type="button" className="btn btn-sm btn-blue inv-action-btn" onClick={() => onRestore(itemKey(i))} title="Return this equipment to active inventory" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircleIcon width={13} height={13} /> Restore
                </button>
              </div>
              <div className="inv-action-destructive">
                <button type="button" className="btn btn-sm btn-red inv-action-btn" onClick={() => onRemove(itemKey(i))} title="Remove this maintenance item" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <TrashIcon width={13} height={13} /> Remove
                </button>
              </div>
            </>
          ) : st === 'Expired' ? (
            <div className="inv-action-destructive" style={{ flexBasis: '100%' }}>
              <button type="button" className="btn btn-sm btn-red inv-action-btn" style={{ width: '100%', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => onRemove(itemKey(i))} title="Remove expired stock from inventory">
                <TrashIcon width={13} height={13} /> Remove Expired ({i.quantity})
              </button>
            </div>
          ) : (
            <>
              <div className="inv-action-primary">
                <button type="button" className="btn btn-sm btn-blue inv-action-btn" onClick={() => onEdit(itemKey(i))} title="Edit item details" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <EditIcon width={13} height={13} /> Edit
                </button>
              </div>
              <div className="inv-action-secondary">
                <button type="button" className="btn btn-sm btn-orange inv-action-btn" onClick={() => onRelease(itemKey(i))} title="Release or dispense stock" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <MinusIcon width={13} height={13} /> Release
                </button>
              </div>
              <div className="inv-action-destructive">
                <button type="button" className="btn btn-sm btn-red inv-action-btn" onClick={() => onRemove(itemKey(i))} title="Remove this item from inventory" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <TrashIcon width={13} height={13} /> Remove
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}
