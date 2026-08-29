import { useEffect, useState } from 'react'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import { useConfirm } from '@context/ConfirmContext'
import Spinner from '@components/ui/Spinner'
import UserManagementTab from './UserManagementTab'
import PermissionsTab from './PermissionsTab'
import BackupTab from './BackupTab'
import { generateSystemBackup } from './lib/systemBackup'
import AddUserModal from './AddUserModal'
import EditUserModal from './EditUserModal'
import ChangePasswordModal from './ChangePasswordModal'
import { listUsers, createUserProfile, provisionUser, updateUser, updateStaffProfile, updatePatientProfile, setActive, deleteUser, resetUserPassword, togglePermission } from '@services/usersService'
import { addAuditLog, logConfigEvent } from '@services/auditLogsService'
import { notify } from '@services/notificationsService'
import { PRINT_PERMISSIONS } from './data/formOptions'
import { generateSchoolIdCode, generateStaffId } from '@lib/schoolId'
import { PeopleIcon, ShieldIcon, SaveIcon } from '@components/ui/icons'
import { useRealtimeRefresh } from '@hooks/useRealtimeRefresh'

const TABS = [
  { key: 'users', label: 'User Management', Icon: PeopleIcon },
  { key: 'perms', label: 'Staff Permissions', Icon: ShieldIcon },
  { key: 'backup', label: 'Backup & Export', Icon: SaveIcon },
]

