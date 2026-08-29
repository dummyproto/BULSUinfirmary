import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@context/ToastContext'
import SearchInput from '@components/ui/SearchInput'
import Spinner from '@components/ui/Spinner'
import Tabs from '@components/ui/Tabs'
import { listAuditLogs } from '@services/auditLogsService'
import { listInventoryLogs } from '@services/inventoryService'
import { formatDateTime } from '@lib/format'
import { useRealtimeRefresh } from '@hooks/useRealtimeRefresh'
import { HistoryIcon } from '@components/ui/icons'

// Maps the fixed set of action codes this app actually writes (see
// addAuditLog()/logAuthEvent() call sites across MaintenancePage.jsx,
// EmergencyReportModal.jsx, AuthContext.jsx, LoginPage.jsx, and
// ProtectedRoute.jsx) to a badge color — grouped by how consequential
// the action is, not by which page wrote it: destructive actions read
// red, security-sensitive ones orange, routine edits blue,
// activation/registration green. Anything not in this list (a future
// action type this page hasn't been updated for yet) still renders
// fine via the 'gray'/reformatted-label fallback below rather than
// breaking.
const ACTION_STYLES = {
  ADD_USER: { color: 'green', label: 'Added User' },
  EDIT_USER: { color: 'blue', label: 'Edited User' },
  ACTIVATE_USER: { color: 'green', label: 'Activated User' },
  DEACTIVATE_USER: { color: 'orange', label: 'Deactivated User' },
  DELETE_USER: { color: 'red', label: 'Deleted User' },
  RESET_PASSWORD: { color: 'orange', label: 'Reset Password' },
  UPDATE_PERMISSION: { color: 'purple', label: 'Updated Permission' },
  // A patient/staff/admin editing their OWN info from Account Settings —
  // distinct from an admin editing SOMEONE ELSE's record (EDIT_USER,
  // written from Maintenance -> User Management). Written from
  // ProfilePage.jsx's handleSaveProfile, the one profile-edit entry
  // point shared by all three roles.
  EDIT_OWN_PROFILE: { color: 'blue', label: 'Edited Own Profile' },
  EMERGENCY_ALERT: { color: 'red', label: 'Emergency Alert' },
  REGISTER: { color: 'green', label: 'Self-Registered' },
  LOGIN_SUCCESS: { color: 'green', label: 'Login' },
  LOGIN_FAILED: { color: 'orange', label: 'Failed Login' },
  LOGIN_DENIED: { color: 'red', label: 'Login Denied' },
  LOGOUT: { color: 'blue', label: 'Logout' },
  PASSWORD_CHANGED: { color: 'blue', label: 'Password Changed' },
  PASSWORD_RESET_REQUESTED: { color: 'orange', label: 'Password Reset Requested' },
  PASSWORD_RESET_COMPLETED: { color: 'green', label: 'Password Reset Completed' },
  // QR code (My QR Code modal, Profile / Account Settings) — downloading
  // it is the meaningful, deliberate action worth auditing (a security-
  // relevant artifact usable for QR login/registration leaving the
  // app); just opening the modal to view it isn't logged, matching this
  // project's stance on not auditing plain viewing/UI interactions.
  QR_CODE_DOWNLOADED: { color: 'teal', label: 'QR Code Downloaded' },
  // Quick-login PIN setup (Account Settings -> Settings tab, all roles).
  // Grouped with the password-related codes above since it's the same
  // kind of security-credential change, just for the PIN instead.
  PIN_UPDATED: { color: 'blue', label: 'PIN Set/Updated' },
  PIN_REMOVED: { color: 'orange', label: 'PIN Removed' },
  EMAIL_VERIFIED: { color: 'green', label: 'Email Verified' },
  ACCESS_DENIED: { color: 'red', label: 'Access Denied' },
  // Staff responding to an emergency alert — written from
  // EmergencyAlertsPage.jsx's handleAck/handleResolve. No dedicated tab
  // (same as EMERGENCY_ALERT above); both show on System Activity Log.
  EMERGENCY_ACKNOWLEDGED: { color: 'orange', label: 'Emergency Acknowledged' },
  EMERGENCY_RESOLVED: { color: 'green', label: 'Emergency Resolved' },
  // A staff member recording a patient consultation/visit — written
  // from ConsultationPage.jsx's handleSaveConsultation. No dedicated tab
  // (same reasoning as the emergency codes above); shows on System
  // Activity Log.
  CONSULTATION_ADDED: { color: 'blue', label: 'Consultation Recorded' },
  // Staff/admin opening a patient's record from the Patients page —
  // written from PatientDetailModal.jsx. Same "no dedicated tab"
  // treatment as the two codes above; this modal surfaces health data
  // (consultation history, document requests), so who looked at a
  // given patient's record and when is worth auditing on its own, even
  // though nothing was changed.
  PATIENT_RECORD_VIEWED: { color: 'teal', label: 'Viewed Patient Record' },
  // Inventory actions — normalizeInventoryLog() below maps every
  // inventory_logs.action_type value actually written by
  // InventoryPage.jsx (addInventoryLog) and medicineService.js
  // (addMedicineMovement, same underlying table) to one of these.
  INVENTORY_REPLENISH: { color: 'green', label: 'Replenished Stock' },
  INVENTORY_RECEIVED: { color: 'green', label: 'Received Stock' },
  INVENTORY_RELEASE: { color: 'blue', label: 'Released Stock' },
  INVENTORY_RELEASED: { color: 'blue', label: 'Released Stock' },
  INVENTORY_EDIT: { color: 'blue', label: 'Edited Item' },
  INVENTORY_MERGE: { color: 'purple', label: 'Merged Item' },
  INVENTORY_ADJUSTMENT: { color: 'purple', label: 'Stock Adjustment' },
  INVENTORY_ARCHIVED: { color: 'orange', label: 'Archived Batch' },
  INVENTORY_REMOVED: { color: 'red', label: 'Removed Item' },
  INVENTORY_REMOVE_EXPIRED: { color: 'orange', label: 'Removed Expired Stock' },
  INVENTORY_EXPIRED: { color: 'orange', label: 'Marked Expired' },
  INVENTORY_DAMAGED: { color: 'red', label: 'Reported Damaged' },
  // Document Requests actions — see DOCUMENT_ACTIONS below and the
  // logDocumentEvent() call sites in DocumentRequestsPage.jsx (approve/
  // decline) and MyRequestsPage.jsx (submit/claim/print/download).
  DOC_REQUEST_SUBMITTED: { color: 'blue', label: 'Request Submitted' },
  DOC_REQUEST_APPROVED: { color: 'green', label: 'Request Approved' },
  DOC_REQUEST_DECLINED: { color: 'red', label: 'Request Rejected' },
  DOC_REQUEST_CANCELLED: { color: 'orange', label: 'Request Cancelled' },
  DOC_REQUEST_CLAIMED: { color: 'green', label: 'Request Completed' },
  DOC_REQUEST_PRINTED: { color: 'purple', label: 'Document Printed' },
  DOC_REQUEST_DOWNLOADED_PNG: { color: 'orange', label: 'Document Downloaded (PNG)' },
  DOC_REQUEST_DOWNLOADED_DOCX: { color: 'orange', label: 'Document Downloaded (Word)' },
  // System Configuration actions — see SYSTEM_CONFIG_ACTIONS below.
  // UPDATE_PERMISSION is already defined above (also shown on User
  // Management Logs) and just gets included in this tab's action set
  // too, same dual-tab pattern as ACTIVATE_USER/DEACTIVATE_USER.
  SYSTEM_BACKUP_INITIATED: { color: 'purple', label: 'System Backup Generated' },
}

