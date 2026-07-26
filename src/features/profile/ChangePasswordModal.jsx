import { useState } from 'react'
import Modal from '@components/ui/Modal'
import PasswordInput from '@components/ui/PasswordInput'
import { KeyIcon } from '@components/ui/icons'
import { useAuth } from '@context/AuthContext'
import { validatePassword } from '@features/maintenance/lib/userHelpers'

export default function ChangePasswordModal({ isOpen, onClose, onSuccess, onError }) {
  const { changePassword } = useAuth()
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const newValid = nw ? validatePassword(nw).ok : null
  const confirmValid = confirm ? confirm === nw && newValid : null

  function handleClose() {
    setCur('')
    setNw('')
    setConfirm('')
    onClose()
  }

  async function handleSubmit() {
    if (!cur || !nw || !confirm) return onError('All password fields are required')
    const pwCheck = validatePassword(nw)
    if (!pwCheck.ok) return onError(pwCheck.msg)
    if (nw === cur) return onError('New password must be different from the current password')
    if (nw !== confirm) return onError('Passwords do not match')

    setSubmitting(true)
    try {
      // changePassword() re-authenticates with `cur` first (Supabase Auth
      // has no separate "just verify this password" endpoint) — so if
      // the current password is wrong, this throws "Current password is
      // incorrect" before anything is actually changed.
      await changePassword(cur, nw)
      onSuccess()
      handleClose()
    } catch (err) {
      onError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Change Password"
      icon={<KeyIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={handleClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-blue" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Updating…' : 'Update Password'}
          </button>
        </>
      }
    >
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>CURRENT PASSWORD</label>
        <PasswordInput placeholder="••••••••" value={cur} onChange={(e) => setCur(e.target.value)} />
      </div>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>NEW PASSWORD</label>
        <PasswordInput
          placeholder="••••••••"
          value={nw}
          onChange={(e) => setNw(e.target.value)}
          style={newValid === null ? undefined : { borderColor: newValid ? '#22C55E' : '#EF4444' }}
        />
      </div>
      <div className="form-group" style={{ marginBottom: 4 }}>
        <label>CONFIRM NEW PASSWORD</label>
        <PasswordInput
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={confirmValid === null ? undefined : { borderColor: confirmValid ? '#22C55E' : '#EF4444' }}
        />
      </div>
    </Modal>
  )
}