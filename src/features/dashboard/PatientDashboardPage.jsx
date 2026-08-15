import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import { formatDate } from '@lib/format'
import StatusBadge from '@components/ui/StatusBadge'
import Spinner from '@components/ui/Spinner'
import { listDocumentRequests } from '@services/documentRequestsService'
import { listConsultations } from '@services/consultationsService'
import { listEmergencyAlerts, getAlertById } from '@services/emergencyAlertsService'
import { supabase } from '@services/supabaseClient'
import { useRealtimeRefresh } from '@hooks/useRealtimeRefresh'
import { DocumentIcon, ClockIcon, CheckCircleIcon, ConsultationIcon, ChatbotIcon, AlertOctagonIcon, MapPinIcon, UserIcon, PeopleIcon } from '@components/ui/icons'

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

  async function refreshRequestsAndConsultations() {
    if (!myId) return
    const [d, c] = await Promise.all([listDocumentRequests({ patientId: myId }), listConsultations({ patientId: myId })])
    setDocs(d)
    setConsultations(c)
  }

  // Staff approving/rejecting a document request, or logging a new
  // consultation, should show up here the moment it happens — this is
  // the patient's own "what's going on with me" summary, so it should
  // never look stale just because they haven't reloaded the page.
  // Emergency alerts have their own dedicated realtime handling just
  // below (patched in place, not a full refetch), so they're
  // deliberately not included in this table list.
  useRealtimeRefresh(['document_requests', 'consultations'], refreshRequestsAndConsultations, !!myId)

  // Keeps "Emergency Alert Status" live: a NEW alert involving this patient
  // (as subject or reporter) appears the moment it's created, and an
  // existing one updates in place the moment staff acknowledge/resolve it —
  // without the patient needing to refresh the dashboard. RLS
  // (emergency_alerts_select) already scopes which rows this subscription
  // actually receives to ones where this patient is subject_id or
  // reported_by, so no extra client-side filtering by user is needed here,
  // only by which alert_id is affected.
  useEffect(() => {
    if (!myId) return undefined
    let cancelled = false
    const channel = supabase
      .channel(`patient-emergency-alerts-${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_alerts' }, async (payload) => {
        try {
          const fullAlert = await getAlertById(payload.new.emergency_alert_id)
          if (!cancelled && fullAlert) setMyAlerts((list) => [fullAlert, ...list])
        } catch {
          // Joined fetch failed — fall back to the raw payload rather than
          // silently missing the new alert entirely.
          if (!cancelled) setMyAlerts((list) => [payload.new, ...list])
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'emergency_alerts' }, async (payload) => {
        try {
          const fullAlert = await getAlertById(payload.new.emergency_alert_id)
          if (!cancelled && fullAlert) {
            setMyAlerts((list) => list.map((a) => (a.emergency_alert_id === fullAlert.emergency_alert_id ? fullAlert : a)))
          }
        } catch {
          // Non-critical — the next full page load will show the current
          // status regardless.
        }
      })
      .subscribe()
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
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
                <AlertOctagonIcon width={15} height={15} /> Emergency Alert Status
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
                  <span className="detail-label">Reported For</span>
                  <span className="detail-value">{latestAlert.subject_name || '—'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Type</span>
                  <span className="detail-value" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {latestAlert.emergency_type === 'myself' ? <UserIcon width={12} height={12} /> : <PeopleIcon width={12} height={12} />}
                    {latestAlert.emergency_type === 'myself' ? 'For Myself' : 'For Another Person'}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Location</span>
                  <span className="detail-value" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <MapPinIcon width={12} height={12} /> {latestAlert.location}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Description</span>
                  <span className="detail-value">{latestAlert.description}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Reported By</span>
                  <span className="detail-value">{latestAlert.reporter_name}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Reported</span>
                  <span className="detail-value">{formatDate(latestAlert.created_at)}</span>
                </div>
                {latestAlert.acknowledged_by_name && (
                  <div className="detail-row">
                    <span className="detail-label">Acknowledged By</span>
                    <span className="detail-value">{latestAlert.acknowledged_by_name}</span>
                  </div>
                )}
                {latestAlert.resolved_at && (
                  <div className="detail-row">
                    <span className="detail-label">Resolved</span>
                    <span className="detail-value">{formatDate(latestAlert.resolved_at)}</span>
                  </div>
                )}
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