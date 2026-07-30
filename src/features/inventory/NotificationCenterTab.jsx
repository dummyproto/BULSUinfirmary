import { useMemo, useState } from 'react'
import StatusBadge from '@components/ui/StatusBadge'
import { formatDateTime } from '@lib/format'
import { MailIcon, CheckCircleIcon } from '@components/ui/icons'

const TYPE_LABELS = {
  low_stock: 'Low Stock',
  critical_stock: 'Critical Stock',
  out_of_stock: 'Out of Stock',
  expiring_90: 'Expiring (90d)',
  expiring_60: 'Expiring (60d)',
  expiring_30: 'Expiring (30d)',
  expiring_7: 'Expiring (7d)',
  expired: 'Expired',
  received: 'Received',
  released: 'Released',
  damaged: 'Damaged',
  adjustment: 'Adjustment',
  archived: 'Archived',
}

const PRIORITY_COLOR = { low: 'badge-gray', medium: 'badge-blue', high: 'badge-orange', critical: 'badge-red' }

// The persisted history of what Phases 2-5 generated (Low/Critical/Out of
// Stock, four expiration tiers, and the five event types), with
// read/unread tracking — distinct from the Alerts tab, which shows
// live-computed "what needs attention right now" rows, not a log.
export default function NotificationCenterTab({ notifications, unreadCount, onMarkRead, onMarkAllRead, onOpenRecord }) {
  const [typeFilter, setTypeFilter] = useState('All')
  const [unreadOnly, setUnreadOnly] = useState(false)

  const types = useMemo(() => ['All', ...new Set(notifications.map((n) => n.notification_type))], [notifications])
  const filtered = notifications.filter((n) => (typeFilter === 'All' || n.notification_type === typeFilter) && (!unreadOnly || !n.is_read))

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <MailIcon width={15} height={15} /> Notification Center
          {unreadCount > 0 && (
            <span className="badge badge-red badge-no-dot" style={{ fontSize: 11 }}>
              {unreadCount} unread
            </span>
          )}
        </h3>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="form-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ minWidth: 160 }}>
            {types.map((t) => (
              <option key={t} value={t}>
                {t === 'All' ? 'All Types' : TYPE_LABELS[t] || t}
              </option>
            ))}
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            Unread only
          </label>
          <button type="button" className="btn btn-sm btn-outline" onClick={onMarkAllRead} disabled={unreadCount === 0}>
            <CheckCircleIcon width={13} height={13} /> Mark All Read
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: 40 }}>
          <p>{notifications.length === 0 ? 'No notifications yet.' : 'No notifications match your filters.'}</p>
        </div>
      ) : (
        <div style={{ padding: '4px 0' }}>
          {filtered.map((n) => (
            <div
              key={n.id}
              onClick={() => onOpenRecord(n)}
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                cursor: 'pointer',
                background: n.is_read ? 'transparent' : 'var(--surface2)',
              }}
            >
              {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', marginTop: 6, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                  <strong style={{ fontSize: 13 }}>{n.title}</strong>
                  <StatusBadge status={TYPE_LABELS[n.notification_type] || n.notification_type} />
                  <span className={`badge ${PRIORITY_COLOR[n.priority] || 'badge-gray'} badge-no-dot`} style={{ fontSize: 10 }}>
                    {n.priority}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 3 }}>{n.message}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  {formatDateTime(n.created_at)} · {n.created_by_name}
                </div>
              </div>
              {!n.is_read && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMarkRead(n.id)
                  }}
                  style={{ flexShrink: 0 }}
                >
                  Mark Read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
