import { useEffect, useRef, useState } from 'react'
import StatusBadge from '@components/ui/StatusBadge'
import SearchInput from '@components/ui/SearchInput'
import { formatDate } from '@lib/format'
import { getInventoryStatus, sortInventoryByCategory, inventoryCategorySummary, itemKey, daysUntil } from './lib/inventoryHelpers'
import { BatchesBody } from './BatchesTab'
import { InventoryIcon, FolderIcon, PlusIcon, MinusIcon, TagIcon, DownloadIcon, WrenchIcon, CheckCircleIcon, TrashIcon, EditIcon, ClipboardIcon, XCircleIcon, ChevronUpIcon, ChevronDownIcon, GridIcon, ListIcon, PillIcon, InfoIcon } from '@components/ui/icons'
import { defaultShowMore } from '@lib/viewport'

const CATEGORIES = ['All', 'Equipment', 'Medicine', 'Supply']
const STATUSES = ['All', 'Archived', 'Available', 'Critical Stock', 'Damaged', 'Expired', 'Low Stock', 'Near Expiry', 'Needs Maintenance', 'Out of Stock']

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
    // how many of those this row is (1-indexed) — lets ItemListCard show a
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
  // Batches sub-view — same tab now covers both, toggled via the pill
  // control in the header below. subTab/onSubTabChange are controlled
  // from InventoryPage.jsx (not local state) so its Dashboard tab's
  // "View Batches" quick-link can jump straight to this sub-view.
  subTab,
  onSubTabChange,
  batches,
  batchSearch,
  onBatchSearchChange,
  onAddBatch,
  onReleaseBatchPicker,
  onEditBatch,
  onReplenishBatch,
  onReleaseBatch,
  onArchiveBatch,
  onUnarchiveBatch,
  onReportDamaged,
  onViewQR,
}) {
  const { search, category, status } = filters
  const set = (patch) => onFiltersChange({ ...filters, ...patch })

  // Separate "View More" state from the Items sub-view's — the two
  // sub-views show entirely different columns (Category/Unit/Level/
  // Expiry vs Qty/Received/Expiry/Days Left/Supplier/Purchase Ref/
  // Status), so collapsing one shouldn't affect the other's memory of
  // whether it was expanded.
  const [batchShowMore, setBatchShowMore] = useState(defaultShowMore)

  // Information-overload reduction — Category, Unit, Level,
  // Expiry/Maint., and Supplier are hidden by default (Item Name/Batch,
  // Stock, Status, and Actions are the columns most people scan for at
  // a glance); "View More" reveals the rest for anyone who needs the
  // fuller picture. colSpan on the section/category/empty-state rows
  // has to track this too, or they'd only span part of the table width
  // once columns are hidden.
  const [showMore, setShowMore] = useState(defaultShowMore)

  // List/Grid toggle — persisted so switching pages/reloading doesn't
  // silently reset it back to whichever one wasn't chosen. Both views
  // reuse the exact same `sections`/`rows` data — grid renders ItemCard,
  // list renders ItemListCard — same filters, same section/category
  // grouping, same action handlers, just different presentation.
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('inv_items_view_mode') || 'list')
  useEffect(() => {
    localStorage.setItem('inv_items_view_mode', viewMode)
  }, [viewMode])

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
    <div className="card inv-items-card" style={{ '--items-header-h': `${headerHeight}px` }}>
      <div ref={headerRef} className="card-header inv-items-sticky-header" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
  <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    {subTab === 'items' ? <InventoryIcon width={15} height={15} /> : <FolderIcon width={15} height={15} />}
    {subTab === 'items' ? 'Inventory Items' : 'Batch Tracking'}
  </h3>
  <div className="inv-view-toggle" role="group" aria-label="Switch between Items and Batches">
    <button type="button" className={`inv-view-toggle-btn${subTab === 'items' ? ' active' : ''}`} onClick={() => onSubTabChange('items')} title="Show items" aria-pressed={subTab === 'items'}>
      <InventoryIcon width={13} height={13} /> Items
    </button>
    <button type="button" className={`inv-view-toggle-btn${subTab === 'batches' ? ' active' : ''}`} onClick={() => onSubTabChange('batches')} title="Show batches" aria-pressed={subTab === 'batches'}>
      <FolderIcon width={13} height={13} /> Batches
    </button>
  </div>
  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginLeft: 'auto' }}>
    {subTab === 'items' ? (
      <>
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
        <div className="inv-view-toggle" role="group" aria-label="Switch between list and grid view">
          <button type="button" className={`inv-view-toggle-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')} title="List view" aria-label="List view" aria-pressed={viewMode === 'list'}>
            <ListIcon width={14} height={14} />
          </button>
          <button type="button" className={`inv-view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => setViewMode('grid')} title="Grid view" aria-label="Grid view" aria-pressed={viewMode === 'grid'}>
            <GridIcon width={14} height={14} />
          </button>
        </div>
        {viewMode === 'list' && (
          <button
            type="button"
            className="btn btn-sm btn-outline inv-view-more-btn"
            onClick={() => setShowMore((v) => !v)}
            title="Show or hide Category, Unit, Level, and Expiry/Maint. columns"
            aria-label={showMore ? 'View Less — hide Category, Unit, Level, and Expiry/Maint. columns' : 'View More — show Category, Unit, Level, and Expiry/Maint. columns'}
          >
            {showMore ? <ChevronUpIcon width={13} height={13} /> : <ChevronDownIcon width={13} height={13} />}
            <span>{showMore ? 'View Less' : 'View More'}</span>
          </button>
        )}
        <div className="inv-items-action-row" style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
          <button type="button" className="btn btn-sm btn-blue" onClick={onAddItem} title="Add one item or a batch of items" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <PlusIcon width={13} height={13} /> Add Item
          </button>
          <button type="button" className="btn btn-sm btn-orange" onClick={onReleasePicker} title="Release stock from a non-expired item" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MinusIcon width={13} height={13} /> Release
          </button>
        </div>
      </>
    ) : (
      <>
        <SearchInput value={batchSearch} onChange={onBatchSearchChange} placeholder="Search batch ID, item, supplier…" width={220} />
        <button
          type="button"
          className="btn btn-sm btn-outline inv-view-more-btn"
          onClick={() => setBatchShowMore((v) => !v)}
          title="Show or hide Qty, Received Date, Expiry Date, Days Left, Supplier, Purchase Ref., and Status columns"
          aria-label={batchShowMore ? 'View Less — hide Qty, Received Date, Expiry Date, Days Left, Supplier, Purchase Ref., and Status columns' : 'View More — show Qty, Received Date, Expiry Date, Days Left, Supplier, Purchase Ref., and Status columns'}
        >
          {batchShowMore ? <ChevronUpIcon width={13} height={13} /> : <ChevronDownIcon width={13} height={13} />}
          <span>{batchShowMore ? 'View Less' : 'View More'}</span>
        </button>
        <div className="inv-items-action-row" style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
          <button type="button" className="btn btn-sm btn-teal" onClick={onAddBatch} title="Add a new batch to an item" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <FolderIcon width={13} height={13} /> Add Batch
          </button>
          <button type="button" className="btn btn-sm btn-orange" onClick={onReleaseBatchPicker} title="Choose a batch and release stock" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MinusIcon width={13} height={13} /> Release Batch
          </button>
        </div>
      </>
    )}
  </div>
