import { useEffect, useRef, useState } from 'react'
import { useToast } from '@context/ToastContext'
import Avatar from '@components/ui/Avatar'
import StatusBadge from '@components/ui/StatusBadge'
import SearchInput from '@components/ui/SearchInput'
import Spinner from '@components/ui/Spinner'
import { listUsers } from '@services/usersService'
import PatientDetailModal from './PatientDetailModal'
import { GraduationCapIcon, EyeIcon, ChevronDownIcon } from '@components/ui/icons'

export default function PatientsPage() {
  const { show } = useToast()
  const [loading, setLoading] = useState(true)
  const [patients, setPatients] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  // Same freeze-header-and-column-labels-while-scrolling treatment as
  // Inventory Items/Log, Health Records, and Reports — see legacy.css's
  // note above .inv-items-scroll for why this needs a scoped, measured
  // offset rather than plain position:sticky on thead th everywhere.
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
        if (!cancelled) setPatients(users.filter((u) => u.role === 'patient'))
      })
      .catch((err) => show(`Failed to load patients: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = search.toLowerCase()
  const filtered = search
    ? patients.filter((p) => p.name.toLowerCase().includes(q) || (p.student_number || '').toLowerCase().includes(q) || (p.course || '').toLowerCase().includes(q))
    : patients

  if (loading) return <Spinner label="Loading patients…" />

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Patients</h2>
          <p>{patients.length} patient account(s) on file</p>
        </div>
      </div>

      <div className="card" style={{ '--patients-header-h': `${headerHeight}px` }}>
        <div ref={headerRef} className="card-header patients-sticky-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><GraduationCapIcon width={15} height={15} /> Patient Directory</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name, user ID, or course…" width={240} />
          </div>
        </div>
        <div className="table-wrap patients-scroll">
          <table className="patients-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>User ID</th>
                <th>Course</th>
                <th>Year Level</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                    No patients found
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.user_id} className="patient-row" onClick={() => setSelected(p)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar user={p} size={26} />
                      <strong>{p.name}</strong>
                    </div>
                  </td>
                  <td>
                    <code style={{ fontSize: 11 }}>{p.student_number || '—'}</code>
                  </td>
                  <td style={{ fontSize: 12 }}>{p.course || '—'}</td>
                  <td style={{ fontSize: 12 }}>{p.year_level || '—'}</td>
                  <td>
                    <StatusBadge status={p.active ? 'Active' : 'Inactive'} color={p.active ? 'green' : 'gray'} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="inv-action-group-icons patient-row-action" style={{ justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-xs btn-outline inv-action-btn" onClick={() => setSelected(p)} title="View Record" aria-label="View Record">
                        <EyeIcon width={14} height={14} />
                        <span>View</span>
                      </button>
                    </div>
                    {/* Mobile-only tap affordance — the row itself is
                        clickable there (see onClick on <tr> above), so
                        the full icon+label button (built for an
                        explicit, standalone click target) reads as
                        oversized and leaves a large empty gap next to
                        the name. A plain chevron communicates "tap to
                        view" the way a native mobile list item does. */}
                    <ChevronDownIcon width={16} height={16} className="patient-row-chevron" aria-hidden="true" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PatientDetailModal key={selected?.user_id ?? 'closed'} isOpen={selected !== null} onClose={() => setSelected(null)} patient={selected} onError={(msg) => show(msg, 'error')} />
    </>
  )
}