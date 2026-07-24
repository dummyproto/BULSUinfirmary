import Modal from '@components/ui/Modal'
import StatusBadge from '@components/ui/StatusBadge'
import { formatDate } from '@lib/format'
import { DOC_TYPES } from '@features/document-requests/NewRequestModal'
import { CalendarIcon, DocumentIcon } from '@components/ui/icons'

export default function ApptDetailModal({ isOpen, onClose, appt, docRequests, onViewDocRequests }) {
  if (!appt) return null

  const isDocAppt = DOC_TYPES.includes(appt.appt_type) && appt.patient_id
  const matched = isDocAppt
    ? docRequests
        .filter((d) => d.patient_id === appt.patient_id && d.doc_type === appt.appt_type)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
    : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Appointment Details"
      icon={<CalendarIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Close
          </button>
          {matched && (
            <button type="button" className="btn btn-green" onClick={onViewDocRequests}>
              <DocumentIcon width={13} height={13} /> View Doc Requests
            </button>
          )}
        </>
      }
    >
      <div className="detail-row">
        <span className="detail-label">Patient</span>
        <span className="detail-value">
          <strong>{appt.patient_name}</strong>
        </span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Type</span>
        <span className="detail-value">{appt.appt_type}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Date &amp; Time</span>
        <span className="detail-value">
          {formatDate(appt.appt_date)} at {appt.appt_time}
        </span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Status</span>
        <span className="detail-value">
          <StatusBadge status={appt.status} />
        </span>
      </div>
      {appt.notes && (
        <div className="detail-row">
          <span className="detail-label">Notes</span>
          <span className="detail-value">{appt.notes}</span>
        </div>
      )}

      {isDocAppt &&
        (matched ? (
          <div
            className="detail-row"
            style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 14px', margin: '4px 0', borderLeft: '3px solid var(--primary)' }}
          >
            <span className="detail-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><DocumentIcon width={11} height={11} /> Doc Request</span>
            <span className="detail-value" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>
                <strong>{matched.doc_type}</strong> — <StatusBadge status={matched.status} />
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Requested: {formatDate(matched.date_requested)} · Needed by: {formatDate(matched.date_needed)}
              </span>
              {matched.notes && <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{matched.notes}</span>}
            </span>
          </div>
        ) : (
          <div className="detail-row">
            <span className="detail-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><DocumentIcon width={11} height={11} /> Doc Request</span>
            <span className="detail-value" style={{ color: 'var(--text-3)', fontSize: 12 }}>
              No document request on file for this appointment type
            </span>
          </div>
        ))}
    </Modal>
  )
}
