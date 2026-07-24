import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@context/ToastContext'
import Tabs from '@components/ui/Tabs'
import StatusBadge from '@components/ui/StatusBadge'
import SearchInput from '@components/ui/SearchInput'
import Spinner from '@components/ui/Spinner'
import { formatDate } from '@lib/format'
import { useAuth } from '@context/AuthContext'
import { listDocumentRequests, updateDocumentRequestStatus } from '@services/documentRequestsService'
import { notify } from '@services/notificationsService'
import DocDetailModal from './DocDetailModal'
import DocActionModal from './DocActionModal'
import { EyeIcon, CheckCircleIcon, XCircleIcon, SettingsIcon } from '@components/ui/icons'

const TABS = ['All', 'Pending', 'Processing', 'Approved', 'Declined']

export default function DocumentRequestsPage() {
  const { profile } = useAuth()
  const { show } = useToast()

  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('All')
  const [search, setSearch] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [action, setAction] = useState(null) // { type: 'approve'|'process'|'decline', id }

  useEffect(() => {
    let cancelled = false
    listDocumentRequests()
      .then((data) => {
        if (!cancelled) setRequests(data)
      })
      .catch((err) => show(`Failed to load document requests: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tabFiltered = tab === 'All' ? requests : requests.filter((r) => r.status === tab)
  const filtered = search
    ? tabFiltered.filter((r) => r.patient_name?.toLowerCase().includes(search.toLowerCase()))
    : tabFiltered

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

  const detailRequest = requests.find((r) => r.doc_request_id === detailId) || null

  function openAction(type, id) {
    setAction({ type, id })
  }

  function closeAction() {
    setAction(null)
  }

  async function handleActionSubmit(notes) {
    if (!action) return
    const { type, id } = action
    const currentUserId = profile?.user_id ?? null

    const statusFor = { approve: 'Approved', process: 'Processing', decline: 'Declined' }
    const finalNotes =
      type === 'approve'
        ? `${notes}\n\n[APPROVAL MESSAGE: You can now claim your requested document. Please be advised that validity of claiming is 3 days only.]`
        : notes

    try {
      const updated = await updateDocumentRequestStatus(id, statusFor[type], { processedBy: currentUserId, notes: finalNotes })
      setRequests((list) => list.map((r) => (r.doc_request_id === id ? updated : r)))

      const messages = {
        approve: 'Document approved',
        process: 'Document marked as processing',
        decline: 'Document declined',
      }
      const notifTypes = { approve: 'success', process: 'info', decline: 'warning' }
      const notifMessages = {
        approve: `Your ${updated.doc_type} request has been approved and is ready for pickup.`,
        process: `Your ${updated.doc_type} request is now being processed.`,
        decline: `Your ${updated.doc_type} request was declined.${notes ? ` Reason: ${notes}` : ''}`,
      }
      try {
        await notify({ targetUserId: updated.patient_id, message: notifMessages[type], type: notifTypes[type], module: '/my-requests' })
      } catch {
        // Non-critical — the status update itself already succeeded.
      }

      show(messages[type], 'success')
      closeAction()
    } catch (err) {
      show(`Failed to update request: ${err.message}`, 'error')
    }
  }

  if (loading) return <Spinner label="Loading document requests…" />

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Document Requests</h2>
          <p>{requests.length} total requests in the system</p>
        </div>
        <Tabs tabs={tabItems} active={tab} onChange={setTab} />
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <StatusBadge status={tab} />
            <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 6 }}>
              {filtered.length} record(s)
            </span>
          </div>
          <SearchInput value={search} onChange={setSearch} placeholder="Search by patient name…" />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>User ID</th>
                <th>Document Type</th>
                <th>Purpose</th>
                <th>Date Needed</th>
                <th>Status</th>
                <th>Actions</th>
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
                    <strong>{d.patient_name}</strong>
                  </td>
                  <td>
                    <code style={{ fontSize: 11 }}>{d.student_number}</code>
                  </td>
                  <td>{d.doc_type}</td>
                  <td
                    style={{
                      maxWidth: 120,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.purpose || '—'}
                  </td>
                  <td>{formatDate(d.date_needed)}</td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => setDetailId(d.doc_request_id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      >
                        <EyeIcon width={13} height={13} /> View
                      </button>
                      {(d.status === 'Pending' || d.status === 'Processing') && (
                        <>
                          {d.status === 'Processing' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-green"
                              onClick={() => openAction('approve', d.doc_request_id)}
                              title="Approve"
                              aria-label="Approve"
                            >
                              <CheckCircleIcon width={14} height={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-red"
                            onClick={() => openAction('decline', d.doc_request_id)}
                            title="Decline"
                            aria-label="Decline"
                          >
                            <XCircleIcon width={14} height={14} />
                          </button>
                          {d.status === 'Pending' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-blue"
                              onClick={() => openAction('process', d.doc_request_id)}
                              title="Mark as Processing"
                              aria-label="Mark as Processing"
                            >
                              <SettingsIcon width={14} height={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DocDetailModal
        isOpen={detailId !== null}
        onClose={() => setDetailId(null)}
        request={detailRequest}
        processedByName={detailRequest?.processed_by_name}
      />

      <DocActionModal
        key={action ? `${action.type}-${action.id}` : 'closed'}
        isOpen={action !== null}
        action={action?.type}
        onClose={closeAction}
        onSubmit={handleActionSubmit}
        onValidationError={(msg) => show(msg, 'warning', 3000)}
      />
    </>
  )
}
