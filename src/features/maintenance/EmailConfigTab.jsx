import { MailIcon, EditIcon } from '@components/ui/icons'

export default function EmailConfigTab({ config, onEdit }) {
  const rows = [
    ['SMTP Host', config.smtp_host],
    ['SMTP Port', config.smtp_port],
    ['SMTP User', config.smtp_user],
    ['From Name', config.from_name],
  ]

  return (
    <div className="card">
      <div className="card-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><MailIcon width={15} height={15} /> Email Configuration</h3>
        <button type="button" className="btn btn-sm btn-blue" onClick={onEdit}>
          <EditIcon width={13} height={13} /> Edit
        </button>
      </div>
      <div style={{ padding: 18 }}>
        <div className="alert alert-info">ℹ️ These settings control outgoing notification emails from the clinic system.</div>
        <div style={{ marginTop: 16 }}>
          {rows.map(([label, value]) => (
            <div className="detail-row" key={label}>
              <span className="detail-label">{label}</span>
              <span className="detail-value" style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                {value}
              </span>
            </div>
          ))}
          <div className="detail-row">
            <span className="detail-label">Notifications</span>
            <span className="detail-value">
              <span className={`badge ${config.enable_notifications ? 'badge-green' : 'badge-gray'}`}>{config.enable_notifications ? 'Enabled' : 'Disabled'}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