// Everything shown on the "User Management Logs" tab — account
// creation (both an admin manually adding someone via ADD_USER, and a
// patient self-registering via REGISTER), profile edits, deletion,
// enabling/disabling an account, and permission changes. ACTIVATE_USER/
// DEACTIVATE_USER deliberately also appear in AUTH_ACTIONS below — an
// account being enabled/disabled is both a user-management action and
// a security-relevant one, so it's not an either/or.
const USER_MGMT_ACTIONS = new Set([
  'ADD_USER',
  'REGISTER',
  'EDIT_USER',
  'EDIT_OWN_PROFILE',
  'DELETE_USER',
  'ACTIVATE_USER',
  'DEACTIVATE_USER',
  'UPDATE_PERMISSION',
])

// Everything shown on the "Authentication Logs" tab — account activation/
// deactivation is included here too (reusing the same ACTIVATE_USER/
// DEACTIVATE_USER codes MaintenancePage.jsx already writes, plus the
// auto-disable-after-lockout case LoginPage.jsx writes under the same
// code) since it's as much an authentication-security event as a login
// or password change is.
const AUTH_ACTIONS = new Set([
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGIN_DENIED',
  'LOGOUT',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
  'QR_CODE_DOWNLOADED',
  'PIN_UPDATED',
  'PIN_REMOVED',
  'EMAIL_VERIFIED',
  'ACTIVATE_USER',
  'DEACTIVATE_USER',
  'ACCESS_DENIED',
])

