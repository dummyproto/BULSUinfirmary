import { createPortal } from 'react-dom'
import { EmergencyIcon } from '@components/ui/icons'
import { useDelayedUnmount } from '@hooks/useDelayedUnmount'

const EXIT_DURATION = 160

export default function EmergencyConfirmModal({ isOpen, onCancel, onProceed }) {
  const { shouldRender, closing } = useDelayedUnmount(isOpen, EXIT_DURATION)
  if (!shouldRender) return null
  return createPortal(
    <div className={`emg-overlay open${closing ? ' closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="emg-confirm-box">
        <div className="emg-confirm-icon"><EmergencyIcon width={28} height={28} /></div>
        <h3>Send Emergency Alert?</h3>
        <p>Do you want to proceed with sending an emergency alert to the clinic staff?</p>
        <div className="emg-confirm-btns">
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="emg-proceed-btn" onClick={onProceed}>
            Proceed
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}