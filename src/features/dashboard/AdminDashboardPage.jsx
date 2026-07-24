import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@context/ToastContext'
import { formatDate } from '@lib/format'
import StatusBadge from '@components/ui/StatusBadge'
import Spinner from '@components/ui/Spinner'
import { getInventoryStatus, itemKey } from '@features/inventory/lib/inventoryHelpers'
import { listInventory } from '@services/inventoryService'
import { listDocumentRequests } from '@services/documentRequestsService'
import { listConsultations } from '@services/consultationsService'
import { listUsers } from '@services/usersService'
import HealthDetailModal from '@features/consultations/HealthDetailModal'
import {
  DocumentIcon,
  InventoryIcon,
  ReportsIcon,
  SettingsIcon,
  AlertTriangleIcon,
  PeopleIcon,
  ConsultationIcon,
  ClipboardIcon,
} from '@components/ui/icons'

const QUICK_LINKS = [
  { label: 'Document Requests', path: '/document-requests', color: 'var(--primary)', Icon: DocumentIcon },
  { label: 'Inventory', path: '/inventory', color: 'var(--warning)', Icon: InventoryIcon },
  { label: 'Reports', path: '/reports', color: 'var(--success)', Icon: ReportsIcon },
  { label: 'Maintenance', path: '/maintenance', color: '#7C3AED', Icon: SettingsIcon },
]

const ROLE_COLOR = { admin: '#DC2626', staff: '#1E7B5E', patient: '#16A34A' }

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const { show } = useToast()

  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState([])
  const [inventory, setInventory] = useState([])
  const [consultations, setConsultations] = useState([])
  const [users, setUsers] = useState([])
  const [detailId, setDetailId] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([listDocumentRequests(), listInventory(), listConsultations(), listUsers()])
      .then(([d, i, c, u]) => {
        if (cancelled) return
        setDocs(d)
        setInventory(i)
        setConsultations(c)
        setUsers(u)
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

  const pendingDocs = docs.filter((d) => d.status === 'Pending').length
  const processingDocs = docs.filter((d) => d.status === 'Processing').length
  const lowInv = inventory.filter((i) => ['Low Stock', 'Critical Stock', 'Out of Stock', 'Expired', 'Near Expiry', 'Needs Maintenance'].includes(getInventoryStatus(i))).length
  const expiredInv = inventory.filter((i) => getInventoryStatus(i) === 'Expired')
  const lowStockCount = inventory.filter((i) => getInventoryStatus(i) === 'Low Stock').length

  const activeDocs = docs
    .filter((d) => ['Pending', 'Processing', 'Approved'].includes(d.status))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)
  const recentCons = [...consultations].slice(0, 4)

  const totalUsers = users.length
  const activeUsers = users.filter((u) => u.is_active).length
  const byRole = { admin: 0, staff: 0, patient: 0 }
  users.forEach((u) => {
    if (byRole[u.role] !== undefined) byRole[u.role]++
  })

  const detailConsultation = consultations.find((c) => c.consultation_id === detailId) || null

  if (loading) return <Spinner label="Loading dashboard…" />

  return (
    <>
      {expiredInv.length > 0 && (
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangleIcon width={16} height={16} style={{ flexShrink: 0 }} />
          <span>
            {expiredInv.length} inventory item(s) expired: {expiredInv.map((i) => <strong key={itemKey(i)}>{i.name}</strong>).reduce((a, b) => [a, ', ', b])}
          </span>
        </div>
      )}
      {lowStockCount > 0 && (
        <div className="alert alert-warning" style={{ marginTop: expiredInv.length ? 8 : 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <InventoryIcon width={16} height={16} style={{ flexShrink: 0 }} />
          <span>{lowStockCount} item(s) below minimum stock level.</span>
        </div>
      )}

      <div className="stats-row cols-4" style={{ marginTop: 14 }}>
        <div className="stat-card">
          <div className="stat-icon blue">
            <PeopleIcon width={18} height={18} />
          </div>
          <div className="stat-num">{activeUsers}</div>
          <div className="stat-label">Active Users</div>
          <div className="stat-delta neutral">{totalUsers} total registered</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">
            <DocumentIcon width={18} height={18} />
          </div>
          <div className="stat-num">{pendingDocs + processingDocs}</div>
          <div className="stat-label">Active Requests</div>
          <div className={`stat-delta ${pendingDocs > 0 ? 'down' : 'up'}`}>
            {pendingDocs} pending · {processingDocs} processing
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">
            <InventoryIcon width={18} height={18} />
          </div>
          <div className="stat-num">{lowInv}</div>
          <div className="stat-label">Inventory Alerts</div>
          <div className={`stat-delta ${lowInv > 0 ? 'down' : 'up'}`}>{lowInv > 0 ? 'Needs attention' : 'All stocked'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <ConsultationIcon width={18} height={18} />
          </div>
          <div className="stat-num">{consultations.length}</div>
          <div className="stat-label">Total Health Records</div>
          <div className="stat-delta neutral">Health records on file</div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <ClipboardIcon width={15} height={15} /> Recent Document Requests
            </h3>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => navigate('/document-requests')}>
              View All
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Document</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeDocs.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20 }}>
                      No active requests
                    </td>
                  </tr>
                )}
                {activeDocs.map((d) => (
                  <tr key={d.doc_request_id}>
                    <td>
                      <strong>{d.patient_name}</strong>
                    </td>
                    <td>{d.doc_type}</td>
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
                <ConsultationIcon width={15} height={15} /> Recent Consultations
              </h3>
            </div>
            {recentCons.length === 0 ? (
              <div className="empty-state">
                <p>No consultations yet</p>
              </div>
            ) : (
              recentCons.map((c) => (
                <div key={c.consultation_id} className="appt-card" style={{ cursor: 'pointer' }} onClick={() => setDetailId(c.consultation_id)}>
                  <div className="appt-time">
                    <div className="t">{c.visit_date?.slice(5, 10)}</div>
                    <div className="d">{c.visit_date?.slice(0, 4)}</div>
                  </div>
                  <div className="appt-divider" style={{ background: 'var(--primary-light)' }} />
                  <div className="appt-info">
                    <h4>{c.patient_name}</h4>
                    <p>{c.chief_complaint}</p>
                  </div>
                  <StatusBadge status={c.visit_type} />
                </div>
              ))
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <ReportsIcon width={15} height={15} /> User Distribution
              </h3>
            </div>
            <div style={{ padding: 14 }}>
              {Object.entries(byRole).map(([role, cnt]) => {
                const pct = totalUsers ? Math.round((cnt / totalUsers) * 100) : 0
                return (
                  <div key={role} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{role}</span>
                      <span style={{ color: 'var(--text-3)' }}>
                        {cnt} users ({pct}%)
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 4 }}>
                      <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: ROLE_COLOR[role] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {QUICK_LINKS.map((b) => (
          <div
            key={b.path}
            className="stat-card"
            style={{ cursor: 'pointer', flex: 1, minWidth: 140 }}
            onClick={() => navigate(b.path)}
          >
            <div style={{ marginBottom: 6, color: b.color }}>
              <b.Icon width={22} height={22} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: b.color }}>{b.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Go to module →</div>
          </div>
        ))}
      </div>

      <HealthDetailModal
        isOpen={detailId !== null}
        onClose={() => setDetailId(null)}
        consultation={detailConsultation}
        attendedByName={null}
        deductionLogs={[]}
        onPrint={() => show('Printing is migrated with the Reports feature.', 'info')}
      />
    </>
  )
}
