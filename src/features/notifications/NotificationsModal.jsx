import { useNavigate } from 'react-router-dom'
import Modal from '@components/ui/Modal'
import { timeAgo } from '@features/inventory/lib/inventoryHelpers'
import { InfoIcon, AlertTriangleIcon, AlertOctagonIcon, CheckCircleIcon, BellIcon } from '@components/ui/icons'

const ICONS = { info: InfoIcon, warning: AlertTriangleIcon, danger: AlertOctagonIcon, success: CheckCircleIcon }

export default function NotificationsModal({ isOpen, onClose, notifications, onMarkRead, onMarkAllRead, onRefresh, onError }) {
  const navigate = useNavigate()

  async function handleItemClick(n) {
    try {
      if (!n.is_read) await onMarkRead(n.notification_id)
      onClose()
      if (n.module) navigate(n.module)
      onRefresh?.()
    } catch (err) {
      onError?.(err.message)
    }
  }

  async function handleMarkAllRead() {
    try {
      await onMarkAllRead()
      onRefresh?.()
      onClose()
    } catch (err) {
      onError?.(err.message)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Notifications"
      icon={<BellIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-sm btn-outline" onClick={handleMarkAllRead}>
            Mark all read
          </button>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div style={{ maxHeight: 420, overflowY: 'auto', margin: '-4px -4px -16px' }}>
        {notifications.length === 0 ? (
          <div className="empty-state">No notifications</div>
        ) : (
          notifications.map((n) => {
            const Icon = ICONS[n.type] || ICONS.info
            return (
              <div
                key={n.notification_id}
                className={`notif-item${!n.is_read ? ' unread' : ''}`}
                onClick={() => handleItemClick(n)}
              >
                <Icon width={15} height={15} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div className="notif-text">{n.message}</div>
                  <div className="notif-time">{timeAgo(n.created_at)}</div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}
