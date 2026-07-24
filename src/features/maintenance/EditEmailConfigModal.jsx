import { useState } from 'react'
import Modal from '@components/ui/Modal'
import Toggle from '@components/ui/Toggle'
import { EditIcon, SaveIcon, AlertTriangleIcon } from '@components/ui/icons'

export default function EditEmailConfigModal({ isOpen, config, onClose, onSubmit, onError }) {
  const [form, setForm] = useState({
    smtp_host: config.smtp_host || '',
    smtp_port: String(config.smtp_port || 587),
    smtp_user: config.smtp_user || '',
    from_name: config.from_name || '',
    enable_notifications: !!config.enable_notifications,
  })
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  function handleSubmit() {
    if (!form.smtp_host.trim()) return onError('SMTP host is required')
    const port = parseInt(form.smtp_port, 10)
    if (!port || port <= 0 || port > 65535) return onError('Enter a valid SMTP port')
    if (!form.smtp_user.trim()) return onError('SMTP user is required')
    if (!form.from_name.trim()) return onError('From name is required')

    onSubmit({
      smtp_host: form.smtp_host.trim(),
      smtp_port: port,
      smtp_user: form.smtp_user.trim(),
      from_name: form.from_name.trim(),
      enable_notifications: form.enable_notifications,
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Email Configuration"
      icon={<EditIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-blue" onClick={handleSubmit}>
            <SaveIcon width={13} height={13} /> Save Changes
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-group full">
          <label>SMTP HOST *</label>
          <input className="form-input" placeholder="smtp.example.edu" value={form.smtp_host} onChange={(e) => setField('smtp_host')(e.target.value)} />
        </div>
        <div className="form-group">
          <label>SMTP PORT *</label>
          <input className="form-input" type="number" value={form.smtp_port} onChange={(e) => setField('smtp_port')(e.target.value.replace(/[^0-9]/g, ''))} />
        </div>
        <div className="form-group">
          <label>SMTP USER *</label>
          <input className="form-input" placeholder="clinic@example.edu" value={form.smtp_user} onChange={(e) => setField('smtp_user')(e.target.value)} />
        </div>
        <div className="form-group full">
          <label>FROM NAME *</label>
          <input className="form-input" placeholder="University Clinic" value={form.from_name} onChange={(e) => setField('from_name')(e.target.value)} />
        </div>
        <div className="form-group full">
          <label>ENABLE EMAIL NOTIFICATIONS</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <Toggle checked={form.enable_notifications} onChange={setField('enable_notifications')} label="Enable email notifications" />
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{form.enable_notifications ? 'Enabled' : 'Disabled'}</span>
          </div>
        </div>
      </div>
      <div className="alert alert-warning" style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <AlertTriangleIcon width={15} height={15} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>This saves the settings the app will reference for outgoing email — it doesn't send a test email or verify the SMTP credentials actually work. Sending real email requires wiring an email provider (e.g. via a Supabase Edge Function), which is outside this settings panel.</span>
      </div>
    </Modal>
  )
}
