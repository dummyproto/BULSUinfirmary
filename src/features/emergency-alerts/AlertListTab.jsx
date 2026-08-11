import StatusBadge from '@components/ui/StatusBadge'
import { formatDateTime } from '@lib/format'
import { AlertOctagonIcon, ClockIcon, CheckCircleIcon, PhoneIcon, MapPinIcon, MessageSquareIcon, EyeIcon } from '@components/ui/icons'

export default function AlertListTab({ alerts, onAck, onResolve, onGoToSMS }) {
  const active = alerts.filter((a) => a.status !== 'Resolved').sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <div className="card sms-chat-main" style={{ padding: 18, overflowY: 'auto' }}>
      {active.some((a) => a.status === 'Active') && (
        <div className="emg-dash-banner" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertOctagonIcon width={15} height={15} style={{ flexShrink: 0 }} />
          <span>{active.filter((a) => a.status === 'Active').length} unacknowledged emergency alert(s) require immediate attention.</span>
        </div>
      )}

      {active.length === 0 && (
        <div className="empty-state" style={{ padding: 60 }}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: 'var(--success)' }}><CheckCircleIcon width={48} height={48} /></div>
          <h3>No Active Alerts</h3>
          <p>All emergency alerts have been resolved.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {active.map((a) => (
          <div
            key={a.emergency_alert_id}
            className="card"
            style={{ borderLeft: `4px solid ${a.status === 'Active' ? 'var(--danger)' : 'var(--warning)'}` }}
          >
            <div style={{ padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ color: a.status === 'Active' ? 'var(--danger)' : 'var(--warning)' }}>{a.status === 'Active' ? <AlertOctagonIcon width={28} height={28} /> : <ClockIcon width={28} height={28} />}</div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 14 }}>{a.subject_name}</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>({a.subject_student_num})</span>
                  <StatusBadge status={a.status} />
                  {a.sms_sent && (
                    <span className="badge badge-teal badge-no-dot" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <PhoneIcon width={10} height={10} /> Parent Notified
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>{a.description}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPinIcon width={11} height={11} /> {a.location}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MessageSquareIcon width={11} height={11} /> Reported by: {a.reporter_name} {a.emergency_type === 'myself' ? '(self-report)' : '(on behalf of subject)'}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ClockIcon width={11} height={11} /> {formatDateTime(a.created_at)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {a.status === 'Active' && (
                  <button type="button" className="btn btn-sm btn-orange" onClick={() => onAck(a.emergency_alert_id)}>
                    <EyeIcon width={13} height={13} /> Acknowledge
                  </button>
                )}
                {!a.sms_sent && (
                  <button type="button" className="btn btn-sm btn-teal" onClick={() => onGoToSMS(a)}>
                    <PhoneIcon width={13} height={13} /> Notify Parent
                  </button>
                )}
                <button type="button" className="btn btn-sm btn-green" onClick={() => onResolve(a.emergency_alert_id)}>
                  <CheckCircleIcon width={13} height={13} /> Resolve
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}