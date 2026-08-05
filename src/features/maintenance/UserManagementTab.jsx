import Avatar from '@components/ui/Avatar'
import SearchInput from '@components/ui/SearchInput'
import Toggle from '@components/ui/Toggle'
import { roleBadgeInfo } from './lib/userHelpers'
import { PeopleIcon, PlusIcon, LockIcon, EditIcon, TrashIcon } from '@components/ui/icons'

const ROLE_ORDER = { admin: 0, staff: 1, patient: 2 }

export default function UserManagementTab({ users, search, onSearchChange, onAddUser, onEdit, onToggleActive, onDelete }) {
  const q = search.toLowerCase()
  const filtered = search
    ? users.filter((u) => u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || u.role.toLowerCase().includes(q))
    : users

  // Admin -> Staff -> Patient, stable within each group (keeps whatever
  // relative order they already had, e.g. name or creation order, rather
  // than re-shuffling everyone every render).
  const sorted = [...filtered].sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99))

  return (
    <div className="card">
      <div className="card-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><PeopleIcon width={15} height={15} /> User Accounts</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <SearchInput value={search} onChange={onSearchChange} placeholder="Search users…" width={180} />
          <button type="button" className="btn btn-sm btn-blue" onClick={onAddUser}>
            <PlusIcon width={13} height={13} /> Add User
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>User ID</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                  No users found
                </td>
              </tr>
            )}
            {sorted.map((usr, idx) => {
              const badge = roleBadgeInfo(usr.role)
              // A new role group starts whenever this row's role differs from the
              // one right before it (or it's the very first row) — used below to
              // draw a divider line right above that row.
              const isNewGroup = idx === 0 || sorted[idx - 1].role !== usr.role
              // Applied per-<td> rather than on the <tr> itself — a border set
              // directly on a table row isn't guaranteed to participate in
              // border-collapse's per-column conflict resolution the same way
              // a cell's own border does, which is exactly what produced a
              // divider that only rendered under some columns and not others.
              const groupDividerStyle = isNewGroup && idx > 0 ? { borderTop: '2px solid var(--border-strong, var(--border))' } : undefined
              return (
                <tr key={usr.user_id}>
                  <td style={groupDividerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar user={usr} size={26} />
                      <strong>{usr.name}</strong>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, ...groupDividerStyle }}>{usr.email || '—'}</td>
                  <td style={groupDividerStyle}>
                    <span className={`badge badge-no-dot badge-${badge.color}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {badge.Icon && <badge.Icon width={11} height={11} />} {badge.label}
                    </span>
                  </td>
                  <td style={groupDividerStyle}>
                    <code style={{ fontSize: 11 }}>{usr.student_number || 'N/A'}</code>
                  </td>
                  <td style={groupDividerStyle}>
                    {usr.role === 'admin' ? (
                      <span className="badge badge-blue badge-no-dot" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><LockIcon width={10} height={10} /> Protected</span>
                    ) : (
                      <Toggle
                        checked={usr.active}
                        onChange={() => onToggleActive(usr.user_id, usr.active)}
                        label={usr.active ? `Deactivate ${usr.name}` : `Activate ${usr.name}`}
                        title={usr.active ? 'Deactivate' : 'Activate'}
                      />
                    )}
                  </td>
                  <td style={groupDividerStyle}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => onEdit(usr.user_id)}>
                        <EditIcon width={13} height={13} /> Edit
                      </button>
                      {usr.role !== 'admin' && (
                        <button type="button" className="btn btn-sm btn-red" onClick={() => onDelete(usr.user_id)} title="Delete user" aria-label="Delete user">
                          <TrashIcon width={13} height={13} />
                        </button>
                      )}
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