import { useEffect, useRef, useState } from 'react'
import { useToast } from '@context/ToastContext'
import { usePresence } from '@context/PresenceContext'
import Avatar from '@components/ui/Avatar'
import StatusBadge from '@components/ui/StatusBadge'
import SearchInput from '@components/ui/SearchInput'
import Spinner from '@components/ui/Spinner'
import { listUsers } from '@services/usersService'
import { isPersonnelNumber } from '@features/profile/lib/profileHelpers'
import { roleBadgeInfo } from '@features/maintenance/lib/userHelpers'
import PatientDetailModal from './PatientDetailModal'
import { GraduationCapIcon, EyeIcon, ChevronDownIcon } from '@components/ui/icons'

// Administrators first, then staff, then patients — requested ordering
// for this Directory table, independent of the alphabetical/online-first
// tiebreakers still applied within each group below.
const ROLE_SORT_ORDER = { admin: 0, staff: 1, patient: 2 }

// Admin-only successor to the old admin "Patients" tab (PatientsPage.jsx,
// which staff still use unchanged — this page is deliberately separate
// rather than a shared component, since staff's own view of patients
// stays scoped to patients only, per how it already worked). Same
// Directory-table shape, but:
//   - covers patient, staff, AND admin accounts, not patients only
//   - the Status column is what this page is actually for: it's live
//     Realtime Presence (PresenceContext.jsx — "does this person have
//     an open, connected session right now"), not
//     users.is_active (the separate, admin-controlled "is this account
//     allowed to sign in at all" flag, untouched here, same as the
//     Patients tab's own Status column already was)
export default function UserPresenceMonitoringPage() {
  const { show } = useToast()
  const { isUserOnline } = usePresence()
  const [loading, setLoading] = useState(true)
  const [people, setPeople] = useState([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all') // 'all' | 'patient' | 'staff' | 'admin'
  const [selected, setSelected] = useState(null)

  // Same freeze-header-and-column-labels-while-scrolling treatment as
  // the Patients tab, Inventory Items/Log, Health Records, and Reports.
  const headerRef = useRef(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return undefined
    const measure = () => setHeaderHeight(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    listUsers()
      .then((users) => {
        if (!cancelled) setPeople(users.filter((u) => u.role === 'patient' || u.role === 'staff' || u.role === 'admin'))
      })
      .catch((err) => show(`Failed to load users: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = search.toLowerCase()
  const filtered = people
    .filter((p) => roleFilter === 'all' || p.role === roleFilter)
    .filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.student_number || '').toLowerCase().includes(q) ||
        (p.course || '').toLowerCase().includes(q) ||
        (p.department || '').toLowerCase().includes(q) ||
        (p.position || '').toLowerCase().includes(q) ||
        (p.role === 'patient' && isPersonnelNumber(p.student_number) ? 'personnel' : '').includes(q) ||
        (p.role === 'patient' ? 'student' : p.role === 'admin' ? 'administrator admin' : 'staff').includes(q)
    )
    // Grouped by role first — administrators, then staff, then patients
    // — with online people surfacing to the top WITHIN each group as a
    // secondary tiebreaker (still the most useful ordering for spotting
    // who's active right now, just now scoped inside each role's own
    // block instead of mixing everyone together), and name as the final
    // tiebreaker.
    .sort((a, b) => {
      const roleDelta = ROLE_SORT_ORDER[a.role] - ROLE_SORT_ORDER[b.role]
      if (roleDelta !== 0) return roleDelta
      const onlineDelta = Number(isUserOnline(b.user_id)) - Number(isUserOnline(a.user_id))
      return onlineDelta !== 0 ? onlineDelta : a.name.localeCompare(b.name)
    })

  const onlineCount = people.filter((p) => isUserOnline(p.user_id)).length

  if (loading) return <Spinner label="Loading user presence…" />

  return (
    <>
      <div className="page-header">
        <div>
          <h2>User Presence Monitoring</h2>
          <p>
            {onlineCount} online now · {people.length} patient, staff, &amp; admin account(s) on file
          </p>
        </div>
      </div>

      <div className="card" style={{ '--patients-header-h': `${headerHeight}px` }}>
        <div ref={headerRef} className="card-header patients-sticky-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <GraduationCapIcon width={15} height={15} /> Directory
          </h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-input" style={{ width: 150 }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All Roles</option>
              <option value="patient">Patients</option>
              <option value="staff">Staff</option>
              <option value="admin">Administrators</option>
            </select>
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name, course, or department…" width={240} />
          </div>
        </div>
        <div className="table-wrap patients-scroll">
          <table className="patients-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>User ID</th>
                <th>Details</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                    No users found
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.user_id} className="patient-row" onClick={() => p.role === 'patient' && setSelected(p)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar user={p} size={26} />
                      <strong>{p.name}</strong>
                    </div>
                  </td>
                  <td>
                    <span className={`badge badge-no-dot badge-${roleBadgeInfo(p.role).color}`}>{roleBadgeInfo(p.role).label}</span>
                  </td>
                  <td>
                    <code style={{ fontSize: 11 }}>{p.role === 'patient' ? p.student_number || '—' : p.staff_id_number || '—'}</code>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {p.role === 'patient'
                      ? [p.course, p.year_level].filter(Boolean).join(' · ') || '—'
                      : p.role === 'admin'
                      ? [p.department, p.position].filter(Boolean).join(' · ') || 'System Administrator'
                      : [p.department, p.position].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td>
                    <StatusBadge status={isUserOnline(p.user_id) ? 'Active' : 'Inactive'} color={isUserOnline(p.user_id) ? 'green' : 'gray'} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {/* Only patients have a detail record to open here
                        (document requests, consultation history — see
                        PatientDetailModal.jsx). Staff account management
                        already lives on Maintenance -> User Management;
                        this page's job is presence, not re-implementing
                        that. */}
                    {p.role === 'patient' ? (
                      <div className="inv-action-group-icons patient-row-action" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-xs btn-outline inv-action-btn" onClick={() => setSelected(p)} title="View Record" aria-label="View Record">
                          <EyeIcon width={14} height={14} />
                          <span>View</span>
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
                    )}
                    {p.role === 'patient' && (
                      <button type="button" className="patient-row-chevron" aria-hidden="true" tabIndex={-1}>
                        <ChevronDownIcon width={14} height={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PatientDetailModal isOpen={!!selected} onClose={() => setSelected(null)} patient={selected} onError={(msg) => show(msg, 'error')} />
    </>
  )
}