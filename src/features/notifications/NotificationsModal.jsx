import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '@components/ui/Modal'
import { useConfirm } from '@context/ConfirmContext'
import { timeAgo } from '@features/inventory/lib/inventoryHelpers'
import { InfoIcon, AlertTriangleIcon, AlertOctagonIcon, CheckCircleIcon, BellIcon, TrashIcon } from '@components/ui/icons'

const ICONS = { info: InfoIcon, warning: AlertTriangleIcon, danger: AlertOctagonIcon, success: CheckCircleIcon }

export default function NotificationsModal({ isOpen, onClose, notifications, loading, onMarkRead, onMarkAllRead, onDelete, onRefresh, onError }) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [selected, setSelected] = useState([])
  const [selectionMode, setSelectionMode] = useState(false)

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

  function toggleOne(e, id) {
    e.stopPropagation()
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function toggleAll() {
    const allIds = notifications.map((n) => n.notification_id)
    const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id))
    setSelected(allSelected ? [] : allIds)
  }

  function toggleSelectionMode() {
    setSelectionMode((m) => !m)
    setSelected([])
  }

  async function handleDeleteSelected() {
    const ok = await confirm(
      selected.length === 1 ? 'Delete this notification?' : `Delete ${selected.length} notifications?`,
      { confirmLabel: 'Delete' }
    )
    if (!ok) return
    try {
      await onDelete(selected)
      setSelected([])
      setSelectionMode(false)
      onRefresh?.()
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
        <div style={{ display: 'flex', gap: 8 }}>
          {selectionMode && selected.length > 0 && (
            <button type="button" className="btn btn-sm btn-red" onClick={handleDeleteSelected}>
              <TrashIcon width={13} height={13} /> Delete Selected ({selected.length})
            </button>
          )}
          <button type="button" className="btn btn-sm btn-outline" onClick={toggleSelectionMode}>
            {selectionMode ? (
              'Cancel'
            ) : (
              <>
                <TrashIcon width={13} height={13} /> Delete
              </>
            )}
          </button>
          <button type="button" className="btn btn-sm btn-outline" onClick={handleMarkAllRead}>
            Mark all read
          </button>
        </div>
      }
    >
      <div style={{ maxHeight: 420, overflowY: 'auto', margin: '-4px -4px -16px' }}>
                {notifications.length === 0 ? (
          // `loading` distinguishes "genuinely no notifications" from
          // "the panel just opened and the very first fetch hasn't
          // resolved yet" (Topbar.jsx's openNotifications() now opens
          // the panel immediately rather than waiting on that fetch, to
          // fix a separate "click the bell -> pause -> panel opens"
          // delay) — without this, that brief in-between moment would
          // otherwise flash a false "No notifications" that then
          // immediately gets replaced once the real list arrives, which
          // reads as a bug/flicker rather than normal loading.
          <div className="empty-state">{loading ? 'Loading notifications…' : 'No notifications'}</div>
        ) : (
          <>
            {selectionMode && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifications.length > 0 && notifications.every((n) => selected.includes(n.notification_id))}
                  onChange={toggleAll}
                />
                Select all
              </label>
            )}
            {notifications.map((n) => {
              const Icon = ICONS[n.type] || ICONS.info
              return (
                <div
                  key={n.notification_id}
                  className={`notif-item${!n.is_read ? ' unread' : ''}`}
                  onClick={() => handleItemClick(n)}
                >
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={selected.includes(n.notification_id)}
                      onClick={(e) => toggleOne(e, n.notification_id)}
                      onChange={() => {}}
                      style={{ flexShrink: 0, marginTop: 3 }}
                    />
                  )}
                  <Icon width={15} height={15} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="notif-text">{n.message}</div>
                    <div className="notif-time">{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </Modal>
  )
}