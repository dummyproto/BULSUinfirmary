import Modal from '@components/ui/Modal'
import StatusBadge from '@components/ui/StatusBadge'
import { formatDate } from '@lib/format'
import { DocumentIcon, ClipboardIcon } from '@components/ui/icons'

// The legacy notes field packs an optional approval message onto the end of
// the staff notes as `...notes...[APPROVAL MESSAGE: ...]`. Split it back
// apart here so it can be displayed as its own highlighted block, same as
// the original viewDocDetail() did.
function splitNotes(notes) {
  if (!notes) return { staffNotes: '', approvalMsg: '' }
  const [before, after] = notes.split('[APPROVAL MESSAGE:')
  return {
    staffNotes: before.trim(),
    approvalMsg: after ? after.replace(/\]$/, '').trim() : '',
  }
}

export default function DocDetailModal({ isOpen, onClose, request, processedByName }) {
  if (!request) return null
  const { staffNotes, approvalMsg } = splitNotes(request.notes)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Document Request Details"
      icon={<DocumentIcon width={16} height={16} />}
      actions={
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="detail-row">
        <span className="detail-label">Patient Name</span>
        <span className="detail-value">
          <strong>{request.patient_name}</strong>
        </span>
      </div>
      <div className="detail-row">
        <span className="detail-label">User ID</span>
        <span className="detail-value">
          <code style={{ fontSize: 12, background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>
            {request.student_number}
          </code>
        </span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Document Type</span>
        <span className="detail-value">{request.doc_type}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Purpose</span>
        <span className="detail-value">{request.purpose || '—'}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Date Requested</span>
        <span className="detail-value">{formatDate(request.date_requested)}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Date Needed</span>
        <span className="detail-value">{formatDate(request.date_needed)}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Status</span>
        <span className="detail-value">
          <StatusBadge status={request.status} />
        </span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Processed By</span>
        <span className="detail-value">{processedByName || 'Not yet processed'}</span>
      </div>
      {staffNotes && (
        <div className="detail-row">
          <span className="detail-label">Staff Notes</span>
          <span className="detail-value">{staffNotes}</span>
        </div>
      )}
      {approvalMsg && (
        <div
          className="detail-row"
          style={{ background: 'var(--surface2)', padding: 10, borderRadius: 4, borderLeft: '3px solid var(--border-teal)' }}
        >
          <span className="detail-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <ClipboardIcon width={12} height={12} /> Approval Message
          </span>
          <span className="detail-value" style={{ display: 'block', marginTop: 6, fontStyle: 'italic', color: 'var(--text-2)' }}>
            {approvalMsg}
          </span>
        </div>
      )}
    </Modal>
  )
}
