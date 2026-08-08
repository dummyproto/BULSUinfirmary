import { useState } from 'react'
import Modal from '@components/ui/Modal'
import PasswordInput from '@components/ui/PasswordInput'
import { LockIcon } from '@components/ui/icons'

export default function ChangePasswordModal({ isOpen, user, onClose, onSave, saving }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  if (!isOpen || !user) return null

  function handleClose() {
    setPassword('')
    setConfirm('')
    setError('')
    onClose()
  }

  function handleSave() {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setError('')
    onSave(password)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Change Password — ${user.name}`}
      icon={<LockIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-blue" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save New Password'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-group full">
          <label>NEW PASSWORD</label>
          <PasswordInput
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError('')
            }}
            autoComplete="new-password"
          />
        </div>
        <div className="form-group full">
          <label>CONFIRM NEW PASSWORD</label>
          <PasswordInput
            placeholder="Re-enter the new password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
              if (error) setError('')
            }}
            autoComplete="new-password"
          />
        </div>
        {error && (
          <div className="form-group full" style={{ color: '#EF4444', fontSize: 12.5 }}>
            {error}
          </div>
        )}
        <div className="form-group full" style={{ color: 'var(--text-3)', fontSize: 12 }}>
          {user.name} will need to sign in again with this new password. This does not notify
          them automatically — let them know some other way (in person, email, etc).
        </div>
      </div>
    </Modal>
  )
}