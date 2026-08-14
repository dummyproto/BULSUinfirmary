import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircleIcon, PhoneIcon } from '@components/ui/icons'
import { useDelayedUnmount } from '@hooks/useDelayedUnmount'
import { stopEmergencySiren } from '@lib/emergencySound'

const EXIT_DURATION = 160

export default function EmergencySuccessOverlay({ result, onClose }) {
  const { shouldRender, closing } = useDelayedUnmount(Boolean(result), EXIT_DURATION)
  // `result` is nulled out by the parent the moment onClose fires, but this
  // stays mounted EXIT_DURATION ms longer to play the close animation — so
  // it needs its own last-known copy to render from during that window.
  const [shown, setShown] = useState(result)
  if (result && result !== shown) setShown(result)
  if (!shouldRender) return null

  // The sender's own siren (started by playEmergencySiren() the moment
  // their alert was submitted — see EmergencyReportModal) keeps sounding
  // for up to ~60s otherwise. Acknowledging "Alert Sent!" is the sender's
  // own confirmation that they're done here, same as a staff member
  // acknowledging/dismissing an incoming alert already cuts it short.
  function handleClose() {
    stopEmergencySiren()
    onClose()
  }

  return createPortal(
    <div className={`emg-overlay open${closing ? ' closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="emg-success-box">
        <div className="emg-success-icon"><CheckCircleIcon width={28} height={28} /></div>
        <h3>Alert Sent!</h3>
        <p>
          Emergency alert for <strong>{shown.name}</strong> at <strong>{shown.location}</strong> has been sent to clinic staff.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Stay calm. Help is on the way.</p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <PhoneIcon width={12} height={12} /> You can also call the clinic directly: <strong style={{ color: 'var(--text-2)' }}>0907-684-2769</strong>
        </p>
        <button type="button" className="login-btn" style={{ marginTop: 18, maxWidth: 200 }} onClick={handleClose}>
          OK
        </button>
      </div>
    </div>,
    document.body
  )
}