// Ported 1:1 from the legacy Fmt.badge() status->color map in core.js so
// every status pill across the app (not just this feature) stays consistent.
const STATUS_COLOR = {
  Pending: 'orange',
  Processing: 'blue',
  Approved: 'green',
  Declined: 'red',
  Claimed: 'teal',
  Good: 'green',
  'Low Stock': 'orange',
  Expired: 'red',
  'Needs Maintenance': 'purple',
  // Phase 8 — full inventory status set
  Available: 'green',
  'Critical Stock': 'red',
  'Out of Stock': 'gray',
  'Near Expiry': 'orange',
  Damaged: 'red',
  Confirmed: 'green',
  Scheduled: 'blue',
  Completed: 'green',
  Cancelled: 'red',
  Active: 'green',
  Inactive: 'gray',
  'Walk-in': 'purple',
  Emergency: 'red',
  Replenish: 'teal',
  Release: 'orange',
  'Remove Expired': 'red',
  Removed: 'red',
  Edit: 'blue',
  Merge: 'purple',
  'Edit (Maintenance)': 'purple',
  Maintained: 'green',
  'Maintenance Hold': 'purple',
  // Phase 7 canonical movement types
  Received: 'teal',
  Released: 'orange',
  Archived: 'purple',
  // Notification Center tier labels (Notification System Phase 6)
  'Expiring (90d)': 'green',
  'Expiring (60d)': 'blue',
  'Expiring (30d)': 'orange',
  'Expiring (7d)': 'red',
  // Emergency alerts (not in legacy Fmt.badge, kept for the Emergency Alerts feature)
  Acknowledged: 'orange',
  Resolved: 'green',
}

export default function StatusBadge({ status, color, noDot = false }) {
  const resolvedColor = color || STATUS_COLOR[status] || 'gray'
  const classes = ['badge', `badge-${resolvedColor}`, noDot ? 'badge-no-dot' : '']
    .filter(Boolean)
    .join(' ')

  return <span className={classes}>{status}</span>
}