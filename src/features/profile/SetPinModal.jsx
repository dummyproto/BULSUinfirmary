import { useState } from 'react'
import Modal from '@components/ui/Modal'
import PasswordInput from '@components/ui/PasswordInput'
import PinInput from '@components/ui/PinInput'
import { KeyIcon } from '@components/ui/icons'
import { useAuth } from '@context/AuthContext'
import { setOwnPin, clearOwnPin } from '@services/usersService'

export default function SetPinModal({ isOpen, onClose, onSuccess, onError, hasPin }) {
  const { verifyCurrentPassword } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleClose() {
    setCurrentPassword('')
    setNewPin('')
    setConfirmPin('')
    onClose()
  }

  async function handleSubmit() {
    if (!currentPassword) return onError("Enter your current password to confirm it's you.")
    if (!/^[0-9]{4}$/.test(newPin)) return onError('PIN must be exactly 4 digits.')
    if (newPin !== confirmPin) return onError('PINs do not match.')

    setSubmitting(true)
    try {
      // Requiring the real password once here — even though Account
      // Settings already requires being signed in — before letting
      // someone set up an alternative way into the account at all. See
      // verifyCurrentPassword's own comment in AuthContext.jsx.
      await verifyCurrentPassword(currentPassword)
      await setOwnPin(newPin)
      onSuccess(hasPin ? 'PIN updated' : 'Quick-login PIN set')
      handleClose()
    } catch (err) {
      onError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove() {
    if (!currentPassword) return onError("Enter your current password to confirm it's you.")
    setSubmitting(true)
    try {
      await verifyCurrentPassword(currentPassword)
      await clearOwnPin()
      onSuccess('Quick-login PIN removed')
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
      title={hasPin ? 'Change Quick-Login PIN' : 'Set Quick-Login PIN'}
      icon={<KeyIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={handleClose}>
            Cancel
          </button>
          {hasPin && (
            <button type="button" className="btn btn-red" onClick={handleRemove} disabled={submitting}>
              {submitting ? 'Removing…' : 'Remove PIN'}
            </button>
          )}
          <button type="button" className="btn btn-blue" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : hasPin ? 'Update PIN' : 'Set PIN'}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 0, marginBottom: 14 }}>
        After scanning your ID's QR code at login, this PIN signs you in directly instead of typing your full
        password every time. Your password itself stays exactly the same.
      </p>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>CURRENT PASSWORD</label>
        <PasswordInput placeholder="••••••••" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </div>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>NEW 4-DIGIT PIN</label>
        <PinInput id="new-pin" value={newPin} onChange={setNewPin} />
      </div>
      <div className="form-group" style={{ marginBottom: 4 }}>
        <label>CONFIRM PIN</label>
        <PinInput id="confirm-pin" value={confirmPin} onChange={setConfirmPin} />
      </div>
    </Modal>
  )
}