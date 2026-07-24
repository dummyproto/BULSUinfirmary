import { useState } from 'react'
import StatusBadge from '@components/ui/StatusBadge'
import { formatDateTime } from '@lib/format'
import { ClipboardIcon, DownloadIcon, MapPinIcon } from '@components/ui/icons'

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
          <button type="button" className="btn btn-sm btn-outline" onClick={() => exportAlertsCsv(filtered)}>
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
              <StatusBadge status={a.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
