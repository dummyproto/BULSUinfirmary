import { useEffect, useState } from 'react'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import { useConfirm } from '@context/ConfirmContext'
import Spinner from '@components/ui/Spinner'
import UserManagementTab from './UserManagementTab'
import PermissionsTab from './PermissionsTab'
import ActivePatientsTab from './ActivePatientsTab'
import AddUserModal from './AddUserModal'
import EditUserModal from './EditUserModal'
import ChangePasswordModal from './ChangePasswordModal'
import BulkImportModal from './BulkImportModal'
import { listUsers, createUserProfile, provisionUser, resendConfirmationEmail, resendVerificationEmailAsAdmin, listUnverifiedUserIds, updateUser, updateStaffProfile, updatePatientProfile, setActive, deleteUser, resetUserPassword, togglePermission } from '@services/usersService'
import { addAuditLog } from '@services/auditLogsService'
import { notify } from '@services/notificationsService'
import { PRINT_PERMISSIONS } from './data/formOptions'
import { generateSchoolIdCode, generateStaffId } from '@lib/schoolId'
import { PeopleIcon, ShieldIcon, GraduationCapIcon } from '@components/ui/icons'
import { useRealtimeRefresh } from '@hooks/useRealtimeRefresh'

// Temporarily hidden per request — flip to `true` to bring the "Active
// Students/Personnel" tab button back. Nothing about the underlying
// ActivePatientsTab was removed (its import, render block, and
// handleToggleActive are all untouched); with the button hidden, there's
// just no way to click into that tab, so re-enabling it is just this one
// flag.
const SHOW_ACTIVE_PATIENTS_TAB = false

