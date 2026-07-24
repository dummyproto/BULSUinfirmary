import { CheckCircleIcon } from '@components/ui/icons'

export default function SmsSuccessOverlay({ result, onClose }) {
  if (!result) return null

  return (
    <div className="emg-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="emg-success-box">
        <div className="sms-success-animation">
          <div className="sms-success-circle"><CheckCircleIcon width={22} height={22} /></div>
        </div>
        <h3>Message Sent!</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>
          Notification sent to <strong>{result.patient.parent_name}</strong> ({result.patient.parent_relation})
        </p>
        <div className="sms-sent-preview">{result.message}</div>
        <button type="button" className="btn btn-blue btn-full" style={{ marginTop: 16 }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