</div>
      {subTab === 'items' && filtersActive && (
        <div style={{ padding: '8px 18px', fontSize: 12, color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
          Showing <strong style={{ color: 'var(--text-2)' }}>{filtered.length}</strong> of {inventory.length} item{inventory.length !== 1 ? 's' : ''}
        </div>
      )}
      <div className="table-wrap inv-items-scroll">
        {subTab !== 'items' ? (
          <div style={{ padding: 16 }}>
            <BatchesBody
              batches={batches}
              search={batchSearch}
              showMore={batchShowMore}
              onEditBatch={onEditBatch}
              onReplenishBatch={onReplenishBatch}
              onReleaseBatch={onReleaseBatch}
              onArchiveBatch={onArchiveBatch}
              onUnarchiveBatch={onUnarchiveBatch}
              onReportDamaged={onReportDamaged}
              onViewQR={onViewQR}
            />
          </div>
        ) : viewMode === 'list' ? (
          <ItemCardList
            rows={rows}
            filtered={filtered}
            filtersActive={filtersActive}
            clearFilters={clearFilters}
            showMore={showMore}
            onEdit={onEdit}
            onRelease={onRelease}
            onRemove={onRemove}
            onRestore={onRestore}
            onReplenish={onReplenish}
          />
        ) : (
          <ItemGrid
            rows={rows}
            filtered={filtered}
            filtersActive={filtersActive}
            clearFilters={clearFilters}
            onEdit={onEdit}
            onRelease={onRelease}
            onRemove={onRemove}
            onRestore={onRestore}
            onReplenish={onReplenish}
          />
        )}
      </div>
    </div>
  )
}

