import { useState } from 'react'
import StatusBadge from '@components/ui/StatusBadge'
import SearchInput from '@components/ui/SearchInput'
import { formatDateTime } from '@lib/format'
import { PhoneIcon } from '@components/ui/icons'

export default function SmsLogTab({ smsLog }) {
  const [search, setSearch] = useState('')
  const q = search.toLowerCase()
  const filtered = search
    ? smsLog.filter((s) => s.student_name.toLowerCase().includes(q) || s.parent_name.toLowerCase().includes(q))
    : smsLog

  return (
    <div className="card">
      <div className="card-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><PhoneIcon width={15} height={15} /> SMS Notification Log</h3>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search student or parent…" width={200} />
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date/Time</th>
              <th>Student</th>
              <th>Parent/Guardian</th>
              <th>Phone</th>
              <th>Situation</th>
              <th>Pickup</th>
              <th>Sent By</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                  No SMS notifications sent yet
                </td>
              </tr>
            )}
            {[...filtered].reverse().map((s) => (
              <tr key={s.sms_log_id}>
                <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{formatDateTime(s.created_at)}</td>
                <td>
                  <strong>{s.student_name}</strong>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.student_id}</div>
                </td>
                <td style={{ fontSize: 12 }}>
                  {s.parent_name} <span style={{ color: 'var(--text-3)' }}>({s.parent_relation})</span>
                </td>
                <td style={{ fontSize: 12 }}>{s.phone}</td>
                <td style={{ fontSize: 12 }}>{s.situation_label}</td>
                <td>
                  {s.pickup_flag === 'pickup' && <span className="badge badge-red badge-no-dot">Pickup</span>}
                  {s.pickup_flag === 'sendhome' && <span className="badge badge-orange badge-no-dot">Sent Home</span>}
                  {s.pickup_flag === 'none' && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>}
                </td>
                <td style={{ fontSize: 12 }}>{s.sent_by_name}</td>
                <td>
                  <StatusBadge status={s.status} color="teal" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
