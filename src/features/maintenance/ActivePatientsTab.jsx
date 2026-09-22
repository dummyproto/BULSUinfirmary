import { useState } from 'react'
import Avatar from '@components/ui/Avatar'
import SearchInput from '@components/ui/SearchInput'
import { isPersonnelNumber } from '@features/profile/lib/profileHelpers'
import { GraduationCapIcon, EyeIcon, BriefcaseIcon } from '@components/ui/icons'

export default function ActivePatientsTab({ users, onView, onToggleActive }) {
  const [search, setSearch] = useState('')

  // Only patients (students/personnel) belong on this tab, and only the
  // active ones — inactive patients still show up in User Management,
  // this tab is specifically "who's currently active".
  const patients = users.filter((u) => u.role === 'patient' && u.active)

  const q = search.toLowerCase()
  const filtered = q
    ? patients.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.student_number || '').toLowerCase().includes(q) ||
          (u.course || '').toLowerCase().includes(q)
      )
    : patients

  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="card">
      <div className="card-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <GraduationCapIcon width={15} height={15} /> Active Students/Personnel
        </h3>
        <SearchInput value={search} onChange={setSearch} placeholder="Search students/personnel…" width={200} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>User ID</th>
              <th>Course</th>
              <th>Year Level</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                  No active students/personnel found
                </td>
              </tr>
            )}
            {sorted.map((usr) => {
              const personnel = isPersonnelNumber(usr.student_number)
              return (
                <tr key={usr.user_id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar user={usr} size={26} />
                      <strong>{usr.name}</strong>
                    </div>
                  </td>
                  <td>
                    <span className={`badge badge-no-dot badge-${personnel ? 'blue' : 'green'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {personnel ? <BriefcaseIcon width={11} height={11} /> : <GraduationCapIcon width={11} height={11} />}
                      {personnel ? 'Personnel' : 'Student'}
                    </span>
                  </td>
                  <td>
                    <code style={{ fontSize: 11 }}>{usr.student_number || '—'}</code>
                  </td>
                  <td style={{ fontSize: 12 }}>{usr.course || '—'}</td>
                  <td style={{ fontSize: 12 }}>{usr.year_level || '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="inv-action-group-icons" style={{ justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-xs btn-outline inv-action-btn" onClick={() => onView(usr.user_id)} title="View" aria-label="View">
                        <EyeIcon width={14} height={14} />
                        <span>View</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-outline inv-action-btn"
                        onClick={() => onToggleActive(usr.user_id, usr.active)}
                        title="Deactivate"
                        aria-label={`Deactivate ${usr.name}`}
                      >
                        <span>Deactivate</span>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}