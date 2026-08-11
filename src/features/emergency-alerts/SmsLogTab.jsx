import { useState } from 'react'
import Modal from '@components/ui/Modal'
import SearchInput from '@components/ui/SearchInput'
import { formatDateTime } from '@lib/format'
import { PhoneIcon, ChevronDownIcon, ChevronUpIcon, EyeIcon, TrashIcon } from '@components/ui/icons'
import { defaultShowMore } from '@lib/viewport'

/**
 * `canDelete` gates the Delete toggle entirely — set by
 * EmergencyAlertsPage.jsx from the current user's role/permissions
 * (admin, or a staff account granted the delete_logs permission in
 * Maintenance -> Staff Permissions). This is a UI convenience only; the
 * real enforcement is server-side (RLS, migration 028) — hiding the
 * button here just avoids showing an action that would fail anyway.
 *
 * Selection is opt-in via a "Delete" toggle (matching the pattern in
 * NotificationsModal.jsx) rather than checkboxes always being visible.
 */
export default function SmsLogTab({ smsLog, canDelete, onDelete }) {
  const [search, setSearch] = useState('')
  const [showMore, setShowMore] = useState(defaultShowMore)
  const [detailLog, setDetailLog] = useState(null)
  const [selected, setSelected] = useState([])
  const [selectionMode, setSelectionMode] = useState(false)
  const q = search.toLowerCase()
  const filtered = search
    ? smsLog.filter((s) => s.student_name.toLowerCase().includes(q) || s.parent_name.toLowerCase().includes(q))
    : smsLog

  function toggleSelectionMode() {
    setSelectionMode((m) => !m)
    setSelected([])
  }

  function toggleOne(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function toggleAll() {
    const visibleIds = filtered.map((s) => s.sms_log_id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))
    setSelected(allSelected ? selected.filter((id) => !visibleIds.includes(id)) : [...new Set([...selected, ...visibleIds])])
  }

  async function handleDeleteSelected() {
    await onDelete(selected)
    setSelected([])
    setSelectionMode(false)
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><PhoneIcon width={15} height={15} /> SMS Notification Log</h3>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search patient or parent…" width={200} />
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
            title="Show or hide Parent/Guardian, Phone, Pickup, and Sent By columns"
            aria-label={showMore ? 'View Less — hide Parent/Guardian, Phone, Pickup, and Sent By columns' : 'View More — show Parent/Guardian, Phone, Pickup, and Sent By columns'}
          >
            {showMore ? <ChevronUpIcon width={13} height={13} /> : <ChevronDownIcon width={13} height={13} />}
            <span>{showMore ? 'View Less' : 'View More'}</span>
          </button>
        </div>
      </div>
      {selectionMode && filtered.length > 0 && (
        <div style={{ padding: '10px 18px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={filtered.length > 0 && filtered.every((s) => selected.includes(s.sms_log_id))}
              onChange={toggleAll}
            />
            Select all visible
          </label>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {selectionMode && <th style={{ width: 30 }} />}
              <th>Date/Time</th>
              <th>Patient</th>
              {showMore && (
                <>
                  <th>Parent/Guardian</th>
                  <th>Phone</th>
                </>
              )}
              <th>Situation</th>
              {showMore && (
                <>
                  <th>Pickup</th>
                  <th>Sent By</th>
                </>
              )}
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={(showMore ? 8 : 4) + (selectionMode ? 1 : 0)} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                  No SMS notifications sent yet
                </td>
              </tr>
            )}
            {[...filtered].reverse().map((s) => (
              <tr key={s.sms_log_id}>
                {selectionMode && (
                  <td>
                    <input type="checkbox" checked={selected.includes(s.sms_log_id)} onChange={() => toggleOne(s.sms_log_id)} />
                  </td>
                )}
                {/* sms_log has no created_at column, only sent_at — this
                    previously read s.created_at, which silently rendered
                    an invalid date every single row. */}
                <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{formatDateTime(s.sent_at)}</td>
                <td>
                  <strong>{s.student_name}</strong>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.student_id}</div>
                </td>
                {showMore && (
                  <>
                    <td style={{ fontSize: 12 }}>
                      {s.parent_name} <span style={{ color: 'var(--text-3)' }}>({s.parent_relation})</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{s.phone}</td>
                  </>
                )}
                <td style={{ fontSize: 12 }}>{s.situation_label}</td>
                {showMore && (
                  <>
                    <td>
                      {s.pickup_flag === 'pickup' && <span className="badge badge-red badge-no-dot">Pickup</span>}
                      {s.pickup_flag === 'sendhome' && <span className="badge badge-orange badge-no-dot">Sent Home</span>}
                      {s.pickup_flag === 'none' && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>{s.sent_by_name}</td>
                  </>
                )}
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-xs btn-outline" onClick={() => setDetailLog(s)}>
                      <EyeIcon width={12} height={12} /> View
                    </button>
                    {canDelete && !selectionMode && (
                      <button type="button" className="btn btn-xs btn-outline btn-red" onClick={() => onDelete([s.sms_log_id])} title="Delete this entry">
                        <TrashIcon width={12} height={12} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!detailLog} onClose={() => setDetailLog(null)} title="Message Details" icon={<PhoneIcon width={16} height={16} />}>
        {detailLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="sms-detail-row">
              <div className="sms-detail-label">Sent</div>
              <div className="sms-detail-value">{formatDateTime(detailLog.sent_at)}</div>
            </div>
            <div className="sms-detail-row">
              <div className="sms-detail-label">Patient</div>
              <div className="sms-detail-value">{detailLog.student_name} <span style={{ color: 'var(--text-3)' }}>({detailLog.student_number})</span></div>
            </div>
            <div className="sms-detail-row">
              <div className="sms-detail-label">Parent/Guardian</div>
              <div className="sms-detail-value">{detailLog.parent_name || '—'} {detailLog.relation ? `(${detailLog.relation})` : ''}</div>
            </div>
            <div className="sms-detail-row">
              <div className="sms-detail-label">Sent To</div>
              <div className="sms-detail-value">{detailLog.parent_phone}</div>
            </div>
            <div className="sms-detail-row">
              <div className="sms-detail-label">Situation</div>
              <div className="sms-detail-value">{detailLog.situation_label || detailLog.situation}</div>
            </div>
            {detailLog.pickup_flag && detailLog.pickup_flag !== 'none' && (
              <div className="sms-detail-row">
                <div className="sms-detail-label">Pickup</div>
                <div className="sms-detail-value">
                  {detailLog.pickup_flag === 'pickup' ? 'Parent must pick up' : 'Sent home early'}
                </div>
              </div>
            )}
            <div className="sms-detail-row">
              <div className="sms-detail-label">Sent By</div>
              <div className="sms-detail-value">{detailLog.sent_by_name || '—'}</div>
            </div>
            <div className="sms-detail-row">
              <div className="sms-detail-label">Delivery</div>
              <div className="sms-detail-value">
                {detailLog.delivery_status === 'failed' ? (
                  <span className="badge badge-red">Failed to send</span>
                ) : (
                  <span className="badge badge-green">Delivered to provider</span>
                )}
              </div>
            </div>
            <div className="sms-detail-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="sms-detail-label" style={{ marginBottom: 6 }}>Message</div>
              <div className="sms-preview-message-box" style={{ minHeight: 0, maxHeight: 280 }}>{detailLog.message}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}