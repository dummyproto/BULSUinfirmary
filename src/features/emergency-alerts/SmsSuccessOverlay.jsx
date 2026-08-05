import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircleIcon } from '@components/ui/icons'
import { useDelayedUnmount } from '@hooks/useDelayedUnmount'

const EXIT_DURATION = 160

export default function SmsSuccessOverlay({ result, onClose }) {
  const { shouldRender, closing } = useDelayedUnmount(Boolean(result), EXIT_DURATION)
  // `result` is nulled out by the parent the moment onClose fires, but this
  // stays mounted EXIT_DURATION ms longer to play the close animation — so
  // it needs its own last-known copy to render from during that window.
  const [shown, setShown] = useState(result)
  if (result && result !== shown) setShown(result)
  if (!shouldRender) return null

  return createPortal(
    <div className={`emg-overlay${closing ? ' closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="emg-success-box">
        <div className="sms-success-animation">
          <div className="sms-success-circle"><CheckCircleIcon width={22} height={22} /></div>
        </div>
        <h3>Message Sent!</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>
          Notification sent to <strong>{shown.patient.parent_name}</strong> ({shown.patient.parent_relation})
        </p>
        <div className="sms-sent-preview">{shown.message}</div>
        <button type="button" className="btn btn-blue btn-full" style={{ marginTop: 16 }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>,
    document.body
  )
}