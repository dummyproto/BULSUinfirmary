import { useEffect, useRef, useState } from 'react'
import StatusBadge from '@components/ui/StatusBadge'
import SearchInput from '@components/ui/SearchInput'
import { ClipboardIcon, CameraIcon, ChevronDownIcon, ChevronUpIcon, TrashIcon } from '@components/ui/icons'
import { formatDateTime } from '@lib/format'
import { defaultShowMore } from '@lib/viewport'

/**
 * `canDelete` gates the Delete toggle entirely — set by
 * InventoryPage.jsx from the current user's role/permissions (admin, or
 * a staff account granted the delete_logs permission in Maintenance ->
 * Staff Permissions — the same flag that gates Alert Log/SMS Log
 * deletion). This is a UI convenience only; the real enforcement is
 * server-side (RLS, migration 029) — hiding the button here just avoids
 * showing an action that would fail anyway.
 *
 * Selection is opt-in via a "Delete" toggle (matching the pattern in
 * NotificationsModal.jsx) rather than checkboxes always being visible.
 */
export default function LogTab({ logs, staff, search, onSearchChange, canDelete, onDelete }) {
  const [showMore, setShowMore] = useState(defaultShowMore)
  const [selected, setSelected] = useState([])
  const [selectionMode, setSelectionMode] = useState(false)
  const q = search.toLowerCase()
  const filtered = search
    ? logs.filter((l) => (l.item_name || '').toLowerCase().includes(q) || l.action_type.toLowerCase().includes(q))
    : logs

  const staffName = (id) => staff.find((s) => s.user_id === id)?.name

  function toggleSelectionMode() {
    setSelectionMode((m) => !m)
    setSelected([])
  }

  function toggleOne(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function toggleAll() {
    const visibleIds = filtered.map((l) => l.inventory_log_id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))
    setSelected(allSelected ? selected.filter((id) => !visibleIds.includes(id)) : [...new Set([...selected, ...visibleIds])])
  }

  async function handleDeleteSelected() {
    await onDelete(selected)
    setSelected([])
    setSelectionMode(false)
  }

  // Same freeze-header-and-column-labels-while-scrolling treatment as
  // Inventory Items (ItemsTab.jsx) — measured live via ResizeObserver
  // since the header row can still wrap on narrow screens even though it
  // usually fits on one line at typical widths.
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

  return (
    <div className="card" style={{ '--log-header-h': `${headerHeight}px` }}>
      <div ref={headerRef} className="card-header inv-log-sticky-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><ClipboardIcon width={15} height={15} /> Inventory Transaction Log</h3>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={onSearchChange} placeholder="Search log…" width={200} />
          {canDelete && selectionMode && selected.length > 0 && (
            <button type="button" className="btn btn-sm btn-red" onClick={handleDeleteSelected} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              <TrashIcon width={13} height={13} /> Delete Selected ({selected.length})
            </button>
          )}
          {canDelete && (
            <button type="button" className="btn btn-sm btn-outline" onClick={toggleSelectionMode} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              {selectionMode ? 'Cancel' : (<><TrashIcon width={13} height={13} /> Delete</>)}
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm btn-outline inv-view-more-btn"
            onClick={() => setShowMore((v) => !v)}
            title="Show or hide Previous → New, Staff, Scan Source, and Notes columns"
            aria-label={showMore ? 'View Less — hide Previous → New, Staff, Scan Source, and Notes columns' : 'View More — show Previous → New, Staff, Scan Source, and Notes columns'}
          >
            {showMore ? <ChevronUpIcon width={13} height={13} /> : <ChevronDownIcon width={13} height={13} />}
            <span>{showMore ? 'View Less' : 'View More'}</span>
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{filtered.length} entries</span>
        </div>
      </div>
      {selectionMode && filtered.length > 0 && (
        <div style={{ padding: '10px 18px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={filtered.length > 0 && filtered.every((l) => selected.includes(l.inventory_log_id))}
              onChange={toggleAll}
            />
            Select all visible
          </label>
        </div>
      )}
      <div className="table-wrap inv-log-scroll">
        <table className="inv-log-table">
          <thead>
            <tr>
              {selectionMode && <th style={{ width: 30 }} />}
              <th>Date/Time</th>
              <th>Item</th>
              <th>Action</th>
              <th>Qty Change</th>
              {showMore && (
                <>
                  <th>Previous → New</th>
                  <th>Staff</th>
                  <th>Scan Source</th>
                  <th>Notes</th>
                </>
              )}
              {canDelete && !selectionMode && <th style={{ textAlign: 'right' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={(showMore ? 8 : 4) + (selectionMode || canDelete ? 1 : 0)} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                  No log entries
                </td>
              </tr>
            )}
            {filtered.map((l) => (
              <tr key={l.inventory_log_id}>
                {selectionMode && (
                  <td>
                    <input type="checkbox" checked={selected.includes(l.inventory_log_id)} onChange={() => toggleOne(l.inventory_log_id)} />
                  </td>
                )}
                <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{formatDateTime(l.created_at || l.log_date)}</td>
                <td>
                  <strong>{l.item_name || '—'}</strong>
                  {l.batch_id && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Batch: {l.batch_id}</div>}
                  {l.medicine_batch_number && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Batch: {l.medicine_batch_number}</div>}
                </td>
                <td>
                  <StatusBadge status={l.action_type} />
                </td>
                <td style={{ fontWeight: 700, fontSize: 15, color: l.quantity_change > 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {l.quantity_change > 0 ? '+' : ''}
                  {l.quantity_change}
                </td>
                {showMore && (
                  <>
                    <td style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      {l.previous_quantity !== null && l.previous_quantity !== undefined ? (
                        <>
                          {l.previous_quantity} → <strong>{l.new_quantity}</strong>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-3)' }} title="Not captured for entries logged before Phase 7">
                          —
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{staffName(l.staff_id) || '—'}</td>
                    <td>
                      {l.from_scan ? (
                        <span className="badge badge-purple badge-no-dot" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <CameraIcon width={10} height={10} /> QR Scan
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Manual</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{l.notes || '—'}</td>
                  </>
                )}
                {canDelete && !selectionMode && (
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn btn-xs btn-outline btn-red" onClick={() => onDelete([l.inventory_log_id])} title="Delete this entry">
                      <TrashIcon width={12} height={12} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}