import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@context/ToastContext'
import { formatDate } from '@lib/format'
import StatusBadge from '@components/ui/StatusBadge'
import Spinner from '@components/ui/Spinner'
import { getInventoryStatus, itemKey } from '@features/inventory/lib/inventoryHelpers'
import { listInventory } from '@services/inventoryService'
import { listDocumentRequests } from '@services/documentRequestsService'
import { DOC_TYPES } from '@features/document-requests/NewRequestModal'
import { listConsultations } from '@services/consultationsService'
import { listAppointments } from '@services/appointmentsService'
import ApptDetailModal from './ApptDetailModal'
import { DocumentIcon, InventoryIcon, ConsultationIcon, AlertTriangleIcon, CalendarIcon } from '@components/ui/icons'

const ACTIVE_APPT_STATUSES = ['Pending', 'Confirmed', 'Scheduled']
const TERMINAL_DOC_STATUSES = ['Approved', 'Claimed', 'Declined']
const today = new Date().toISOString().slice(0, 10)

export default function StaffDashboardPage() {
  const navigate = useNavigate()
  const { show } = useToast()

  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState([])
  const [inventory, setInventory] = useState([])
  const [consultations, setConsultations] = useState([])
  const [appointments, setAppointments] = useState([])
  const [detailApptId, setDetailApptId] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([listDocumentRequests(), listInventory(), listConsultations(), listAppointments({ date: today })])
      .then(([d, i, c, a]) => {
        if (cancelled) return
        setDocs(d)
        setInventory(i)
        setConsultations(c)
        setAppointments(a)
      })
      .catch((err) => show(`Failed to load dashboard data: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pending = docs.filter((d) => d.status === 'Pending').length
  const processing = docs.filter((d) => d.status === 'Processing').length
  const lowInv = inventory.filter((i) => ['Low Stock', 'Critical Stock', 'Out of Stock', 'Expired', 'Near Expiry', 'Needs Maintenance'].includes(getInventoryStatus(i)))
  const expiredInv = inventory.filter((i) => getInventoryStatus(i) === 'Expired')
  const todayApts = appointments.length

  // Hide doc-type appointments whose linked request already reached a
  // terminal state — same logic as the legacy _todayApts filter.
  const scheduleApts = appointments
    .filter((a) => ACTIVE_APPT_STATUSES.includes(a.status))
    .filter((a) => {
      if (!DOC_TYPES.includes(a.appt_type) || !a.patient_id) return true
      const latest = docs
        .filter((d) => d.patient_id === a.patient_id && d.doc_type === a.appt_type)
        .sort((x, y) => new Date(y.created_at) - new Date(x.created_at))[0]
      if (!latest) return true
      return !TERMINAL_DOC_STATUSES.includes(latest.status)
    })
    .sort((a, b) => a.appt_time.localeCompare(b.appt_time))

  function linkedDocBadge(a) {
    if (!DOC_TYPES.includes(a.appt_type) || !a.patient_id) return null
    const matched = docs
      .filter((d) => d.patient_id === a.patient_id && d.doc_type === a.appt_type)
      .sort((x, y) => new Date(y.created_at) - new Date(x.created_at))[0]
    if (!matched || !['Pending', 'Processing', 'Approved'].includes(matched.status)) return null
    return <StatusBadge status={matched.status} />
  }

  const detailAppt = appointments.find((a) => a.appointment_id === detailApptId) || null

  if (loading) return <Spinner label="Loading dashboard…" />

  return (
    <>
      {expiredInv.length > 0 && (
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangleIcon width={16} height={16} style={{ flexShrink: 0 }} />
          <span>
            {expiredInv.length} expired item(s):{' '}
            {expiredInv.map((i) => <strong key={i.inventory_id}>{i.name}</strong>).reduce((a, b) => [a, ', ', b])}. Notify administrator.
          </span>
        </div>
      )}

      <div className="stats-row cols-4" style={{ marginTop: expiredInv.length ? 14 : 0 }}>
        <div className="stat-card">
          <div className="stat-icon orange">
            <DocumentIcon width={18} height={18} />
          </div>
          <div className="stat-num">{pending + processing}</div>
          <div className="stat-label">Active Requests</div>
          <div className={`stat-delta ${pending > 0 ? 'down' : 'up'}`}>
            {pending} pending · {processing} processing
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">
            <CalendarIcon width={18} height={18} />
          </div>
          <div className="stat-num">{todayApts}</div>
          <div className="stat-label">Today&apos;s Appointments</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">
            <InventoryIcon width={18} height={18} />
          </div>
          <div className="stat-num">{lowInv.length}</div>
          <div className="stat-label">Inventory Alerts</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <ConsultationIcon width={18} height={18} />
          </div>
          <div className="stat-num">{consultations.length}</div>
          <div className="stat-label">Health Records</div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <CalendarIcon width={15} height={15} /> Today&apos;s Schedule
            </h3>
          </div>
          {scheduleApts.length === 0 ? (
            <div className="empty-state">
              <p>No appointments scheduled for today</p>
            </div>
          ) : (
            scheduleApts.map((a) => (
              <div key={a.appointment_id} className="appt-card" style={{ cursor: 'pointer' }} onClick={() => setDetailApptId(a.appointment_id)}>
                <div className="appt-time">
                  <div className="t">{a.appt_time}</div>
                  <div className="d">Today</div>
                </div>
                <div className="appt-divider" style={{ background: 'var(--warning)' }} />
                <div className="appt-info flex-1">
                  <h4>{a.patient_name}</h4>
                  <p style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {a.appt_type}
                    <span className="appt-doc-badge">{linkedDocBadge(a)}</span>
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <AlertTriangleIcon width={15} height={15} /> Inventory Alerts
            </h3>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => navigate('/inventory')}>
              Manage
            </button>
          </div>
          <div style={{ padding: '10px 0' }}>
            {lowInv.length === 0 ? (
              <div className="empty-state">
                <p>No inventory alerts</p>
              </div>
            ) : (
              lowInv.map((i) => (
                <div key={itemKey(i)} style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{i.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {i.quantity} {i.unit} remaining{i.expiration_date ? ` · Exp: ${formatDate(i.expiration_date)}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={getInventoryStatus(i)} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <ApptDetailModal
        isOpen={detailApptId !== null}
        onClose={() => setDetailApptId(null)}
        appt={detailAppt}
        docRequests={docs}
        onViewDocRequests={() => {
          setDetailApptId(null)
          navigate('/document-requests')
        }}
      />
    </>
  )
}