// Everything shown on the "Document Requests Logs" tab — the request
// lifecycle (submitted/approved/rejected/completed) plus what a patient
// does with the resulting document once it's Approved (printed,
// downloaded as PNG, downloaded as Word). Written via logDocumentEvent()
// from DocumentRequestsPage.jsx (approve/decline) and MyRequestsPage.jsx
// (submit/claim/print/download) — see those files' call sites.
const DOCUMENT_ACTIONS = new Set([
  'DOC_REQUEST_SUBMITTED',
  'DOC_REQUEST_APPROVED',
  'DOC_REQUEST_DECLINED',
  'DOC_REQUEST_CANCELLED',
  'DOC_REQUEST_CLAIMED',
  'DOC_REQUEST_PRINTED',
  'DOC_REQUEST_DOWNLOADED_PNG',
  'DOC_REQUEST_DOWNLOADED_DOCX',
])


// Everything shown on the "System Configuration Logs" tab — permission
// changes (UPDATE_PERMISSION, already written by MaintenancePage.jsx's
// handleTogglePerm for the Staff Permissions tab, and already shown on
// User Management Logs too — same "belongs on more than one tab"
// reasoning as ACTIVATE_USER/DEACTIVATE_USER above) plus system backups
// (SYSTEM_BACKUP_INITIATED, written by logConfigEvent() from
// MaintenancePage.jsx's handleGenerateBackup — see BackupTab.jsx).
// There's no dedicated "system settings" page in this app yet to log
// changes from, so this tab only covers what actually exists so far.
const SYSTEM_CONFIG_ACTIONS = new Set(['UPDATE_PERMISSION', 'SYSTEM_BACKUP_INITIATED'])

const TABS = [
  { key: 'system', label: 'System Activity Log' },
  { key: 'user-mgmt', label: 'User Management Logs' },
  { key: 'inventory', label: 'Inventory Logs' },
  { key: 'auth', label: 'Authentication Logs' },
  { key: 'documents', label: 'Document Requests Logs' },
  { key: 'system-config', label: 'System Configuration Logs' },
]

// Shown under the card header only on the User Management Logs tab —
// states plainly what this tab covers, since "system activity" and
// "user management" can otherwise look like overlapping catch-alls.
const USER_MGMT_DESCRIPTION =
  'The system records the creation/new registration, updating, deletion, and enabling/disabling of user accounts, as well as changes to user roles and permissions.'

const INVENTORY_DESCRIPTION = 'The system records all inventory actions.'

const DOCUMENT_REQUESTS_DESCRIPTION =
  'The system records when document requests are submitted, approved, rejected, or completed. It also records when documents are uploaded, downloaded, or printed.'

const SYSTEM_CONFIG_DESCRIPTION =
  'The system records changes made to system settings, user permissions, and system configurations. It also records when a system backup or data export is initiated.'

// Who-did-it filter, shown alongside the existing action filter. Uses the
// same three role values stored on users.role app-wide (see
// profileHelpers.js's ROLE_LABELS / userHelpers.js) — labeled here exactly
// as requested rather than reusing the longer "System Administrator" /
// "Clinic Personnel" wording ProfilePage.jsx uses for the role itself.
const ROLE_FILTER_OPTIONS = [
  { value: 'admin', label: 'Administrator' },
  { value: 'staff', label: 'Staff' },
  { value: 'patient', label: 'Patient' },
]

