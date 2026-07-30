import { useEffect, useRef, useState } from 'react'
import StatusBadge from '@components/ui/StatusBadge'
import SearchInput from '@components/ui/SearchInput'
import { formatDate } from '@lib/format'
import { getInventoryStatus, sortInventoryByCategory, inventoryCategorySummary, itemKey, daysUntil } from './lib/inventoryHelpers'
import { InventoryIcon, PlusIcon, MinusIcon, TagIcon, DownloadIcon, WrenchIcon, CheckCircleIcon, TrashIcon, EditIcon, ClipboardIcon, XCircleIcon, ChevronUpIcon, ChevronDownIcon } from '@components/ui/icons'

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
    // Tracks, per category group, how many items share each name and
    // how many of those this row is (1-indexed) — lets ItemRow show a
    // "Batch 2 of 3" style badge whenever a name repeats (e.g. multiple
    // deliveries of the same medicine, each tracked as its own batch for
    // FIFO dispensing — see sortInventoryByCategory's comment). Without
    // this, two adjacent rows with an identical name and no visible
    // distinction read as an accidental duplicate rather than two
    // clearly-related, intentionally-separate batches.
    let nameTotals = null
    let nameSeenSoFar = null
    section.items.forEach((item) => {
      if (item.category !== lastCategory) {
        rows.push({
          kind: 'category',
          key: `cat-${section.type}-${item.category}`,
          category: item.category,
          summary: inventoryCategorySummary(section.items, item.category),
        })
        lastCategory = item.category
        nameTotals = {}
        section.items
          .filter((i) => i.category === item.category)
          .forEach((i) => {
            const key = (i.name || '').trim().toLowerCase()
            nameTotals[key] = (nameTotals[key] || 0) + 1
          })
        nameSeenSoFar = {}
      }
      const nameKey = (item.name || '').trim().toLowerCase()
      const total = nameTotals[nameKey] || 1
      nameSeenSoFar[nameKey] = (nameSeenSoFar[nameKey] || 0) + 1
      rows.push({
        kind: 'item',
        key: `item-${itemKey(item)}`,
        item,
        batchIndex: total > 1 ? nameSeenSoFar[nameKey] : null,
        batchTotal: total > 1 ? total : null,
      })
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
  onReplenish,
}) {
  const { search, category, status } = filters
  const set = (patch) => onFiltersChange({ ...filters, ...patch })

  // Information-overload reduction — Category, Unit, Level,
  // Expiry/Maint., and Supplier are hidden by default (Item Name/Batch,
  // Stock, Status, and Actions are the columns most people scan for at
  // a glance); "View More" reveals the rest for anyone who needs the
  // fuller picture. colSpan on the section/category/empty-state rows
  // has to track this too, or they'd only span part of the table width
  // once columns are hidden.
  const [showMore, setShowMore] = useState(false)
  const visibleCols = showMore ? 9 : 4

  // Both the title/filter row AND the table's column headers freeze in
  // place while scrolling (see .inv-items-sticky-header / thead th's
  // sticky positioning in legacy.css). They have to stack directly below
  // each other without overlapping — but the filter row's height isn't
  // fixed, since it wraps onto a second line on narrower screens
  // (flexWrap:'wrap'). Measuring it live and feeding it into a CSS
  // variable is what lets the table header's sticky `top` offset stay
  // correct at any width, instead of guessing a static pixel value that
  // would only be right at one specific screen size.
  const headerRef = useRef(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return undefined
    const measure = () => setHeaderHeight(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
  // Drives both the "Clear Filters" button's visibility and the
  // "Showing X of Y" summary below — a filtered-down empty result looks
  // identical to a genuinely empty inventory otherwise, which is
  // confusing when it's really just an overly-narrow filter combination.
  const filtersActive = category !== 'All' || status !== 'All' || !!search
  function clearFilters() {
    onFiltersChange({ search: '', category: 'All', status: 'All' })
  }

  return (
    <div className="card" style={{ '--items-header-h': `${headerHeight}px` }}>
      <div ref={headerRef} className="card-header inv-items-sticky-header" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
  <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    <InventoryIcon width={15} height={15} /> Inventory Items
  </h3>
  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginLeft: 'auto' }}>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label htmlFor="items-filter-category" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Category</label>
      <select id="items-filter-category" name="category" className="form-select" style={{ fontSize: 12, padding: '5px 8px' }} value={category} onChange={(e) => set({ category: e.target.value })}>
        {CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label htmlFor="items-filter-status" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Status</label>
      <select id="items-filter-status" name="status" className="form-select" style={{ fontSize: 12, padding: '5px 8px' }} value={status} onChange={(e) => set({ status: e.target.value })}>
        {STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label htmlFor="items-filter-search" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Search</label>
      <SearchInput id="items-filter-search" name="search" value={search} onChange={(v) => set({ search: v })} placeholder="Search items…" width={170} />
    </div>
    {filtersActive && (
      <button type="button" className="btn btn-sm btn-outline" onClick={clearFilters} title="Reset category, status, and search">
        <XCircleIcon width={13} height={13} /> Clear Filters
      </button>
    )}
    <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowMore((v) => !v)} title="Show or hide Category, Unit, Level, and Expiry/Maint. columns">
      {showMore ? <><ChevronUpIcon width={13} height={13} /> View Less</> : <><ChevronDownIcon width={13} height={13} /> View More</>}
    </button>
    <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
      <button type="button" className="btn btn-sm btn-blue" onClick={onAddItem} title="Add one item or a batch of items" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <PlusIcon width={13} height={13} /> Add Item
      </button>
      <button type="button" className="btn btn-sm btn-orange" onClick={onReleasePicker} title="Release stock from a non-expired item" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <MinusIcon width={13} height={13} /> Release
      </button>
    </div>
  </div>
</div>
      {filtersActive && (
        <div style={{ padding: '8px 18px', fontSize: 12, color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
          Showing <strong style={{ color: 'var(--text-2)' }}>{filtered.length}</strong> of {inventory.length} item{inventory.length !== 1 ? 's' : ''}
        </div>
      )}
      <div className="table-wrap inv-items-scroll">
        <table className="inv-items-table">
          <thead>
            <tr>
              <th>Item Name / Batch</th>
              {showMore && <th>Category</th>}
              <th>Stock</th>
              {showMore && <th>Unit</th>}
              {showMore && <th>Level</th>}
              {showMore && <th>Expiry / Maint.</th>}
              {showMore && <th>Supplier</th>}
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={visibleCols} style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
                  {filtersActive ? (
                    <>
                      No items match your current filters.
                      <br />
                      <button type="button" className="btn btn-sm btn-outline" onClick={clearFilters} style={{ marginTop: 10 }}>
                        <XCircleIcon width={13} height={13} /> Clear Filters
                      </button>
                    </>
                  ) : (
                    'No items in inventory yet.'
                  )}
                </td>
              </tr>
            )}
            {(() => {
              // Tracks item rows only — section/category header rows
              // don't count towards this, so the stripe pattern alternates
              // cleanly item-by-item instead of being thrown off by
              // however many group headers happen to sit between them.
              // Computed purely from each row's own position (no mutable
              // counter reassigned across iterations) — a previous version
              // used `let itemIndex` incremented inline, which the linter
              // flagged (react-hooks/immutability) as unsafe to reassign
              // once render has started, even though it was actually safe
              // here (freshly re-initialized every render). This avoids
              // the pattern entirely rather than arguing with the rule.
              return rows.map((row, i) => {
                if (row.kind === 'section') {
                  return (
                    <tr className={`inv-expiry-row ${row.section.type}`} key={row.key}>
                      <td colSpan={visibleCols}>
                        <span>{row.section.label}</span>
                        <small>{row.section.note}</small>
                      </td>
                    </tr>
                  )
                }
                if (row.kind === 'category') {
                  return (
                    <tr className={`inv-category-row cat-row-${(row.category || '').toLowerCase()}`} key={row.key}>
                      <td colSpan={visibleCols}>
                        <span>{row.category || 'Uncategorized'}</span>
                        <small>{row.summary}</small>
                      </td>
                    </tr>
                  )
                }
                const itemIndex = rows.slice(0, i + 1).filter((r) => r.kind !== 'section' && r.kind !== 'category').length - 1
                return (
                  <ItemRow
                    key={row.key}
                    item={row.item}
                    showMore={showMore}
                    striped={itemIndex % 2 === 1}
                    onEdit={onEdit}
                    onRelease={onRelease}
                    onRemove={onRemove}
                    onRestore={onRestore}
                    onReplenish={onReplenish}
                  />
                )
              })
            })()}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ItemRow({ item: i, showMore, striped, onEdit, onRelease, onRemove, onRestore, onReplenish }) {
  const st = getInventoryStatus(i)
  const pct = Math.min(100, Math.round((i.quantity / Math.max(i.min_stock, 1)) * 100))
  const barCls = st === 'Available' ? 'high' : ['Low Stock', 'Critical Stock'].includes(st) ? 'medium' : 'low'
  const daysLeft = daysUntil(i.expiration_date)
  const expColor = daysLeft !== null ? (daysLeft < 0 ? 'var(--danger)' : daysLeft <= 30 ? 'var(--warning)' : 'var(--text)') : 'var(--text-3)'

  return (
    <tr className={`inv-item-row${striped ? ' inv-item-row-alt' : ''}`}>
      <td>
        <div style={{ fontWeight: 600 }}>{i.name}</div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 5 }}>
          {i.batch_no && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <TagIcon width={10} height={10} /> {i.batch_no}
            </span>
          )}
          {i.received_date && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <DownloadIcon width={10} height={10} /> {formatDate(i.received_date)}
            </span>
          )}
          {i.purchase_reference && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Purchase Reference">
              <ClipboardIcon width={10} height={10} /> {i.purchase_reference}
            </span>
          )}
          {i.is_fifo && i.category === 'Medicine' && <span className="fifo-tag">FIFO</span>}
        </div>
      </td>
      {showMore && (
        <td>
          <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
        </td>
      )}
      <td style={{ fontWeight: 700, color: st === 'Expired' ? 'var(--danger)' : st === 'Low Stock' ? 'var(--warning)' : 'var(--success)', fontSize: 16 }}>
        {i.quantity}
      </td>
      {showMore && <td style={{ color: 'var(--text-2)' }}>{i.unit}</td>}
      {showMore && (
        <td style={{ minWidth: 120 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="stock-bar" style={{ flex: 1 }}>
              <div className={`stock-fill ${barCls}`} style={{ width: `${pct}%` }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-3)', width: 28 }}>{pct}%</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>Min: {i.min_stock}</div>
        </td>
      )}
      {showMore && (
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
      )}
      {showMore && <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{i.supplier || '—'}</td>}
      <td>
        <StatusBadge status={st} />
      </td>
      <td>
        <div className="inv-action-group-icons">
          {st === 'Needs Maintenance' ? (
            <>
              <button type="button" className="btn btn-sm btn-blue inv-action-btn" onClick={() => onRestore(itemKey(i))} title="Return this equipment to active inventory" aria-label="Restore">
                <CheckCircleIcon width={14} height={14} />
              </button>
              <button type="button" className="btn btn-sm btn-red inv-action-btn" onClick={() => onRemove(itemKey(i))} title="Remove this maintenance item" aria-label="Remove">
                <TrashIcon width={14} height={14} />
              </button>
            </>
          ) : st === 'Expired' ? (
            <button type="button" className="btn btn-sm btn-red inv-action-btn" onClick={() => onRemove(itemKey(i))} title={`Remove expired stock from inventory (${i.quantity})`} aria-label="Remove expired stock">
              <TrashIcon width={14} height={14} />
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-sm btn-green inv-action-btn" onClick={() => onReplenish?.(itemKey(i))} title="Add stock to this item" aria-label="Add stock">
                <PlusIcon width={14} height={14} />
              </button>
              <button type="button" className="btn btn-sm btn-blue inv-action-btn" onClick={() => onEdit(itemKey(i))} title="Edit item details" aria-label="Edit">
                <EditIcon width={14} height={14} />
              </button>
              <button type="button" className="btn btn-sm btn-orange inv-action-btn" onClick={() => onRelease(itemKey(i))} title="Release or dispense stock" aria-label="Release">
                <MinusIcon width={14} height={14} />
              </button>
              <button type="button" className="btn btn-sm btn-red inv-action-btn" onClick={() => onRemove(itemKey(i))} title="Remove this item from inventory" aria-label="Remove">
                <TrashIcon width={14} height={14} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}