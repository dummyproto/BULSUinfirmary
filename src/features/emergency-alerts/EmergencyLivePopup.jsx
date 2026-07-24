import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { acknowledgeAlert } from '@services/emergencyAlertsService'
import { notify } from '@services/notificationsService'
import { timeAgo } from '@features/inventory/lib/inventoryHelpers'
import { CheckCircleIcon, EyeIcon, XIcon, AlertOctagonIcon } from '@components/ui/icons'

// The .emg-live-* CSS classes this renders into already existed, fully
// designed, in legacy.css — a "Live Emergency Popup" was clearly planned
// (siren bar, patient row, info grid, action buttons, all present down to
// hover states) but no component ever consumed them. This is that
// component, matching the existing design exactly rather than inventing a
// new visual language for it.
export default function EmergencyLivePopup({ alert, currentUserId, onClose, onAcknowledged, onError }) {
  const navigate = useNavigate()
  const [acking, setAcking] = useState(false)

  if (!alert) return null

  async function handleAcknowledge() {
    setAcking(true)
    try {
      const updated = await acknowledgeAlert(alert.emergency_alert_id, currentUserId)
      onAcknowledged?.(updated)
      // Same notify-the-reporter-back behavior as the Emergency Alerts
      // page's own Acknowledge button — this popup is a second entry
      // point to the same action, not a different one, so it should
      // have the same effect either way.
      if (updated.reported_by) {
        try {
          await notify({
            targetUserId: updated.reported_by,
            message: `Your emergency alert for ${updated.subject_name || 'the reported situation'} has been acknowledged — help is on the way.`,
            type: 'success',
            module: '/dashboard',
          })
        } catch {
          // Non-critical.
        }
      }
      onClose()
    } catch (err) {
      onError?.(err.message)
      setAcking(false)
    }
  }

  function handleView() {
    onClose()
    navigate('/emergency-alerts')
  }

  const avatarLetter = (alert.subject_name || alert.reporter_name || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="emg-live-backdrop emg-live-open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="emg-live-modal">
        <div className="emg-live-siren-bar">
          <span className="emg-live-siren-icon">
            <AlertOctagonIcon width={18} height={18} />
          </span>
          <span className="emg-live-siren-text">EMERGENCY ALERT</span>
        </div>

        <div className="emg-live-body">
          <div className="emg-live-badge-row">
            <span className="emg-live-status-badge">ACTIVE — NEEDS RESPONSE</span>
            <span className="emg-live-time">{timeAgo(alert.created_at)}</span>
          </div>

          <div className="emg-live-patient-row">
            <div className="emg-live-avatar">{avatarLetter}</div>
            <div>
              <div className="emg-live-patient-name">{alert.subject_name || 'Unknown'}</div>
              <div className="emg-live-patient-num">
                Reported by {alert.reporter_name}
                {alert.subject_student_num ? ` · ${alert.subject_student_num}` : ''}
              </div>
            </div>
          </div>

          <div className="emg-live-info-grid">
            <div className="emg-live-info-item">
              <div className="emg-live-info-label">Location</div>
              <div className="emg-live-info-val">{alert.location || '—'}</div>
            </div>
            <div className="emg-live-info-item">
              <div className="emg-live-info-label">Type</div>
              <div className="emg-live-info-val">{alert.emergency_type || '—'}</div>
            </div>
          </div>

          {alert.description && (
            <div className="emg-live-desc-box">
              <div className="emg-live-desc-text">{alert.description}</div>
            </div>
          )}

          <div className="emg-live-actions">
            <button type="button" className="emg-live-btn emg-live-btn-ack" onClick={handleAcknowledge} disabled={acking}>
              <CheckCircleIcon width={14} height={14} /> {acking ? 'Acknowledging…' : 'Acknowledge'}
            </button>
            <button type="button" className="emg-live-btn emg-live-btn-view" onClick={handleView}>
              <EyeIcon width={14} height={14} /> View Details
            </button>
            <button type="button" className="emg-live-btn emg-live-btn-dismiss" onClick={onClose}>
              <XIcon width={14} height={14} /> Dismiss
            </button>
          </div>

          <div className="emg-live-footer">
            <div className="emg-live-footer-note">Dismissing only closes this popup — the alert stays active in Emergency Alerts until acknowledged.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
