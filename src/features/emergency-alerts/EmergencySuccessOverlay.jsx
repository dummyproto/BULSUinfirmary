import { CheckCircleIcon } from '@components/ui/icons'

export default function EmergencySuccessOverlay({ result, onClose }) {
  if (!result) return null
  return (
    <div className="emg-overlay open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="emg-success-box">
        <div className="emg-success-icon"><CheckCircleIcon width={28} height={28} /></div>
        <h3>Alert Sent!</h3>
        <p>
          Emergency alert for <strong>{result.name}</strong> at <strong>{result.location}</strong> has been sent to clinic staff.
        </p>
        <p style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>Stay calm. Help is on the way.</p>
        <button type="button" className="login-btn" style={{ marginTop: 18, maxWidth: 200 }} onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  )
}
