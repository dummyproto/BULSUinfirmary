import { LockIcon } from '@components/ui/icons'

export default function ReportsAccessRestricted() {
  return (
    <div className="empty-state" style={{ padding: 60 }}>
      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center', color: 'var(--text-3)' }}>
        <LockIcon width={40} height={40} />
      </div>
      <h3 style={{ marginBottom: 6 }}>Reports access is restricted</h3>
      <p style={{ color: 'var(--text-2)' }}>
        You don't currently have permission to view or generate reports. Please contact an administrator for permission.
      </p>
    </div>
  )
}