export default function MaintenancePage() {
  const { profile } = useAuth()
  const { show } = useToast()
  const confirm = useConfirm()
  const currentUserId = profile?.user_id ?? null

  const [tab, setTab] = useState('users')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [pwUserId, setPwUserId] = useState(null)
  const [pwSaving, setPwSaving] = useState(false)
  const [backupGenerating, setBackupGenerating] = useState(false)

  useEffect(() => {
    let cancelled = false
    listUsers()
      .then((userList) => {
        if (cancelled) return
        setUsers(userList)
      })
      .catch((err) => show(`Failed to load maintenance data: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshUsers() {
    setUsers(await listUsers())
  }

  // listUsers() joins users + staff_profiles + staff_permissions +
  // patient_profiles (see SELECT_WITH_PROFILES in usersService.js) —
  // a change to ANY of those four tables, by ANY admin, on ANY device,
  // should be reflected here without needing a manual reload. Toggling
  // a permission switch in the Staff Permissions tab, for instance, used
  // to only update the admin who clicked it; a second admin already on
  // this page wouldn't see it until they refreshed.
  useRealtimeRefresh(['users', 'staff_profiles', 'staff_permissions', 'patient_profiles'], refreshUsers)

  const editingUser = users.find((u) => u.user_id === editId) || null
  const pwUser = users.find((u) => u.user_id === pwUserId) || null
  const tabItems = TABS.map((t) => (t.key === 'users' ? { ...t, label: `${t.label} (${users.length})` } : t))

  async function handleAddUser(record) {
    const username = record.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()

    // Try to provision a real, login-capable account via the server-side
    // Edge Function first (see supabase/functions/create-user/). Using
    // mode: 'password' — not the default 'invite' — because AddUserModal
    // already collects a required password field from the admin; 'invite'
    // silently discarded that password entirely and relied on the new
    // user receiving a set-password email instead, which on a project
    // without email sending configured (very possible for a school
    // system) never arrives — leaving the account permanently unable to
    // log in with no error surfaced anywhere. Passing the admin-entered
    // password through here means the account works immediately, matching
    // what the form actually asks for.
    let authUserId = null
    try {
      authUserId = await provisionUser({ email: record.email, name: record.name, role: record.role, mode: 'password', temporaryPassword: record.password })
    } catch (err) {
      show(`Couldn't provision a login (${err.message}) — creating the account record only. Deploy the "create-user" Edge Function to enable real logins.`, 'warning')
    }

    try {
      await createUserProfile({
        username,
        email: record.email,
        role: record.role,
        name: record.name,
        surname: record.surname,
        givenName: record.givenName,
        phone: record.phone,
        department: record.department,
        position: record.position,
        studentNumber: record.student_number,
        course: record.course,
        yearLevel: record.year_level,
        authUserId,
        schoolIdBarcode: generateSchoolIdCode(),
        staffIdNumber: record.role !== 'patient' ? generateStaffId() : null,
      })
      await addAuditLog({ userId: currentUserId, action: 'ADD_USER', details: `Added user: ${record.name} (${record.role})` })
      await refreshUsers()
      setAddOpen(false)
      show(
        authUserId
          ? `User ${record.name} added — they can log in now with the password you set.`
          : `User ${record.name} added (profile only — no login yet).`,
        'success'
      )
    } catch (err) {
      show(`Failed to add user: ${err.message}`, 'error')
    }
  }

  async function handleEditSave(updates) {
    const user = editingUser
    try {
      // Regenerated on every save, not just when requested — the QR
      // code is meant to change whenever an admin edits this user,
      // invalidating any previously printed/shared code for them.
      await updateUser(user.user_id, { name: updates.name, email: updates.email, phone: updates.phone, school_id_barcode: generateSchoolIdCode() })
      if (user.role === 'patient') {
        await updatePatientProfile(user.user_id, { surname: updates.surname, given_name: updates.givenName, student_number: updates.student_number, course: updates.course, year_level: updates.year_level })
      } else {
        await updateStaffProfile(user.user_id, { department: updates.department, position: updates.position })
      }
      await addAuditLog({ userId: currentUserId, action: 'EDIT_USER', details: `Updated user: ${updates.name} (ID: ${user.user_id})` })
      await refreshUsers()
      setEditId(null)
      show('User updated successfully', 'success')
    } catch (err) {
      show(`Failed to update user: ${err.message}`, 'error')
    }
  }

  async function handleToggleActive(id, current) {
    const user = users.find((u) => u.user_id === id)
    if (user.role === 'admin') return show('System Administrator account cannot be deactivated', 'error')
    try {
      await setActive(id, !current)
      await addAuditLog({ userId: currentUserId, action: !current ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', details: `${user.name} (ID: ${id})` })
      await refreshUsers()
      show(`User ${!current ? 'activated' : 'deactivated'}`, !current ? 'success' : 'warning')
      try {
        await notify({
          targetUserId: id,
          message: !current ? 'Your account has been reactivated. You can now log in again.' : 'Your account has been deactivated by an administrator.',
          type: !current ? 'success' : 'warning',
          module: '/dashboard',
        })
      } catch {
        // Non-critical — most useful on reactivation (the user can act on
        // it); a deactivated user's own session may already be ending, so
        // this is best-effort either way, not the reason the status
        // change itself would fail.
      }
    } catch (err) {
      show(`Failed to update user status: ${err.message}`, 'error')
    }
  }

  async function handleDelete(id) {
    const user = users.find((u) => u.user_id === id)
    if (!user) return
    if (user.role === 'admin') return show('Cannot delete the System Administrator account', 'error')
    if (!(await confirm(`Delete user "${user.name}"?\nThis action cannot be undone.`))) return
    try {
      await deleteUser(id)
      await addAuditLog({ userId: currentUserId, action: 'DELETE_USER', details: `Deleted user: ${user.name} (ID: ${id})` })
      await refreshUsers()
      show(`${user.name} deleted`, 'success')
    } catch (err) {
      show(`Failed to delete user: ${err.message}`, 'error')
    }
  }

  async function handleChangePassword(newPassword) {
    const user = pwUser
    if (!user) return
    setPwSaving(true)
    try {
      await resetUserPassword(user.user_id, newPassword)
      await addAuditLog({ userId: currentUserId, action: 'RESET_PASSWORD', details: `Reset password for user: ${user.name} (ID: ${user.user_id})` })
      show(`Password updated for ${user.name}`, 'success')
      setPwUserId(null)
      try {
        await notify({
          targetUserId: user.user_id,
          message: 'Your password was reset by an administrator. If this wasn\u2019t expected, contact the clinic immediately.',
          type: 'warning',
          module: '/profile',
        })
      } catch {
        // Non-critical — the password reset itself already succeeded.
      }
    } catch (err) {
      show(`Failed to update password: ${err.message}`, 'error')
    } finally {
      setPwSaving(false)
    }
  }

  async function handleTogglePerm(userId, key) {
    const user = users.find((u) => u.user_id === userId)
    const next = !user?.permissions?.[key]
    try {
      await togglePermission(userId, key, next)
      await addAuditLog({ userId: currentUserId, action: 'UPDATE_PERMISSION', details: `${key} set to ${next} for ${user?.name} (ID: ${userId})` })
      await refreshUsers()
      show('Permission updated', 'success')
      // The affected staff member previously had no way to find out their
      // access changed except by noticing something suddenly works or
      // doesn't and having no idea why — the audit log records it, but
      // staff don't have a reason to go looking there proactively.
      const permLabel = PRINT_PERMISSIONS.find(([k]) => k === key)?.[1] || key
      try {
        await notify({
          targetUserId: userId,
          message: `Your permission for "${permLabel}" was ${next ? 'granted' : 'revoked'} by an administrator.`,
          type: next ? 'success' : 'warning',
          module: '/profile',
        })
      } catch {
        // Non-critical — the permission change itself already succeeded.
      }
    } catch (err) {
      show(`Failed to update permission: ${err.message}`, 'error')
    }
  }

  async function handleGenerateBackup() {
    setBackupGenerating(true)
    try {
      const { counts, filename } = await generateSystemBackup({ generatedByName: profile?.name })
      const summary = Object.entries(counts)
        .map(([key, n]) => `${key}: ${n}`)
        .join(', ')
      logConfigEvent({
        userId: currentUserId,
        action: 'SYSTEM_BACKUP_INITIATED',
        details: `${profile?.name || 'Admin'} generated a system backup (${filename}) — ${summary}`,
      })
      show('System backup downloaded', 'success')
      return { counts, filename }
    } catch (err) {
      show(`Failed to generate backup: ${err.message}`, 'error')
      return null
    } finally {
      setBackupGenerating(false)
    }
  }

  if (loading) return <Spinner label="Loading users…" />

  return (
    <>
      <div className="tab-row" style={{ marginBottom: 14 }}>
        {tabItems.map((t) => (
          <button key={t.key} type="button" className={`tab-btn${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <t.Icon width={14} height={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <UserManagementTab
          users={users}
          search={search}
          onSearchChange={setSearch}
          onAddUser={() => setAddOpen(true)}
          onEdit={setEditId}
          onToggleActive={handleToggleActive}
          onDelete={handleDelete}
          onChangePassword={setPwUserId}
        />
      )}
      {tab === 'perms' && <PermissionsTab users={users} onTogglePerm={handleTogglePerm} />}
      {tab === 'backup' && <BackupTab onGenerateBackup={handleGenerateBackup} generating={backupGenerating} />}

      <AddUserModal isOpen={addOpen} existingUsers={users} onClose={() => setAddOpen(false)} onSave={handleAddUser} onError={(msg) => show(msg, 'error')} />

      <EditUserModal key={editId ?? 'edit-user-closed'} isOpen={editId !== null} user={editingUser} onClose={() => setEditId(null)} onSave={handleEditSave} />

      <ChangePasswordModal
        key={pwUserId ?? 'change-password-closed'}
        isOpen={pwUserId !== null}
        user={pwUser}
        saving={pwSaving}
        onClose={() => setPwUserId(null)}
        onSave={handleChangePassword}
      />
    </>
  )
}