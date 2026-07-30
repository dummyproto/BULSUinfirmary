import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import Tabs from '@components/ui/Tabs'
import StatusBadge from '@components/ui/StatusBadge'
import Spinner from '@components/ui/Spinner'
import Modal from '@components/ui/Modal'
import { formatDate } from '@lib/format'
import { listDocumentRequests, createDocumentRequest, updateDocumentRequestStatus } from '@services/documentRequestsService'
import { notify } from '@services/notificationsService'
import NewRequestModal from './NewRequestModal'
import { ClockIcon, CreditCardIcon, MapPinIcon, PlusIcon, DocumentIcon, InfoIcon, CheckCircleIcon, SettingsIcon, ClipboardIcon, XCircleIcon, EyeIcon } from '@components/ui/icons'

const TABS = ['All', 'Pending', 'Processing', 'Approved', 'Claimed', 'Declined']

const INFO_CARDS = [
  [ClockIcon, 'Processing Time', '2–3 working days for standard documents'],
  [CreditCardIcon, 'Requirements', 'Valid school ID and completed request form'],
  [MapPinIcon, 'Pickup', 'Clinic window — Mon to Fri, 8AM–5PM'],
]

// Ported 1:1 from renderMyRequests()'s inline notes-formatting logic: what
// shows in the Notes column depends on status, and Approved/Processing
// notes can contain staff text plus (for Approved) an embedded approval
// message that gets visually split out.
function renderNotes(request) {
  const { status, notes } = request

  if (status === 'Claimed') {
    return (
      <span style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <CheckCircleIcon width={13} height={13} /> Document has been claimed. Thank you!
      </span>
    )
  }
  if (status === 'Processing') {
    return notes ? (
      <span style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <SettingsIcon width={13} height={13} /> {notes}
      </span>
    ) : (
      <span style={{ color: 'var(--text-3)' }}>Your request is being processed. Kindly check back soon.</span>
    )
  }
  if (status === 'Approved') {
    if (!notes) {
      return (
        <span style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <CheckCircleIcon width={13} height={13} /> Approved — ready for pickup.
        </span>
      )
    }
    const [before, after] = notes.split('[APPROVAL MESSAGE:')
    const staffNote = before.trim()
    const approvalMsg = after ? after.replace(/\]$/, '').trim() : ''
    return (
      <>
        {staffNote && <div style={{ color: 'var(--text)' }}>{staffNote}</div>}
        {approvalMsg && (
          <div style={{ color: 'var(--success)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <ClipboardIcon width={13} height={13} /> {approvalMsg}
          </div>
        )}
        {!staffNote && !approvalMsg && notes}
      </>
    )
  }
  if (status === 'Declined' && notes) {
    return (
      <span style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <XCircleIcon width={13} height={13} /> {notes}
      </span>
    )
  }
  return notes || '—'
}

export default function MyRequestsPage() {
  const { profile } = useAuth()
  const { show } = useToast()
  const myPatientId = profile?.user_id ?? null

  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('All')
  const [newRequestOpen, setNewRequestOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)

  useEffect(() => {
    if (!myPatientId) return undefined
    let cancelled = false
    listDocumentRequests({ patientId: myPatientId })
      .then((data) => {
        if (!cancelled) setRequests(data)
      })
      .catch((err) => show(`Failed to load your requests: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPatientId])

  const filtered = tab === 'All' ? requests : requests.filter((r) => r.status === tab)

  const counts = useMemo(() => {
    const c = { All: requests.length }
    TABS.slice(1).forEach((t) => {
      c[t] = requests.filter((r) => r.status === t).length
    })
    return c
  }, [requests])

  const tabItems = TABS.map((t) => ({
    key: t,
    label: counts[t] ? `${t} (${counts[t]})` : t,
  }))

  async function handleNewRequestSubmit({ docType, purpose, dateNeeded }) {
    try {
      const created = await createDocumentRequest({ patientId: myPatientId, docType, purpose, dateNeeded })
      setRequests((list) => [created, ...list])
      setNewRequestOpen(false)
      try {
        // Both staff and admin can see /document-requests (same dual-role
        // pattern already used for emergency alerts) — previously only
        // staff was notified of new submissions, admin got nothing.
        await Promise.all([
          notify({ targetRole: 'staff', message: `${created.patient_name} requested a ${docType}.`, type: 'info', module: '/document-requests' }),
          notify({ targetRole: 'admin', message: `${created.patient_name} requested a ${docType}.`, type: 'info', module: '/document-requests' }),
        ])
      } catch {
        // Non-critical — the request itself already succeeded.
      }
      show('Request submitted! Processing takes 2–3 working days.', 'success')
    } catch (err) {
      show(`Failed to submit request: ${err.message}`, 'error')
    }
  }

  async function handleClaim(id) {
    const doc = requests.find((r) => r.doc_request_id === id)
    if (!doc) return
    if (doc.status !== 'Approved') {
      show('This document is not yet ready for claiming.', 'warning')
      return
    }
    // Native confirm is fine to call from a React event handler — it's a
    // browser API, not manual DOM manipulation.
    if (!window.confirm('Confirm that you have physically received and claimed this document?')) return

    try {
      const updated = await updateDocumentRequestStatus(id, 'Claimed')
      setRequests((list) => list.map((r) => (r.doc_request_id === id ? updated : r)))
      show('Document marked as claimed. Thank you!', 'success')
      try {
        await Promise.all([
          notify({ targetRole: 'staff', message: `${updated.patient_name} confirmed pickup of their ${updated.doc_type}.`, type: 'success', module: '/document-requests' }),
          notify({ targetRole: 'admin', message: `${updated.patient_name} confirmed pickup of their ${updated.doc_type}.`, type: 'success', module: '/document-requests' }),
        ])
      } catch {
        // Non-critical — the claim confirmation itself already succeeded.
      }
    } catch (err) {
      show(`Could not mark as claimed: ${err.message}`, 'error')
    }
  }

  if (loading) return <Spinner label="Loading your requests…" />

  return (
    <>
      <div className="page-header">
        <div>
          <h2>My Document Requests</h2>
          <p>Request and track your clinic documents</p>
        </div>
        <button type="button" className="btn btn-blue btn-lg" onClick={() => setNewRequestOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <PlusIcon width={14} height={14} /> New Request
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={tabItems} active={tab} onChange={setTab} />
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <DocumentIcon width={15} height={15} /> Request History
          </h3>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{filtered.length} record(s)</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Document Type</th>
                <th>Purpose</th>
                <th>Date Requested</th>
                <th>Date Needed</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                    No {tab.toLowerCase()} requests
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr key={d.doc_request_id}>
                  <td>
                    <strong>{d.doc_type}</strong>
                  </td>
                  <td>{d.purpose || '—'}</td>
                  <td>{formatDate(d.date_requested)}</td>
                  <td>{formatDate(d.date_needed)}</td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 220, whiteSpace: 'normal', wordBreak: 'break-word' }}>{renderNotes(d)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-sm btn-outline" title="View details" onClick={() => setDetailId(d.doc_request_id)}>
                        <EyeIcon width={13} height={13} />
                      </button>
                      {d.status === 'Approved' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-teal"
                          title="Confirm you have received this document"
                          onClick={() => handleClaim(d.doc_request_id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        >
                          <ClipboardIcon width={13} height={13} /> Mark as Claimed
                        </button>
                      )}
                      {d.status === 'Claimed' && (
                        <span style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <CheckCircleIcon width={13} height={13} /> Claimed
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <InfoIcon width={15} height={15} /> Processing Information
          </h3>
        </div>
        <div className="processing-info-grid" style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {INFO_CARDS.map(([Icon, title, desc]) => (
            <div
              key={title}
              style={{ padding: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 0 }}
            >
              <div style={{ marginBottom: 6, color: 'var(--primary)' }}>
                <Icon width={22} height={22} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <NewRequestModal
        key={newRequestOpen ? 'open' : 'closed'}
        isOpen={newRequestOpen}
        onClose={() => setNewRequestOpen(false)}
        onSubmit={handleNewRequestSubmit}
        onError={(msg) => show(msg, 'error')}
      />

      <Modal
        isOpen={detailId !== null}
        onClose={() => setDetailId(null)}
        title="Request Details"
        icon={<DocumentIcon width={16} height={16} />}
      >
        {(() => {
          const d = requests.find((r) => r.doc_request_id === detailId)
          if (!d) return null
          return (
            <div>
              <div className="detail-row">
                <span className="detail-label">Document Type</span>
                <span className="detail-value">{d.doc_type}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Purpose</span>
                <span className="detail-value">{d.purpose || '—'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Date Requested</span>
                <span className="detail-value">{formatDate(d.date_requested)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Date Needed</span>
                <span className="detail-value">{formatDate(d.date_needed)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <span className="detail-value">
                  <StatusBadge status={d.status} />
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Notes</span>
                <span className="detail-value">{renderNotes(d)}</span>
              </div>
            </div>
          )
        })()}
      </Modal>
    </>
  )
}