// inventory_logs (InventoryPage.jsx's addInventoryLog / medicineService's
// addMedicineMovement — same table) already comprehensively tracks every
// inventory action on its own, but in a different shape than audit_logs
// (action_type/staff_name/item_name/quantity_change instead of
// action/user_name/details). Rather than duplicating a second write into
// audit_logs for every single inventory handler (~20 call sites, all
// already correctly logging to inventory_logs), this normalizes each row
// into the same {action, user_name, details} shape the rest of this page
// already renders — so it drops straight into the existing table/filter/
// search UI instead of needing a separate one. `audit_log_id` is
// synthesized with an `inv-` prefix (inventory_log_id is its own
// sequence, unrelated to audit_logs') purely so React has a unique,
// collision-free key across both tables.
function normalizeInventoryLog(l) {
  const qty = l.quantity_change
  const qtyPart = qty != null && qty !== 0 ? `${qty > 0 ? '+' : ''}${qty}` : null
  const rangePart = l.previous_quantity != null && l.new_quantity != null ? `${l.previous_quantity} → ${l.new_quantity}` : null
  const details = [l.item_name, l.medicine_batch_number ? `Batch ${l.medicine_batch_number}` : null, qtyPart, rangePart, l.notes]
    .filter(Boolean)
    .join(' · ')
  return {
    audit_log_id: `inv-${l.inventory_log_id}`,
    created_at: l.created_at,
    user_name: l.staff_name,
    user_role: l.staff_role,
    action: `INVENTORY_${(l.action_type || '').toUpperCase().replace(/\s+/g, '_')}`,
    details: details || null,
  }
}

