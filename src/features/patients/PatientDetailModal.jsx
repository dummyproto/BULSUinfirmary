import { useEffect, useState } from 'react'
import Modal from '@components/ui/Modal'
import Avatar from '@components/ui/Avatar'
import StatusBadge from '@components/ui/StatusBadge'
import { formatDate } from '@lib/format'
import { listDocumentRequests } from '@services/documentRequestsService'
import { listConsultations } from '@services/consultationsService'
import { GraduationCapIcon, DocumentIcon, ConsultationIcon } from '@components/ui/icons'

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value || '—'}</span>
    </div>
  )
}

export default function PatientDetailModal({ isOpen, onClose, patient, onError }) {
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState([])
  const [consultations, setConsultations] = useState([])

  useEffect(() => {
    if (!isOpen || !patient) return
    let cancelled = false
    Promise.all([listDocumentRequests({ patientId: patient.user_id }), listConsultations({ patientId: patient.user_id })])
      .then(([d, c]) => {
        if (cancelled) return
        setDocs(d)
        setConsultations(c)
      })
      .catch((err) => onError?.(err.message))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, patient?.user_id])

  if (!isOpen || !patient) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Patient Record"
      icon={<GraduationCapIcon width={16} height={16} />}
      actions={
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Close
        </button>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Avatar user={patient} size={48} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{patient.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {patient.student_number} · {patient.course || 'No course on file'} {patient.year_level ? `· ${patient.year_level}` : ''}
          </div>
        </div>
      </div>

      <div className="detail-row">
        <span className="detail-label">Email</span>
        <span className="detail-value">{patient.email}</span>
      </div>
      <DetailRow label="Phone" value={patient.phone} />
      <DetailRow label="Status" value={patient.active ? 'Active' : 'Inactive'} />
      <DetailRow label="Guardian Contact" value={patient.parent_name ? `${patient.parent_name} (${patient.parent_relation || '—'}) · ${patient.parent_phone || '—'}` : null} />

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>Loading history…</div>
      ) : (
        <>
          <div className="cons-section-label" style={{ marginTop: 18 }}>
            <DocumentIcon width={13} height={13} style={{ verticalAlign: -2, marginRight: 5 }} />Document Requests ({docs.length})
          </div>
          {docs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0' }}>No document requests on file</div>
          ) : (
            <div className="table-wrap" style={{ marginBottom: 6 }}>
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.slice(0, 5).map((d) => (
                    <tr key={d.doc_request_id}>
                      <td>{d.doc_type}</td>
                      <td style={{ fontSize: 12 }}>{formatDate(d.date_requested)}</td>
                      <td>
                        <StatusBadge status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="cons-section-label" style={{ marginTop: 14 }}>
            <ConsultationIcon width={13} height={13} style={{ verticalAlign: -2, marginRight: 5 }} />Consultation History ({consultations.length})
          </div>
          {consultations.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0' }}>No consultation records on file</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Visit Type</th>
                    <th>Complaint</th>
                  </tr>
                </thead>
                <tbody>
                  {consultations.slice(0, 5).map((c) => (
                    <tr key={c.consultation_id}>
                      <td style={{ fontSize: 12 }}>{formatDate(c.visit_date)}</td>
                      <td>
                        <StatusBadge status={c.visit_type} />
                      </td>
                      <td style={{ fontSize: 12 }}>{c.chief_complaint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