// List view — same sections/rows data as grid view, rendered as a
// vertical stack of individual, self-contained cards (each with its own
// border/shadow/spacing) instead of a continuous table with divider
// lines. Section/category headers render as the same plain text
// dividers ItemGrid already uses, for visual consistency between the
// two view modes.
function ItemCardList({ rows, filtered, filtersActive, clearFilters, showMore, onEdit, onRelease, onRemove, onRestore, onReplenish }) {
  return (
    <div style={{ padding: '0 16px 16px' }}>
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
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
        </div>
      ) : (
        <div>
          {rows.map((row, index) => {
            if (row.kind === 'section') {
              return (
                <div key={row.key} className={`inv-expiry-row ${row.section.type}`} style={{ borderRadius: 8, marginTop: index === 0 ? 0 : 14, marginBottom: 10 }}>
                  <div style={{ padding: '10px 14px' }}>
                    <span>{row.section.label}</span>
                    <small style={{ marginLeft: 8 }}>{row.section.note}</small>
                  </div>
                </div>
              )
            }
            if (row.kind === 'category') {
              return (
                <div key={row.key} className={`inv-category-row cat-row-${(row.category || '').toLowerCase()}`} style={{ borderRadius: 6, marginTop: 10, marginBottom: 10 }}>
                  <div style={{ padding: '8px 14px' }}>
                    <span>{row.category || 'Uncategorized'}</span>
                    <small style={{ marginLeft: 8 }}>{row.summary}</small>
                  </div>
                </div>
              )
            }
            return (
              <ItemListCard
                key={row.key}
                item={row.item}
                showMore={showMore}
                onEdit={onEdit}
                onRelease={onRelease}
                onRemove={onRemove}
                onRestore={onRestore}
                onReplenish={onReplenish}
              />
            )
          })}
          <div className="inv-list-footer-note">
            <InfoIcon width={14} height={14} />
            Items are grouped by category. Only non-expired and usable items are shown.
          </div>
        </div>
      )}
    </div>
  )
}

