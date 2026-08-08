import { useEffect, useRef, useState } from 'react'
import StatusBadge from '@components/ui/StatusBadge'
import SearchInput from '@components/ui/SearchInput'
import { formatDate } from '@lib/format'
import { FolderIcon, EyeIcon, ChevronDownIcon, ChevronUpIcon } from '@components/ui/icons'
import { defaultShowMore } from '@lib/viewport'

export default function EHRRecordsTab({ consultations, search, onSearchChange, onView, onPrint }) {
  const [showMore, setShowMore] = useState(defaultShowMore)
  const q = search.toLowerCase()
  const filtered = search
    ? consultations.filter(
        (c) =>
          (c.patient_name || '').toLowerCase().includes(q) ||
          (c.diagnosis || c.assessment || '').toLowerCase().includes(q) ||
          (c.chief_complaint || '').toLowerCase().includes(q)
      )
    : consultations

  // Same freeze-header-and-column-labels-while-scrolling treatment as
  // Inventory Items (ItemsTab.jsx) — measured live via ResizeObserver
  // since the header row can wrap on narrow screens.
  const headerRef = useRef(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return undefined
    const measure = () => setHeaderHeight(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="card" style={{ '--ehr-header-h': `${headerHeight}px` }}>
      <div ref={headerRef} className="card-header inv-ehr-sticky-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><FolderIcon width={15} height={15} /> Health Records</h3>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchInput value={search} onChange={onSearchChange} placeholder="Search records…" width={200} />
          <button
            type="button"
            className="btn btn-sm btn-outline inv-view-more-btn"
            onClick={() => setShowMore((v) => !v)}
            title="Show or hide User ID, Visit Type, Main Complaint, and Medications columns"
            aria-label={showMore ? 'View Less — hide User ID, Visit Type, Main Complaint, and Medications columns' : 'View More — show User ID, Visit Type, Main Complaint, and Medications columns'}
          >
            {showMore ? <ChevronUpIcon width={13} height={13} /> : <ChevronDownIcon width={13} height={13} />}
            <span>{showMore ? 'View Less' : 'View More'}</span>
          </button>
        </div>
      </div>
      <div className="table-wrap inv-ehr-scroll">
        <table className="inv-ehr-table">
          <thead>
            <tr>
              <th>Patient</th>
              {showMore && <th>User ID</th>}
              <th>Date</th>
              {showMore && <th>Visit Type</th>}
              <th>Diagnosis</th>
              {showMore && (
                <>
                  <th>Main Complaint</th>
                  <th>Medications</th>
                </>
              )}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={showMore ? 8 : 4} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                  No records found
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.consultation_id}>
                <td>
                  <strong>{c.patient_name}</strong>
                </td>
                {showMore && (
                  <td>
                    <code style={{ fontSize: 11 }}>{c.student_number}</code>
                  </td>
                )}
                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(c.visit_date)}</td>
                {showMore && (
                  <td>
                    <StatusBadge status={c.visit_type} />
                  </td>
                )}
                <td style={{ maxWidth: 160 }}>
                  <span className="diag-pill">{c.diagnosis || (c.assessment || '').substring(0, 40) || '—'}</span>
                </td>
                {showMore && (
                  <>
                    <td
                      style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-2)' }}
                    >
                      {c.chief_complaint}
                    </td>
                    <td
                      style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-2)' }}
                    >
                      {c.medications || 'None'}
                    </td>
                  </>
                )}
                <td>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => onView(c.consultation_id)}>
                    <EyeIcon width={13} height={13} /> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 18px', fontSize: 12, color: 'var(--text-3)' }}>
        Showing {filtered.length} of {consultations.length} records
        {search && (
          <>
            {' '}
            ·{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); onSearchChange('') }} style={{ color: 'var(--primary)' }}>
              Clear
            </a>
          </>
        )}
      </div>
    </div>
  )
}