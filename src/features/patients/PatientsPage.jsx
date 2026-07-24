import { useEffect, useState } from 'react'
import { useToast } from '@context/ToastContext'
import Avatar from '@components/ui/Avatar'
import StatusBadge from '@components/ui/StatusBadge'
import SearchInput from '@components/ui/SearchInput'
import Spinner from '@components/ui/Spinner'
import { listUsers } from '@services/usersService'
import PatientDetailModal from './PatientDetailModal'
import { GraduationCapIcon, EyeIcon } from '@components/ui/icons'

export default function PatientsPage() {
  const { show } = useToast()
  const [loading, setLoading] = useState(true)
  const [patients, setPatients] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

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

      <div className="card">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><GraduationCapIcon width={15} height={15} /> Patient Directory</h3>
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, user ID, or course…" width={240} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>User ID</th>
                <th>Course</th>
                <th>Year Level</th>
                <th>Status</th>
                <th>Actions</th>
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
                <tr key={p.user_id}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar user={p} size={26} />
                    <strong>{p.name}</strong>
                  </td>
                  <td>
                    <code style={{ fontSize: 11 }}>{p.student_number || '—'}</code>
                  </td>
                  <td style={{ fontSize: 12 }}>{p.course || '—'}</td>
                  <td style={{ fontSize: 12 }}>{p.year_level || '—'}</td>
                  <td>
                    <StatusBadge status={p.active ? 'Active' : 'Inactive'} color={p.active ? 'green' : 'gray'} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setSelected(p)}>
                      <EyeIcon width={13} height={13} /> View Record
                    </button>
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