function ItemListCard({ item: i, showMore, onEdit, onRelease, onRemove, onRestore, onReplenish }) {
  const st = getInventoryStatus(i)
  const pct = Math.min(100, Math.round((i.quantity / Math.max(i.min_stock, 1)) * 100))
  const barCls = st === 'Available' ? 'high' : ['Low Stock', 'Critical Stock'].includes(st) ? 'medium' : 'low'
  const daysLeft = daysUntil(i.expiration_date)
  const expColor = daysLeft !== null ? (daysLeft < 0 ? 'var(--danger)' : daysLeft <= 30 ? 'var(--warning)' : 'var(--text)') : 'var(--text-3)'

  return (
    <div className="inv-item-list-card">
      <div className={`inv-item-list-card-main${showMore ? ' has-more' : ''}`}>
        {i.image_url ? (
          <img src={i.image_url} alt="" className="inv-item-list-card-photo" />
        ) : (
          <div className="inv-item-list-card-photo inv-item-row-photo-placeholder">
            {i.category === 'Medicine' ? <PillIcon width={18} height={18} /> : i.category === 'Equipment' ? <WrenchIcon width={18} height={18} /> : <InventoryIcon width={18} height={18} />}
          </div>
        )}

        <div className="inv-item-list-card-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{i.name}</span>
            {i.is_fifo && i.category === 'Medicine' && <span className="fifo-tag">FIFO</span>}
          </div>
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
          </div>
        </div>

        {showMore && (
          <div className="inv-item-list-card-category">
            <div className="inv-item-list-card-label">Category</div>
            <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
          </div>
        )}

        <div className="inv-item-list-card-stock">
          <div className="inv-item-list-card-label">Stock</div>
          <div style={{ fontWeight: 700, fontSize: 22, color: st === 'Expired' ? 'var(--danger)' : st === 'Low Stock' ? 'var(--warning)' : 'var(--success)' }}>{i.quantity}</div>
        </div>

        {showMore && (
          <div className="inv-item-list-card-unit">
            <div className="inv-item-list-card-label">Unit</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{i.unit}</div>
          </div>
        )}

        {showMore && (
          <div className="inv-item-list-card-level">
            <div className="inv-item-list-card-label">Level</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="stock-bar" style={{ width: 60 }}>
                <div className={`stock-fill ${barCls}`} style={{ width: `${pct}%` }} />
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{pct}%</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Min: {i.min_stock}</div>
          </div>
        )}

        {showMore && (
          <div className="inv-item-list-card-expiry" style={{ color: expColor }}>
            <div className="inv-item-list-card-label">{i.category === 'Equipment' ? 'Maintenance' : 'Expiry / Maint.'}</div>
            {i.category === 'Equipment' ? (
              i.expiration_date ? (
                <div style={{ fontWeight: daysLeft !== null && daysLeft <= 30 ? 700 : 400, fontSize: 12 }}>{formatDate(i.expiration_date)}</div>
              ) : (
                <span style={{ color: 'var(--text-3)', fontSize: 12 }}>No maintenance date</span>
              )
            ) : i.expiration_date ? (
              <>
                <div style={{ fontWeight: daysLeft !== null && daysLeft <= 30 ? 700 : 400, fontSize: 12 }}>{formatDate(i.expiration_date)}</div>
                <div style={{ fontSize: 10 }}>{daysLeft !== null ? (daysLeft < 0 ? 'EXPIRED' : daysLeft === 0 ? 'Today' : `${daysLeft} days`) : '—'}</div>
              </>
            ) : (
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>No expiry</span>
            )}
          </div>
        )}

        {showMore && (
          <div className="inv-item-list-card-supplier">
            <div className="inv-item-list-card-label">Supplier</div>
            {i.supplier ? (
              <span className="supplier-chip">
                <span className="supplier-chip-dot" /> {i.supplier}
              </span>
            ) : (
              <span style={{ color: 'var(--text-3)' }}>—</span>
            )}
          </div>
        )}

        <div className="inv-item-list-card-status">
          <div className="inv-item-list-card-label">Status</div>
          <StatusBadge status={st} />
        </div>

        <div className="inv-action-group-icons">
          {st === 'Needs Maintenance' ? (
            <>
              <button type="button" className="btn btn-sm btn-blue inv-action-btn" onClick={() => onRestore(itemKey(i))} title="Return this equipment to active inventory" aria-label="Restore">
                <CheckCircleIcon width={14} height={14} />
                <span>Restore</span>
              </button>
              <button type="button" className="btn btn-sm btn-red inv-action-btn" onClick={() => onRemove(itemKey(i))} title="Remove this maintenance item" aria-label="Remove">
                <TrashIcon width={14} height={14} />
                <span>Remove</span>
              </button>
            </>
          ) : st === 'Expired' ? (
            <button type="button" className="btn btn-sm btn-red inv-action-btn" onClick={() => onRemove(itemKey(i))} title={`Remove expired stock from inventory (${i.quantity})`} aria-label="Remove expired stock">
              <TrashIcon width={14} height={14} />
              <span>Remove</span>
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-sm btn-green inv-action-btn" onClick={() => onReplenish?.(itemKey(i))} title="Add stock to this item" aria-label="Add stock">
                <PlusIcon width={14} height={14} />
                <span>Add Stock</span>
              </button>
              <button type="button" className="btn btn-sm btn-blue inv-action-btn" onClick={() => onEdit(itemKey(i))} title="Edit item details" aria-label="Edit">
                <EditIcon width={14} height={14} />
                <span>Edit</span>
              </button>
              <button type="button" className="btn btn-sm btn-orange inv-action-btn" onClick={() => onRelease(itemKey(i))} title="Release or dispense stock" aria-label="Release">
                <MinusIcon width={14} height={14} />
                <span>Release</span>
              </button>
              <button type="button" className="btn btn-sm btn-red inv-action-btn" onClick={() => onRemove(itemKey(i))} title="Remove this item from inventory" aria-label="Remove">
                <TrashIcon width={14} height={14} />
                <span>Remove</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Grid view — same sections/rows data as the table above (identical
// filtering, sorting, and section/category grouping), just rendered as
// cards instead of table rows. Section and category headers render as
// plain text dividers above each group of cards rather than colSpan'd
// table rows, since a grid has no columns to span.
function ItemGrid({ rows, filtered, filtersActive, clearFilters, onEdit, onRelease, onRemove, onRestore, onReplenish }) {
  if (filtered.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
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
      </div>
    )
  }

  // Groups consecutive 'item' rows into runs, each rendered inside ONE
  // shared grid container — section/category header rows break a run
  // and start a new one. Without this grouping, each card would end up
  // in its own single-item grid div (one child = no actual multi-column
  // layout), rather than all cards in a group sharing one real grid.
  const groups = []
  let currentRun = null
  rows.forEach((row) => {
    if (row.kind === 'item') {
      if (!currentRun) {
        currentRun = { kind: 'run', key: `run-${row.key}`, items: [] }
        groups.push(currentRun)
      }
      currentRun.items.push(row)
    } else {
      currentRun = null
      groups.push(row)
    }
  })

  return (
    <div style={{ padding: 16 }}>
      {groups.map((row) => {
        if (row.kind === 'section') {
          return (
            <div key={row.key} className={`inv-expiry-row ${row.section.type}`} style={{ borderRadius: 8, marginTop: 14, marginBottom: 10 }}>
              <div style={{ padding: '10px 14px' }}>
                <span>{row.section.label}</span>
                <small style={{ marginLeft: 8 }}>{row.section.note}</small>
              </div>
            </div>
          )
        }
        if (row.kind === 'category') {
          return (
            <div key={row.key} className={`inv-category-row cat-row-${(row.category || '').toLowerCase()}`} style={{ borderRadius: 6, marginTop: 10, marginBottom: 10 }}>
              <div style={{ padding: '8px 14px' }}>
                <span>{row.category || 'Uncategorized'}</span>
                <small style={{ marginLeft: 8 }}>{row.summary}</small>
              </div>
            </div>
          )
        }
        return (
          <div key={row.key} className="inv-item-grid">
            {row.items.map((itemRow) => (
              <ItemCard key={itemRow.key} item={itemRow.item} onEdit={onEdit} onRelease={onRelease} onRemove={onRemove} onRestore={onRestore} onReplenish={onReplenish} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function ItemCard({ item: i, onEdit, onRelease, onRemove, onRestore, onReplenish }) {
  const st = getInventoryStatus(i)
  const pct = Math.min(100, Math.round((i.quantity / Math.max(i.min_stock, 1)) * 100))
  const barCls = st === 'Available' ? 'high' : ['Low Stock', 'Critical Stock'].includes(st) ? 'medium' : 'low'
  const daysLeft = daysUntil(i.expiration_date)
  const expColor = daysLeft !== null ? (daysLeft < 0 ? 'var(--danger)' : daysLeft <= 30 ? 'var(--warning)' : 'var(--text)') : 'var(--text-3)'

  return (
    <div className="inv-item-card">
      {i.image_url ? (
        <img src={i.image_url} alt="" className="inv-item-card-photo" />
      ) : (
        <div className="inv-item-card-photo inv-item-card-photo-placeholder">
          {i.category === 'Medicine' ? <PillIcon width={26} height={26} /> : i.category === 'Equipment' ? <WrenchIcon width={26} height={26} /> : <InventoryIcon width={26} height={26} />}
        </div>
      )}
      <div className="inv-item-card-top">
        <span className={`cat-badge cat-${i.category.toLowerCase()}`}>{i.category}</span>
        <StatusBadge status={st} />
      </div>
      <div className="inv-item-card-name">{i.name}</div>
      <div className="inv-item-card-meta">
        {i.batch_no && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <TagIcon width={10} height={10} /> {i.batch_no}
          </span>
        )}
        {i.is_fifo && i.category === 'Medicine' && <span className="fifo-tag">FIFO</span>}
      </div>

      <div className="inv-item-card-stock">
        <span style={{ fontWeight: 700, fontSize: 20, color: st === 'Expired' ? 'var(--danger)' : st === 'Low Stock' ? 'var(--warning)' : 'var(--success)' }}>{i.quantity}</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{i.unit}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <div className="stock-bar" style={{ flex: 1 }}>
          <div className={`stock-fill ${barCls}`} style={{ width: `${pct}%` }} />
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{pct}%</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Min: {i.min_stock}</div>

      <div style={{ fontSize: 11, color: expColor, marginTop: 8 }}>
        {i.category === 'Equipment' ? (
          i.expiration_date ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <WrenchIcon width={10} height={10} /> Maint: {formatDate(i.expiration_date)}
            </span>
          ) : (
            <span style={{ color: 'var(--text-3)' }}>No maintenance date</span>
          )
        ) : i.expiration_date ? (
          <>Expires: {formatDate(i.expiration_date)} {daysLeft !== null && (daysLeft < 0 ? '(EXPIRED)' : daysLeft === 0 ? '(Today)' : `(${daysLeft}d)`)}</>
        ) : (
          <span style={{ color: 'var(--text-3)' }}>No expiry</span>
        )}
      </div>
      {i.supplier && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Supplier: {i.supplier}</div>}

      <div className="inv-action-group-icons" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {st === 'Needs Maintenance' ? (
          <>
            <button type="button" className="btn btn-sm btn-blue inv-action-btn" onClick={() => onRestore(itemKey(i))} title="Return this equipment to active inventory" aria-label="Restore">
              <CheckCircleIcon width={14} height={14} />
              <span>Restore</span>
            </button>
            <button type="button" className="btn btn-sm btn-red inv-action-btn" onClick={() => onRemove(itemKey(i))} title="Remove this maintenance item" aria-label="Remove">
              <TrashIcon width={14} height={14} />
              <span>Remove</span>
            </button>
          </>
        ) : st === 'Expired' ? (
          <button type="button" className="btn btn-sm btn-red inv-action-btn" onClick={() => onRemove(itemKey(i))} title={`Remove expired stock from inventory (${i.quantity})`} aria-label="Remove expired stock">
            <TrashIcon width={14} height={14} />
            <span>Remove</span>
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-sm btn-green inv-action-btn" onClick={() => onReplenish?.(itemKey(i))} title="Add stock to this item" aria-label="Add stock">
              <PlusIcon width={14} height={14} />
              <span>Add Stock</span>
            </button>
            <button type="button" className="btn btn-sm btn-blue inv-action-btn" onClick={() => onEdit(itemKey(i))} title="Edit item details" aria-label="Edit">
              <EditIcon width={14} height={14} />
              <span>Edit</span>
            </button>
            <button type="button" className="btn btn-sm btn-orange inv-action-btn" onClick={() => onRelease(itemKey(i))} title="Release or dispense stock" aria-label="Release">
              <MinusIcon width={14} height={14} />
              <span>Release</span>
            </button>
            <button type="button" className="btn btn-sm btn-red inv-action-btn" onClick={() => onRemove(itemKey(i))} title="Remove this item from inventory" aria-label="Remove">
              <TrashIcon width={14} height={14} />
              <span>Remove</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}