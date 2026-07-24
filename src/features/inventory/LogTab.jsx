import StatusBadge from '@components/ui/StatusBadge'
import SearchInput from '@components/ui/SearchInput'
import { ClipboardIcon, CameraIcon } from '@components/ui/icons'
import { formatDateTime } from '@lib/format'

export default function LogTab({ logs, staff, search, onSearchChange }) {
  const q = search.toLowerCase()
  const filtered = search
    ? logs.filter((l) => (l.item_name || '').toLowerCase().includes(q) || l.action_type.toLowerCase().includes(q))
    : logs

  const staffName = (id) => staff.find((s) => s.user_id === id)?.name

  return (
    <div className="card">
      <div className="card-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><ClipboardIcon width={15} height={15} /> Inventory Transaction Log</h3>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          <SearchInput value={search} onChange={onSearchChange} placeholder="Search log…" width={200} />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{filtered.length} entries</span>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date/Time</th>
              <th>Item</th>
              <th>Action</th>
              <th>Qty Change</th>
              <th>Previous → New</th>
              <th>Staff</th>
              <th>Scan Source</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                  No log entries
                </td>
              </tr>
            )}
            {filtered.map((l) => (
              <tr key={l.inventory_log_id}>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
