import { useState } from 'react'
import Modal from '@components/ui/Modal'
import StatusBadge from '@components/ui/StatusBadge'
import { formatDateTime } from '@lib/format'
import { ClipboardIcon, DownloadIcon, MapPinIcon, EyeIcon } from '@components/ui/icons'

const STATUSES = ['All', 'Active', 'Acknowledged', 'Resolved']

function exportAlertsCsv(alerts) {
  const header = ['Date', 'Subject', 'Student #', 'Location', 'Status', 'Description']
  const rows = alerts.map((a) => [
    formatDateTime(a.created_at),
    a.subject_name,
    a.subject_student_num,
    a.location,
    a.status,
    `"${(a.description || '').replace(/"/g, '""')}"`,
  ])
  const csv = [header, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `emergency-alerts-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AlertLogTab({ alerts }) {
  const [status, setStatus] = useState('All')
  const [detailAlert, setDetailAlert] = useState(null)
  const filtered = (status === 'All' ? alerts : alerts.filter((a) => a.status === status))
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><ClipboardIcon width={15} height={15} /> Emergency Alert Log</h3>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          <select className="form-select" style={{ fontSize: 12, padding: '5px 8px' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => exportAlertsCsv(filtered)} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            <DownloadIcon width={13} height={13} /> Export CSV
          </button>
        </div>
      </div>
      <div style={{ padding: '6px 18px' }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>No alerts found</div>
        )}
        {filtered.map((a) => (
          <div className="emg-log-entry" key={a.emergency_alert_id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div className="emg-log-body">
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {a.subject_name} <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 11 }}>({a.subject_student_num})</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>{a.description}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  <MapPinIcon width={11} height={11} style={{ verticalAlign: -1 }} /> {a.location} · {formatDateTime(a.created_at)}
                  {a.resolved_at ? ` · Resolved ${formatDateTime(a.resolved_at)}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <StatusBadge status={a.status} />
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setDetailAlert(a)}>
                  <EyeIcon width={12} height={12} /> View
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={detailAlert !== null} onClose={() => setDetailAlert(null)} title="Emergency Alert Details" icon={<ClipboardIcon width={16} height={16} />}>
        {detailAlert && (
          <div>
            <div className="detail-row">
              <span className="detail-label">Subject</span>
              <span className="detail-value">
                {detailAlert.subject_name} ({detailAlert.subject_student_num})
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Type</span>
              <span className="detail-value">{detailAlert.emergency_type}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Location</span>
              <span className="detail-value">{detailAlert.location}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Description</span>
              <span className="detail-value">{detailAlert.description}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status</span>
              <span className="detail-value">
                <StatusBadge status={detailAlert.status} />
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Reported</span>
              <span className="detail-value">{formatDateTime(detailAlert.created_at)}</span>
            </div>
            {detailAlert.resolved_at && (
              <div className="detail-row">
                <span className="detail-label">Resolved</span>
                <span className="detail-value">{formatDateTime(detailAlert.resolved_at)}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">SMS Sent</span>
              <span className="detail-value">{detailAlert.sms_sent ? 'Yes' : 'No'}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}