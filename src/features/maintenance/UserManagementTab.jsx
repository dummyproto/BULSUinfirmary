import { useState } from 'react'
import Avatar from '@components/ui/Avatar'
import SearchInput from '@components/ui/SearchInput'
import Toggle from '@components/ui/Toggle'
import { roleBadgeInfo } from './lib/userHelpers'
import { PeopleIcon, PlusIcon, LockIcon, EditIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon } from '@components/ui/icons'
import { defaultShowMore } from '@lib/viewport'

const ROLE_ORDER = { admin: 0, staff: 1, patient: 2 }

export default function UserManagementTab({ users, search, onSearchChange, onAddUser, onEdit, onToggleActive, onDelete, onChangePassword }) {
  const [showMore, setShowMore] = useState(defaultShowMore)
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={onSearchChange} placeholder="Search users…" width={180} />
          <button
            type="button"
            className="btn btn-sm btn-outline inv-view-more-btn"
            onClick={() => setShowMore((v) => !v)}
            title="Show or hide Email, Role, User ID, and Status columns"
            aria-label={showMore ? 'View Less — hide Email, Role, User ID, and Status columns' : 'View More — show Email, Role, User ID, and Status columns'}
          >
            {showMore ? <ChevronUpIcon width={13} height={13} /> : <ChevronDownIcon width={13} height={13} />}
            <span>{showMore ? 'View Less' : 'View More'}</span>
          </button>
          <button type="button" className="btn btn-xs btn-blue" onClick={onAddUser} title="Add User">
            <PlusIcon width={13} height={13} /> Add User
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className={showMore ? undefined : 'compact-table'}>
          <thead>
            <tr>
              <th>Name</th>
              {showMore && (
                <>
                  <th>Email</th>
                  <th>Role</th>
                  <th>User ID</th>
                  <th>Status</th>
                </>
              )}
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={showMore ? 5 : 2} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
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
                  {showMore && (
                    <>
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
                    </>
                  )}
                  <td style={{ textAlign: 'right', ...groupDividerStyle }}>
                    <div className="inv-action-group-icons" style={{ justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-xs btn-outline inv-action-btn" onClick={() => onEdit(usr.user_id)} title="Edit" aria-label="Edit">
                        <EditIcon width={14} height={14} />
                        <span>Edit</span>
                      </button>
                      <button type="button" className="btn btn-xs btn-outline inv-action-btn" onClick={() => onChangePassword(usr.user_id)} title={`Change password for ${usr.name}`} aria-label={`Change password for ${usr.name}`}>
                        <LockIcon width={14} height={14} />
                        <span>Password</span>
                      </button>
                      {usr.role !== 'admin' && (
                        <button type="button" className="btn btn-xs btn-red inv-action-btn" onClick={() => onDelete(usr.user_id)} title="Delete user" aria-label="Delete user">
                          <TrashIcon width={14} height={14} />
                          <span>Delete</span>
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