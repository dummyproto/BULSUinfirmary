import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { CheckCircleIcon, SettingsIcon, XCircleIcon, AlertTriangleIcon, ClipboardIcon } from '@components/ui/icons'

// The legacy code had three separate modals (modal-approve-doc,
// modal-processing-doc, modal-declined-doc) that were identical except for
// title/copy/button color/required-field label. Config-driven single
// component instead — one place to fix if the shape ever changes.
export const DOC_ACTIONS = {
  approve: {
    title: 'Approve Document Request',
    Icon: CheckCircleIcon,
    infoLabel: 'Claiming Details:',
    infoIcon: ClipboardIcon,
    infoText:
      '"You can now claim your requested document. Please be advised that validity of claiming is 3 days only."',
    fieldLabel: 'Approval Notes',
    placeholder:
      'Enter notes for patient (e.g., Documents are ready at clinic window, bring valid ID)',
    submitLabel: 'Approve & Send Notification',
    SubmitIcon: CheckCircleIcon,
    submitVariant: 'success',
    requiredWarning: 'Please enter approval notes',
  },
  process: {
    title: 'Mark Document as Processing',
    Icon: SettingsIcon,
    infoLabel: 'Processing Status:',
    infoIcon: ClipboardIcon,
    infoText: 'Document is being processed. Patient will be notified.',
    fieldLabel: 'Processing Notes',
    placeholder: 'Enter processing notes (e.g., Document is under review, expected completion date)',
    submitLabel: 'Mark as Processing & Send Notification',
    SubmitIcon: SettingsIcon,
    submitVariant: 'primary',
    requiredWarning: 'Please enter processing notes',
  },
  decline: {
    title: 'Decline Document Request',
    Icon: XCircleIcon,
    infoLabel: 'Decline Reason:',
    infoIcon: AlertTriangleIcon,
    infoText: 'Patient will be notified with the decline reason.',
    fieldLabel: 'Decline Reason',
    placeholder: 'Enter reason for decline (e.g., Incomplete requirements, Invalid document type, etc.)',
    submitLabel: 'Decline & Send Notification',
    SubmitIcon: XCircleIcon,
    submitVariant: 'danger',
    requiredWarning: 'Please enter decline reason',
  },
}

export default function DocActionModal({ isOpen, action, onClose, onSubmit, onValidationError }) {
  const [notes, setNotes] = useState('')
  const config = action ? DOC_ACTIONS[action] : null

  if (!config) return null

  const handleSubmit = () => {
    const trimmed = notes.trim()
    if (!trimmed) {
      onValidationError?.(config.requiredWarning)
      return
    }
    onSubmit(trimmed)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={config.title}
      icon={<config.Icon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-${config.submitVariant === 'success' ? 'green' : config.submitVariant === 'danger' ? 'red' : 'blue'}`}
            onClick={handleSubmit}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <config.SubmitIcon width={14} height={14} />
            {config.submitLabel}
          </button>
        </>
      }
    >
      <div
        style={{
          padding: 16,
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 13,
          color: 'var(--text-2)',
        }}
      >
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <config.infoIcon width={13} height={13} />
          {config.infoLabel}
        </strong>
        <br />
        <span style={{ color: 'var(--text-3)', display: 'block', marginTop: 6 }}>{config.infoText}</span>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-1)' }}>
          {config.fieldLabel} <span style={{ color: 'var(--text-error)' }}>*</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={config.placeholder}
          style={{
            width: '100%',
            height: 100,
            padding: 10,
            border: '1px solid var(--border)',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'inherit',
            resize: 'none',
          }}
        />
      </div>
    </Modal>
  )
}
