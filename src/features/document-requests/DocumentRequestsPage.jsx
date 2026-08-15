import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@context/ToastContext'
import { useConfirm } from '@context/ConfirmContext'
import Tabs from '@components/ui/Tabs'
import StatusFilterDropdown from '@components/ui/StatusFilterDropdown'
import StatusBadge from '@components/ui/StatusBadge'
import SearchInput from '@components/ui/SearchInput'
import Spinner from '@components/ui/Spinner'
import { formatDate } from '@lib/format'
import { useAuth } from '@context/AuthContext'
import { listDocumentRequests, updateDocumentRequestStatus, deleteDocumentRequests } from '@services/documentRequestsService'
import { notify } from '@services/notificationsService'
import DocDetailModal from './DocDetailModal'
import DocActionModal from './DocActionModal'
import { EyeIcon, CheckCircleIcon, XCircleIcon, SettingsIcon, ChevronDownIcon, ChevronUpIcon, TrashIcon } from '@components/ui/icons'
import { defaultShowMore } from '@lib/viewport'
import { useRealtimeRefresh } from '@hooks/useRealtimeRefresh'

const TABS = ['All', 'Pending', 'Processing', 'Approved', 'Declined']

export default function DocumentRequestsPage() {
  const { profile } = useAuth()
  const { show } = useToast()
  const confirm = useConfirm()
  // Same delete_logs permission gating every other log/list's bulk
  // delete in this app — admin implicitly qualifies regardless of
  // their own staff_permissions row (which exists but is irrelevant
  // for admins), staff need the explicit flag.
  const canDeleteRequests = profile?.role === 'admin' || !!profile?.permissions?.delete_logs

  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('All')
  const [search, setSearch] = useState('')
  const [showMore, setShowMore] = useState(defaultShowMore)
  const [detailId, setDetailId] = useState(null)
  const [action, setAction] = useState(null) // { type: 'approve'|'process'|'decline', id }
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState([])

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

  async function refreshRequests() {
    setRequests(await listDocumentRequests())
  }

  // A patient submitting a new request, or another staff member on a
  // different device approving/declining one, should appear here live —
  // this is a shared work queue, not a personal list.
  useRealtimeRefresh('document_requests', refreshRequests)

  // patient_id is SET NULL when the requesting account is deleted
  // (migration 019) — those rows still exist for audit/history purposes
  // (see listDocumentRequests()'s 'Deleted User' fallback, used
  // elsewhere), but shouldn't show up in this active-management view.
  const visibleRequests = requests.filter((r) => r.patient_id !== null)

  const tabFiltered = tab === 'All' ? visibleRequests : visibleRequests.filter((r) => r.status === tab)
  const filtered = search
    ? tabFiltered.filter((r) => r.patient_name?.toLowerCase().includes(search.toLowerCase()))
    : tabFiltered

  const counts = useMemo(() => {
    const c = { All: visibleRequests.length }
    TABS.slice(1).forEach((t) => {
      c[t] = visibleRequests.filter((r) => r.status === t).length
    })
    return c
  }, [visibleRequests])

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

  function toggleSelectionMode() {
    setSelectionMode((m) => !m)
    setSelected([])
  }
  function toggleOne(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }
  function toggleAll() {
    const visibleIds = filtered.map((r) => r.doc_request_id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))
    setSelected(allSelected ? selected.filter((id) => !visibleIds.includes(id)) : [...new Set([...selected, ...visibleIds])])
  }
  async function handleDeleteSelected() {
    const ok = await confirm(
      selected.length === 1
        ? 'Delete this document request?\nThis cannot be undone.'
        : `Delete ${selected.length} document requests?\nThis cannot be undone.`,
      { confirmLabel: 'Delete', danger: true }
    )
    if (!ok) return
    try {
      await deleteDocumentRequests(selected)
      setRequests((list) => list.filter((r) => !selected.includes(r.doc_request_id)))
      show(selected.length === 1 ? 'Document request deleted' : `${selected.length} document requests deleted`, 'success')
      setSelected([])
      setSelectionMode(false)
    } catch (err) {
      show(`Failed to delete: ${err.message}`, 'error')
    }
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
      } catch (err) {
     console.error('notify() failed:', err)
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
          <p>{visibleRequests.length} total requests in the system</p>
        </div>
        <div className="status-filter-tabs-wrap">
          <Tabs tabs={tabItems} active={tab} onChange={setTab} />
        </div>
        {/* Mobile-only equivalent of the chip row above — see the same
            pattern (and full reasoning) in MyRequestsPage.jsx, which
            StatusFilterDropdown was originally built for. */}
        <div className="status-filter-select-wrap">
          <StatusFilterDropdown options={tabItems} value={tab} onChange={setTab} />
        </div>
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
          <button
            type="button"
            className="btn btn-sm btn-outline inv-view-more-btn"
            onClick={() => setShowMore((v) => !v)}
            title="Show or hide User ID, Purpose, and Date Needed columns"
            aria-label={showMore ? 'View Less — hide User ID, Purpose, and Date Needed columns' : 'View More — show User ID, Purpose, and Date Needed columns'}
          >
            {showMore ? <ChevronUpIcon width={13} height={13} /> : <ChevronDownIcon width={13} height={13} />}
            <span>{showMore ? 'View Less' : 'View More'}</span>
          </button>
          {canDeleteRequests && selectionMode && selected.length > 0 && (
            <button type="button" className="btn btn-sm btn-red" onClick={handleDeleteSelected}>
              <TrashIcon width={13} height={13} /> Delete Selected ({selected.length})
            </button>
          )}
          {canDeleteRequests && (
            <button type="button" className="btn btn-sm btn-outline" onClick={toggleSelectionMode}>
              {selectionMode ? 'Cancel' : (<><TrashIcon width={13} height={13} /> Delete</>)}
            </button>
          )}
        </div>

        {canDeleteRequests && selectionMode && filtered.length > 0 && (
          <div style={{ padding: '10px 18px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filtered.length > 0 && filtered.every((r) => selected.includes(r.doc_request_id))}
                onChange={toggleAll}
              />
              Select all visible
            </label>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {canDeleteRequests && selectionMode && <th style={{ width: 30 }} />}
                <th>Patient</th>
                {showMore && <th>User ID</th>}
                <th>Document Type</th>
                {showMore && (
                  <>
                    <th>Purpose</th>
                    <th>Date Needed</th>
                  </>
                )}
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={(showMore ? 7 : 4) + (canDeleteRequests && selectionMode ? 1 : 0)} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                    No {tab.toLowerCase()} requests
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr key={d.doc_request_id}>
                  {canDeleteRequests && selectionMode && (
                    <td>
                      <input type="checkbox" checked={selected.includes(d.doc_request_id)} onChange={() => toggleOne(d.doc_request_id)} />
                    </td>
                  )}
                  <td>
                    <strong>{d.patient_name}</strong>
                  </td>
                  {showMore && (
                    <td>
                      <code style={{ fontSize: 11 }}>{d.student_number}</code>
                    </td>
                  )}
                  <td>{d.doc_type}</td>
                  {showMore && (
                    <>
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
                    </>
                  )}
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