function actionLabel(action) {
  return ACTION_STYLES[action]?.label || action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function actionColor(action) {
  return ACTION_STYLES[action]?.color || 'gray'
}

export default function AuditTrailPage() {
  const { show } = useToast()
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState([])
  const [inventoryLogs, setInventoryLogs] = useState([])
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [tab, setTab] = useState('system')

  // Same sticky-header-while-scrolling treatment as Patients/Inventory —
  // see legacy.css's note above .inv-items-scroll for why this needs a
  // measured offset rather than plain position:sticky on thead th.
  //
  // This has to be a CALLBACK ref, not useRef+useEffect(,[]). This page
  // renders <Spinner/> and returns early while loading=true (see below),
  // so the header div doesn't exist in the DOM yet on first mount — a
  // plain useEffect(,[]) fires once, finds headerRef.current still null,
  // and (since its deps never change) never runs again even after
  // loading flips to false and the header actually mounts. headerHeight
  // was permanently stuck at 0, so thead th's `top` offset (below)
  // collapsed to 0 too — the column headers stayed sticky at the very
  // top of the scroll area, right where the filter bar (z-index 5) sits
  // on top of them, so they were hidden behind it for the entire scroll
  // instead of freezing visibly beneath it. A callback ref re-runs
  // exactly when the node itself attaches/detaches, independent of when
  // that happens relative to other state.
  const [headerEl, setHeaderEl] = useState(null)
  const headerRef = useCallback((node) => setHeaderEl(node), [])
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    if (!headerEl) return undefined
    const measure = () => setHeaderHeight(headerEl.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(headerEl)
    return () => ro.disconnect()
  }, [headerEl])

  async function refresh() {
    try {
      const data = await listAuditLogs()
      setLogs(data)
    } catch (err) {
      show(`Failed to load audit trail: ${err.message}`, 'error')
    }
  }

  async function refreshInventoryLogs() {
    try {
      const data = await listInventoryLogs()
      setInventoryLogs(data.map(normalizeInventoryLog))
    } catch (err) {
      show(`Failed to load inventory logs: ${err.message}`, 'error')
    }
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([listAuditLogs(), listInventoryLogs()])
      .then(([auditData, inventoryData]) => {
        if (cancelled) return
        setLogs(auditData)
        setInventoryLogs(inventoryData.map(normalizeInventoryLog))
      })
      .catch((err) => show(`Failed to load audit trail: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Every admin/staff action that writes to audit_logs shows up here the
  // moment it happens, for anyone else with this page open — same
  // pattern as every other live table in the app (Patients, Inventory,
  // Emergency Alerts).
  useRealtimeRefresh('audit_logs', refresh)
  // Same, for the Inventory Logs tab — any Replenish/Release/Edit/etc.
  // action anywhere in Inventory shows up here live too, not just after
  // a manual page reload.
  useRealtimeRefresh('inventory_logs', refreshInventoryLogs)

  // Scoped to the active tab, so switching tabs resets which actions the
  // "All Actions" dropdown even offers — picking "Failed Login" while on
  // System Activity Log, then switching to Authentication Logs, would
  // otherwise leave a filter selected that still matches the same rows
  // (harmless) but looks like it belongs to the wrong tab's action set.
  const tabLogs =
    tab === 'auth'
      ? logs.filter((l) => AUTH_ACTIONS.has(l.action))
      : tab === 'user-mgmt'
      ? logs.filter((l) => USER_MGMT_ACTIONS.has(l.action))
      : tab === 'inventory'
      ? inventoryLogs
      : tab === 'documents'
      ? logs.filter((l) => DOCUMENT_ACTIONS.has(l.action))
      : tab === 'system-config'
      ? logs.filter((l) => SYSTEM_CONFIG_ACTIONS.has(l.action))
      : logs

  const actionOptions = Object.keys(ACTION_STYLES).filter((a) => tabLogs.some((l) => l.action === a))
  // Covers any action code this page's static list hasn't been updated
  // for yet, so the filter dropdown never silently hides real log
  // entries just because ACTION_STYLES doesn't recognize them.
  const otherActions = [...new Set(tabLogs.map((l) => l.action))].filter((a) => !ACTION_STYLES[a])

  const q = search.toLowerCase()
  const filtered = tabLogs.filter((l) => {
    if (actionFilter !== 'all' && l.action !== actionFilter) return false
    if (roleFilter !== 'all' && l.user_role !== roleFilter) return false
    if (!q) return true
    return (
      (l.user_name || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q) ||
      (l.details || '').toLowerCase().includes(q)
    )
  })

  if (loading) return <Spinner label="Loading audit trail…" />

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Audit Trail</h2>
          <p>
            {tab === 'inventory' ? inventoryLogs.length : logs.length} recorded action
            {(tab === 'inventory' ? inventoryLogs.length : logs.length) === 1 ? '' : 's'} · most recent {tab === 'inventory' ? 300 : 500}
          </p>
        </div>
      </div>

      <Tabs
        tabs={TABS}
        active={tab}
        onChange={(key) => {
          setTab(key)
          setActionFilter('all')
        }}
      />

      <div className="card" style={{ '--patients-header-h': `${headerHeight}px` }}>
        <div ref={headerRef} className="card-header patients-sticky-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, width: '100%' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7, margin: 0 }}>
              <HistoryIcon width={15} height={15} />
              {tab === 'auth'
                ? 'Authentication Activity'
                : tab === 'user-mgmt'
                ? 'User Management Activity'
                : tab === 'inventory'
                ? 'Inventory Activity'
                 : tab === 'documents'
                ? 'Document Requests Activity'
                : tab === 'system-config'
                ? 'System Configuration Activity'
                : 'System Activity Log'}
            </h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="form-input" style={{ width: 170 }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="all">All Users</option>
                {ROLE_FILTER_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <select className="form-input" style={{ width: 190 }} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                <option value="all">All Actions</option>
                {actionOptions.map((a) => (
                  <option key={a} value={a}>
                    {actionLabel(a)}
                  </option>
                ))}
                {otherActions.map((a) => (
                  <option key={a} value={a}>
                    {actionLabel(a)}
                  </option>
                ))}
              </select>
              <SearchInput value={search} onChange={setSearch} placeholder="Search by user, action, or details…" width={260} />
            </div>
          </div>
          {tab === 'user-mgmt' && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>{USER_MGMT_DESCRIPTION}</p>
          )}
          {tab === 'inventory' && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>{INVENTORY_DESCRIPTION}</p>
          )}
          {tab === 'documents' && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>{DOCUMENT_REQUESTS_DESCRIPTION}</p>
          )}
          {tab === 'system-config' && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>{SYSTEM_CONFIG_DESCRIPTION}</p>
          )}
        </div>
        <div className="table-wrap patients-scroll">
          <table className="patients-table" style={{ tableLayout: 'fixed' }}>
            {/* Fixed widths, shared by every tab's render of this same table —
                without this, table-layout defaults to "auto" and the browser
                re-fits column widths to whatever content the CURRENT tab
                happens to have (e.g. Document Requests' longer Details text
                vs Authentication's short "signed in" strings), so switching
                tabs visibly shifted where each column started/ended. */}
            <colgroup>
              <col style={{ width: '15%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '54%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                    No {tab === 'auth' ? 'authentication log' : tab === 'user-mgmt' ? 'user management log' : tab === 'inventory' ? 'inventory log' : tab === 'documents' ? 'document request log' : tab === 'system-config' ? 'system configuration log' : 'audit trail'} entries found
                  </td>
                </tr>
              )}
              {filtered.map((l) => (
                <tr key={l.audit_log_id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatDateTime(l.created_at)}</td>
                  <td>
                    <strong>{l.user_name || 'Unknown user'}</strong>
                  </td>
                  <td>
                    <span className={`badge badge-no-dot badge-${actionColor(l.action)}`}>{actionLabel(l.action)}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{l.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}