const TABS = [
  { key: 'users', label: 'User Management', Icon: PeopleIcon },
  ...(SHOW_ACTIVE_PATIENTS_TAB ? [{ key: 'active-patients', label: 'Active Students/Personnel', Icon: GraduationCapIcon }] : []),
  { key: 'perms', label: 'Staff Permissions', Icon: ShieldIcon },
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
  const [bulkOpen, setBulkOpen] = useState(false)
  const [unverifiedIds, setUnverifiedIds] = useState([])
  const [resendingId, setResendingId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [pwUserId, setPwUserId] = useState(null)
  const [pwSaving, setPwSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([listUsers(), listUnverifiedUserIds()])
      .then(([userList, unverified]) => {
        if (cancelled) return
        setUsers(userList)
        setUnverifiedIds(unverified)
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
    const [userList, unverified] = await Promise.all([listUsers(), listUnverifiedUserIds()])
    setUsers(userList)
    setUnverifiedIds(unverified)
  }

  // Speed: the audit-log insert, the notification and the follow-up list
  // refresh used to be awaited one after another BEFORE the modal closed or the
  // toast appeared, so every click waited for 3-4 network round trips. None of
  // them decide whether the admin's action itself worked, so they now run in the
  // background (failures are still logged to the console).
  function logAction(entry) {
    addAuditLog(entry).catch((err) => console.error('[AUDIT_LOG_FAILED]', entry.action, err?.message || err))
  }
  function notifyQuietly(payload) {
    notify(payload).catch(() => {})
  }
  function refreshUsersInBackground() {
    refreshUsers().catch((err) => console.warn('[MAINTENANCE_REFRESH_FAILED]', err?.message || err))
  }

  // "Resend Verification" — always available on every row, verified or not,
  // and always sends a new email (see resendVerificationEmailAsAdmin()).
  async function handleResendVerification(userId) {
    const user = users.find((u) => u.user_id === userId)
    if (!user?.email) {
      show('This account has no email address on file.', 'error')
      return
    }
    setResendingId(userId)
    try {
      const result = await resendVerificationEmailAsAdmin(userId)
      addAuditLog({ userId: currentUserId, action: 'RESEND_VERIFICATION', details: `Resent ${result.alreadyVerified ? 'sign-in link' : 'verification email'} to ${user.name} (ID: ${userId})` }).catch(() => {})
      show(
        result.alreadyVerified
          ? `${user.name} is already verified — a new sign-in link was sent to ${user.email}.`
          : `A new verification email was sent to ${user.email}.`,
        'success'
      )
      // Keep the Unverified badges accurate after the send.
      setUnverifiedIds(await listUnverifiedUserIds())
    } catch (err) {
      show(`Couldn't send the email: ${err.message}`, 'error')
    } finally {
      setResendingId(null)
    }
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

    // Provision a real, login-capable account via the server-side Edge
    // Function (see supabase/functions/create-user/), using mode:
    // 'password' — the admin-entered password below becomes this user's
    // initial password (they can change it later in Account Settings).
    // The account is still created UNCONFIRMED — the Edge Function itself
    // triggers a verification email (via Resend + the send-verification-
    // email Auth Hook, now configured for this project), and the new user
    // can't log in until they click it, same as 'invite' would, just with
    // a known starting password instead of one they pick themselves.
    let authUserId = null
    let resendFailed = null
    try {
      const result = await provisionUser({ email: record.email, name: record.name, role: record.role, mode: 'password', temporaryPassword: record.password })
      authUserId = result.authUserId
      resendFailed = result.resendFailed
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
      logAction({ userId: currentUserId, action: 'ADD_USER', details: `Added user: ${record.name} (${record.role})` })
      refreshUsersInBackground()
      setAddOpen(false)
      show(
        authUserId
          ? resendFailed
            ? `User ${record.name} added, but the verification email couldn't be sent (${resendFailed}) — use "Resend Verification" once that's fixed.`
            : `User ${record.name} added — a verification email was sent to ${record.email}. They must confirm it before they can log in (their password is the one you just set).`
          : `User ${record.name} added (profile only — no login yet).`,
        authUserId && !resendFailed ? 'success' : 'warning'
      )
    } catch (err) {
      show(`Failed to add user: ${err.message}`, 'error')
    }
  }

  // Accounts from CSV import are created already verified (autoConfirm) and
  // get NO verification email — they can log in right away with the CSV
  // password. The delay/retry settings below only matter in the fallback case
  // where the deployed create-user function is an older version that ignores
  // autoConfirm and still sends a verification email: Resend allows only ~2
  // requests per second, so rows are spaced out and a failed email is retried.
  const BULK_EMAIL_ROW_DELAY_MS = 1200
  const BULK_RESEND_RETRY_DELAYS_MS = [3000, 6000]
  const BULK_INVITE_EMAIL_ROW_DELAY_MS = 600
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  async function handleBulkImportUsers(validRows, onProgress, options = {}) {
    const sendInviteEmail = options.sendInviteEmail === true
    let createdCount = 0
    let verifiedCount = 0
    let emailSentCount = 0
    let inviteEmailSentCount = 0
    const failedRows = []
    const emailFailedRows = []
    const inviteEmailFailedRows = []

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      const email = row.email.trim().toLowerCase()
      const fullName = row.fullName.trim()
      const username = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()
      const userId = row.userId.replace(/[\s-]/g, '').toUpperCase()

      let authUserId
      let resendFailed
      let autoConfirmed
      let inviteEmailSent
      let inviteEmailFailed
      try {
        // mode: 'password' + autoConfirm — each row's own Password column
        // becomes that patient's login password and the account is created
        // already verified, so no email is needed.
        // sendInviteEmail (optional checkbox in the import window) also emails
        // the user their email + password with a note to change it after login.
        const result = await provisionUser({ email, name: fullName, role: 'patient', mode: 'password', temporaryPassword: row.password, autoConfirm: true, sendInviteEmail })
        authUserId = result.authUserId
        resendFailed = result.resendFailed
        autoConfirmed = result.autoConfirmed
        inviteEmailSent = result.inviteEmailSent
        inviteEmailFailed = result.inviteEmailFailed
      } catch (err) {
        // No login was created, so don't create a profile-only record
        // either (it would show as "already registered" on a re-import
        // yet could never log in). Report the row instead.
        failedRows.push({ rowNumber: row.rowNumber, email, reason: `Login could not be created: ${err.message}` })
        onProgress(i + 1, validRows.length)
        continue
      }

      // Fallback only (older create-user deployed): a verification email was
      // attempted — retry with backoff if it failed.
      if (!autoConfirmed) {
        for (const wait of BULK_RESEND_RETRY_DELAYS_MS) {
          if (!resendFailed) break
          await sleep(wait)
          try {
            await resendConfirmationEmail(email)
            resendFailed = null
          } catch (err) {
            resendFailed = err.message
          }
        }
      }

      try {
        await createUserProfile({
          username,
          email,
          role: 'patient',
          name: fullName,
          studentNumber: userId,
          course: row.course || null,
          yearLevel: row.yearLevel || null,
          authUserId,
          schoolIdBarcode: null,
          registrationSource: 'csv_import',
          guardianName: row.guardianFullName || null,
          guardianRelation: row.relationship || null,
          guardianPhone: row.contactNumber || null,
        })
        createdCount++
        if (autoConfirmed) {
          verifiedCount++
          if (sendInviteEmail) {
            if (inviteEmailSent) inviteEmailSentCount++
            else inviteEmailFailedRows.push({ rowNumber: row.rowNumber, email, reason: inviteEmailFailed || 'Invitation email was not sent (redeploy the create-user function).' })
          }
        } else if (resendFailed) emailFailedRows.push({ rowNumber: row.rowNumber, email, reason: resendFailed })
        else emailSentCount++
      } catch (err) {
        failedRows.push({ rowNumber: row.rowNumber, email, reason: err.message })
      }

      onProgress(i + 1, validRows.length)
      if (!autoConfirmed && i < validRows.length - 1) await sleep(BULK_EMAIL_ROW_DELAY_MS)
      // Resend allows ~2 requests/second — space out the invitation emails too.
      else if (sendInviteEmail && i < validRows.length - 1) await sleep(BULK_INVITE_EMAIL_ROW_DELAY_MS)
    }

    logAction({
      userId: currentUserId,
      action: 'BULK_IMPORT_USERS',
      details: `CSV bulk patient import — ${validRows.length} valid record(s) submitted, ${createdCount} created (${verifiedCount} auto-verified), ${failedRows.length} failed.` +
        (sendInviteEmail ? ` Invitation emails: ${inviteEmailSentCount} sent, ${inviteEmailFailedRows.length} failed.` : ''),
    })
    refreshUsersInBackground()
    const needsAttention = failedRows.length > 0 || emailFailedRows.length > 0 || inviteEmailFailedRows.length > 0
    show(
      needsAttention
        ? `Bulk import finished — ${createdCount} of ${validRows.length} account(s) created` +
            (emailFailedRows.length ? `, ${emailFailedRows.length} still need a verification email` : '') +
            (inviteEmailFailedRows.length ? `, ${inviteEmailFailedRows.length} invitation email(s) failed` : '') +
            (failedRows.length ? `, ${failedRows.length} row(s) failed` : '') +
            '. See the import window for details.'
        : `Bulk import complete — ${createdCount} of ${validRows.length} patient account(s) created` +
            (verifiedCount ? ' and verified; they can log in now with their CSV password.' : ' (verification email sent to each).'),
      needsAttention ? 'warning' : 'success'
    )

    return { createdCount, verifiedCount, emailSentCount, inviteEmailSentCount, failedRows, emailFailedRows, inviteEmailFailedRows }
  }

  async function handleEditSave(updates) {
    const user = editingUser
    try {
      // Regenerated on every save, not just when requested — the QR
      // code is meant to change whenever an admin edits this user,
      // invalidating any previously printed/shared code for them.
      // The users row and the profile row are different tables, so both
      // updates run at the same time instead of one after the other.
      await Promise.all([
        updateUser(user.user_id, { name: updates.name, email: updates.email, phone: updates.phone, school_id_barcode: generateSchoolIdCode() }),
        user.role === 'patient'
          ? updatePatientProfile(user.user_id, { surname: updates.surname, given_name: updates.givenName, student_number: updates.student_number, course: updates.course, year_level: updates.year_level })
          : updateStaffProfile(user.user_id, { department: updates.department, position: updates.position }),
      ])
      logAction({ userId: currentUserId, action: 'EDIT_USER', details: `Updated user: ${updates.name} (ID: ${user.user_id})` })
      refreshUsersInBackground()
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
      // Flip the switch on screen right away; realtime reconciles with the DB.
      setUsers((prev) => prev.map((u) => (u.user_id === id ? { ...u, active: !current } : u)))
      show(`User ${!current ? 'activated' : 'deactivated'}`, !current ? 'success' : 'warning')
      logAction({ userId: currentUserId, action: !current ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', details: `${user.name} (ID: ${id})` })
      // Best-effort — most useful on reactivation (the user can act on it); a
      // deactivated user's own session may already be ending.
      notifyQuietly({
        targetUserId: id,
        message: !current ? 'Your account has been reactivated. You can now log in again.' : 'Your account has been deactivated by an administrator.',
        type: !current ? 'success' : 'warning',
        module: '/dashboard',
      })
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
      setUsers((prev) => prev.filter((u) => u.user_id !== id))
      show(`${user.name} deleted`, 'success')
      logAction({ userId: currentUserId, action: 'DELETE_USER', details: `Deleted user: ${user.name} (ID: ${id})` })
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
      show(`Password updated for ${user.name}`, 'success')
      setPwUserId(null)
      logAction({ userId: currentUserId, action: 'RESET_PASSWORD', details: `Reset password for user: ${user.name} (ID: ${user.user_id})` })
      // Best-effort — the password reset itself already succeeded.
      notifyQuietly({
        targetUserId: user.user_id,
        message: 'Your password was reset by an administrator. If this wasn\u2019t expected, contact the clinic immediately.',
        type: 'warning',
        module: '/profile',
      })
    } catch (err) {
      show(`Failed to update password: ${err.message}`, 'error')
    } finally {
      setPwSaving(false)
    }
  }

  async function handleTogglePerm(userId, key) {
    const user = users.find((u) => u.user_id === userId)
    const next = !user?.permissions?.[key]
    // Optimistic: the switch moves instantly instead of after 3-4 round trips.
    // If the save fails, the catch below reloads the real value.
    setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, permissions: { ...u.permissions, [key]: next } } : u)))
    try {
      await togglePermission(userId, key, next)
      logAction({ userId: currentUserId, action: 'UPDATE_PERMISSION', details: `${key} set to ${next} for ${user?.name} (ID: ${userId})` })
      show('Permission updated', 'success')
      // The affected staff member previously had no way to find out their
      // access changed except by noticing something suddenly works or
      // doesn't and having no idea why — the audit log records it, but
      // staff don't have a reason to go looking there proactively.
      const permLabel = PRINT_PERMISSIONS.find(([k]) => k === key)?.[1] || key
      notifyQuietly({
        targetUserId: userId,
        message: `Your permission for "${permLabel}" was ${next ? 'granted' : 'revoked'} by an administrator.`,
        type: next ? 'success' : 'warning',
        module: '/profile',
      })
    } catch (err) {
      refreshUsersInBackground() // put the switch back to what the database really has
      show(`Failed to update permission: ${err.message}`, 'error')
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
          onBulkImport={() => setBulkOpen(true)}
          onEdit={setEditId}
          onToggleActive={handleToggleActive}
          onDelete={handleDelete}
          onChangePassword={setPwUserId}
          unverifiedIds={unverifiedIds}
          onResendVerification={handleResendVerification}
          resendingId={resendingId}
        />
      )}
      {tab === 'active-patients' && <ActivePatientsTab users={users} onView={setEditId} onToggleActive={handleToggleActive} />}
      {tab === 'perms' && <PermissionsTab users={users} onTogglePerm={handleTogglePerm} />}

      <AddUserModal isOpen={addOpen} existingUsers={users} onClose={() => setAddOpen(false)} onSave={handleAddUser} onError={(msg) => show(msg, 'error')} />

      <BulkImportModal isOpen={bulkOpen} existingUsers={users} onClose={() => setBulkOpen(false)} onImport={handleBulkImportUsers} onError={(msg) => show(msg, 'error')} />

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