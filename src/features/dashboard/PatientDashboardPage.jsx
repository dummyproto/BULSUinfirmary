import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import { formatDate } from '@lib/format'
import StatusBadge from '@components/ui/StatusBadge'
import Spinner from '@components/ui/Spinner'
import { listDocumentRequests } from '@services/documentRequestsService'
import { listConsultations } from '@services/consultationsService'
import { listEmergencyAlerts } from '@services/emergencyAlertsService'
import { DocumentIcon, ClockIcon, CheckCircleIcon, ConsultationIcon, ChatbotIcon } from '@components/ui/icons'

export default function PatientDashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { show } = useToast()
  const myId = profile?.user_id ?? null

  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState([])
  const [consultations, setConsultations] = useState([])
  const [myAlerts, setMyAlerts] = useState([])

  useEffect(() => {
    if (!myId) return undefined
    let cancelled = false
    Promise.all([listDocumentRequests({ patientId: myId }), listConsultations({ patientId: myId }), listEmergencyAlerts()])
      .then(([d, c, alerts]) => {
        if (cancelled) return
        setDocs(d)
        setConsultations(c)
        // listEmergencyAlerts() has no explicit filter, but RLS already
        // scopes what a patient-role caller can see to alerts where
        // they're the subject or the reporter — no client-side filtering
        // needed to keep this to "my" alerts specifically.
        setMyAlerts(alerts)
      })
      .catch((err) => show(`Failed to load dashboard data: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId])

  const pending = docs.filter((d) => d.status === 'Pending').length
  const approved = docs.filter((d) => d.status === 'Approved').length
  const activeCount = docs.filter((d) => ['Pending', 'Processing', 'Approved'].includes(d.status)).length
  const activeDocs = docs
    .filter((d) => ['Pending', 'Processing', 'Approved'].includes(d.status))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)
  const recent = consultations[0]
  const latestAlert = [...myAlerts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
  const followUpStatus = (() => {
    if (!recent?.follow_up_date) return null
    const today = new Date().toISOString().slice(0, 10)
    if (recent.follow_up_date < today) return { label: 'Overdue', color: 'var(--danger)' }
    if (recent.follow_up_date === today) return { label: 'Today', color: 'var(--warning)' }
    return { label: 'Upcoming', color: 'var(--primary)' }
  })()

  if (loading) return <Spinner label="Loading dashboard…" />

  return (
    <>
      <div className="stats-row cols-3">
        <div className="stat-card">
          <div className="stat-icon blue">
            <DocumentIcon width={18} height={18} />
          </div>
          <div className="stat-num">{activeCount}</div>
          <div className="stat-label">Active Requests</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">
            <ClockIcon width={18} height={18} />
          </div>
          <div className="stat-num">{pending}</div>
          <div className="stat-label">Pending Requests</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <CheckCircleIcon width={18} height={18} />
          </div>
          <div className="stat-num">{approved}</div>
          <div className="stat-label">Approved Documents</div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <DocumentIcon width={15} height={15} /> My Recent Requests
            </h3>
            <button type="button" className="btn btn-sm btn-blue" onClick={() => navigate('/my-requests')}>
              View All
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeDocs.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20 }}>
                      No active requests
                    </td>
                  </tr>
                )}
                {activeDocs.map((d) => (
                  <tr key={d.doc_request_id}>
                    <td>
                      <strong>{d.doc_type}</strong>
                    </td>
                    <td>{formatDate(d.date_requested)}</td>
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <ConsultationIcon width={15} height={15} /> {recent ? 'Last Consultation' : 'Health Record'}
              </h3>
            </div>
            {recent ? (
              <div style={{ padding: 14 }}>
                <div className="detail-row">
                  <span className="detail-label">Date</span>
                  <span className="detail-value">{formatDate(recent.visit_date)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Complaint</span>
                  <span className="detail-value">{recent.chief_complaint}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Assessment</span>
                  <span className="detail-value">{recent.assessment}</span>
                </div>
                {recent.follow_up_date && (
                  <div className="detail-row">
                    <span className="detail-label">Follow-up</span>
                    <span className="detail-value" style={{ fontWeight: 600 }}>
                      {formatDate(recent.follow_up_date)}{' '}
                      <span style={{ color: followUpStatus.color, fontSize: 11 }}>({followUpStatus.label})</span>
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <p>No consultation records yet</p>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                Emergency Alert Status
              </h3>
            </div>
            {latestAlert ? (
              <div style={{ padding: 14 }}>
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <span className="detail-value">
                    <StatusBadge status={latestAlert.status} />
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Reported</span>
                  <span className="detail-value">{formatDate(latestAlert.created_at)}</span>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>No emergency alerts on file</p>
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ padding: 14 }}>
              <p style={{ fontSize: '12.5px', color: 'var(--text-2)', marginBottom: 12 }}>
                Have questions about clinic hours, documents, or services?
              </p>
              <button type="button" className="btn btn-blue btn-full" onClick={() => navigate('/chatbot')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                Open Chatbot <ChatbotIcon width={15} height={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}