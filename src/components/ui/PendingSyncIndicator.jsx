import { useState } from 'react'
import { useOfflineQueue } from '@hooks/useOfflineQueue'
import { useOnlineStatus } from '@hooks/useOnlineStatus'
import { useConfirm } from '@context/ConfirmContext'
import { removeQueuedAction } from '@services/offlineQueueService'
import { ClockIcon, XIcon, RefreshCwIcon, AlertTriangleIcon } from './icons'

/**
 * Mounted once in AppShell, alongside OfflineBanner — but visible
 * whenever there's anything queued, not only while actually offline.
 * Two cases this covers that OfflineBanner alone doesn't:
 *   1. Connection is back, but the automatic flush (offlineQueueService's
 *      own 'online' listener) hasn't run yet or is mid-flush — the
 *      person should still see "3 pending" rather than nothing.
 *   2. A queued item failed to replay even once back online (e.g. the
 *      medicine-batch/stock-mismatch risk noted in
 *      inventoryOfflineActions.js / consultationOfflineActions.js) — that
 *      needs to stay visible with its error, not silently vanish.
 */
export default function PendingSyncIndicator() {
  const { pendingItems, pendingCount, syncNow } = useOfflineQueue()
  const isOnline = useOnlineStatus()
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState(false)
  const [syncing, setSyncing] = useState(false)

  if (pendingCount === 0) return null

  const hasErrors = pendingItems.some((i) => i.lastError)

  async function handleSyncNow() {
    setSyncing(true)
    try {
      await syncNow()
    } finally {
      setSyncing(false)
    }
  }

  // Phase 5 — discarding was a single click with no confirmation, a real
  // data-loss risk: a genuine queued consultation or inventory action
  // (not yet saved anywhere else) would be gone with one accidental tap.
  async function handleDiscard(item) {
    const ok = await confirm(
      `Discard this queued action?\n"${item.meta?.summary || item.type}" has not been saved anywhere — discarding it here means it's gone for good.`,
      { confirmLabel: 'Discard', danger: true }
    )
    if (!ok) return
    removeQueuedAction(item.id)
  }

  return (
    <div
      className="pending-sync-indicator"
      role="status"
      style={{
        position: 'fixed',
        right: 16,
        // Clears the mobile bottom nav (already reserved ~84px of
        // clearance elsewhere in this app for the same reason — see
        // legacy.css's own .chatbot-layout bottom-nav comment) on
        // narrow/touch devices; on desktop there's no bottom nav to
        // clear, so this just sits a bit higher than it strictly needs
        // to, which is harmless.
        bottom: 'max(16px, env(safe-area-inset-bottom, 0px) + 84px)',
        zIndex: 4500,
      }}
    >
      <button
        type="button"
        className="pending-sync-toggle"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 12.5,
          fontWeight: 600,
          background: hasErrors ? 'var(--danger-light, #FEE2E2)' : 'var(--warning-light, #FEF3C7)',
          color: hasErrors ? 'var(--danger, #B91C1C)' : 'var(--warning-dark, #92400E)',
        }}
      >
        {hasErrors ? <AlertTriangleIcon width={14} height={14} /> : <ClockIcon width={14} height={14} />}
        {pendingCount} pending sync{pendingCount === 1 ? '' : 's'}
      </button>

      {expanded && (
        <div
          className="pending-sync-panel"
          style={{
            marginTop: 6,
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border, #E5E7EB)',
            borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,.12)',
            padding: 10,
            maxWidth: 340,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 12.5 }}>Waiting to sync</strong>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={!isOnline || syncing}
              title={!isOnline ? "Can't sync while offline" : 'Try syncing now'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11.5,
                border: 'none',
                background: 'none',
                color: !isOnline ? 'var(--text-3, #9CA3AF)' : 'var(--primary, #2563EB)',
                cursor: !isOnline || syncing ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCwIcon width={12} height={12} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {pendingItems.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: 12,
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: item.lastError ? 'var(--danger-light, #FEE2E2)' : 'var(--surface2, #F9FAFB)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.meta?.summary || item.type}
                  </div>
                  <div style={{ color: 'var(--text-3, #9CA3AF)', fontSize: 10.5 }}>
                    Queued {new Date(item.queuedAt).toLocaleString()}
                  </div>
                  {item.lastError && (
                    <div style={{ color: 'var(--danger, #B91C1C)', fontSize: 10.5, marginTop: 2 }}>
                      Failed to sync: {item.lastError}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDiscard(item)}
                  title="Discard this queued action — it will NOT be saved"
                  style={{ flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3, #9CA3AF)' }}
                >
                  <XIcon width={13} height={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}