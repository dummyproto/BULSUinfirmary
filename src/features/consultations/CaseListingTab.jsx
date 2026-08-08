import { useState } from 'react'
import StatusBadge from '@components/ui/StatusBadge'
import { formatDate } from '@lib/format'
import { ClipboardIcon, TagIcon, EyeIcon, ChevronDownIcon, ChevronUpIcon } from '@components/ui/icons'
import { defaultShowMore } from '@lib/viewport'

export default function CaseListingTab({ consultations, filters, onFiltersChange, onView }) {
  const [showMore, setShowMore] = useState(defaultShowMore)
  const { search, diagFilter, dateFrom, dateTo } = filters

  const diagCount = {}
  consultations.forEach((c) => {
    const d = c.diagnosis || 'Unspecified'
    diagCount[d] = (diagCount[d] || 0) + 1
  })
  const sortedDiags = Object.entries(diagCount).sort((a, b) => b[1] - a[1])
  const totalCases = consultations.length

  let filtered = consultations
  if (diagFilter !== 'All') filtered = filtered.filter((c) => (c.diagnosis || 'Unspecified') === diagFilter)
  if (dateFrom) filtered = filtered.filter((c) => c.visit_date >= dateFrom)
  if (dateTo) filtered = filtered.filter((c) => c.visit_date <= dateTo)
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter((c) => (c.patient_name || '').toLowerCase().includes(q) || (c.diagnosis || '').toLowerCase().includes(q))
  }

  const today = new Date().toISOString().slice(0, 10)
  const set = (patch) => onFiltersChange({ ...filters, ...patch })

  return (
    <>
      <div className="stats-row cols-4" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-num">{totalCases}</div>
          <div className="stat-label">Total Cases</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{Object.keys(diagCount).length}</div>
          <div className="stat-label">Unique Diagnoses</div>
        </div>
        <div className="stat-card">
          <div className="stat-num" style={{ fontSize: 13 }}>
            {sortedDiags[0] ? sortedDiags[0][0].substring(0, 20) + '…' : '—'}
          </div>
          <div className="stat-label">Top Diagnosis</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{consultations.filter((c) => c.visit_date === today).length}</div>
          <div className="stat-label">Cases Today</div>
        </div>
      </div>

      <div className="cases-layout">
        <div className="card" style={{ flex: 1, minWidth: 0 }}>
          <div className="card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><ClipboardIcon width={15} height={15} /> Case List</h3>
           <div className="case-list-filters" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Search</div>
              <input
                className="search-input"
                placeholder="Patient or diagnosis…"
                value={search}
                onChange={(e) => set({ search: e.target.value })}
                style={{ width: 150 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Diagnosis</div>
              <select
                className="form-select"
                style={{ fontSize: 12, padding: '5px 8px', width: 170 }}
                value={diagFilter}
                onChange={(e) => set({ diagFilter: e.target.value })}
              >
                <option>All</option>
                {Object.keys(diagCount).sort().map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>From Date</div>
              <input
                className="form-input"
                type="date"
                value={dateFrom}
                onChange={(e) => set({ dateFrom: e.target.value })}
                style={{ width: 140, fontSize: 12, padding: '5px 8px' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>To Date</div>
              <input
                className="form-input"
                type="date"
                value={dateTo}
                onChange={(e) => set({ dateTo: e.target.value })}
                style={{ width: 140, fontSize: 12, padding: '5px 8px' }}
              />
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline inv-view-more-btn"
              onClick={() => setShowMore((v) => !v)}
              title="Show or hide User ID, Visit Type, and Medications columns"
              aria-label={showMore ? 'View Less — hide User ID, Visit Type, and Medications columns' : 'View More — show User ID, Visit Type, and Medications columns'}
            >
              {showMore ? <ChevronUpIcon width={13} height={13} /> : <ChevronDownIcon width={13} height={13} />}
              <span>{showMore ? 'View Less' : 'View More'}</span>
            </button>
          </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Patient</th>
                  {showMore && <th>User ID</th>}
                  <th>Date</th>
                  {showMore && <th>Visit Type</th>}
                  <th>Diagnosis</th>
                  {showMore && <th>Medications</th>}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={showMore ? 8 : 5} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                      No cases match filters
                    </td>
                  </tr>
                )}
                {filtered.map((c, i) => (
                  <tr key={c.consultation_id}>
                    <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{i + 1}</td>
                    <td>
                      <strong>{c.patient_name}</strong>
                    </td>
                    {showMore && (
                      <td>
                        <code style={{ fontSize: 11 }}>{c.student_number}</code>
                      </td>
                    )}
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(c.visit_date)}</td>
                    {showMore && (
                      <td>
                        <StatusBadge status={c.visit_type} />
                      </td>
                    )}
                    <td>
                      <span className="diag-pill">{c.diagnosis || (c.assessment || '').substring(0, 35) || '—'}</span>
                    </td>
                    {showMore && (
                      <td style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.medications || 'None'}
                      </td>
                    )}
                    <td>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => onView(c.consultation_id)} title="View" aria-label="View">
                        <EyeIcon width={13} height={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 18px', fontSize: 12, color: 'var(--text-3)' }}>
            Showing <strong>{filtered.length}</strong> of {totalCases} total cases
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 280, flexShrink: 0 }}>
          <div className="card">
            <div className="card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><TagIcon width={15} height={15} /> Cases by Diagnosis</h3>
            </div>
            <div style={{ padding: '10px 14px', maxHeight: 380, overflowY: 'auto' }}>
              {sortedDiags.length === 0 && (
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No data</div>
              )}
              {sortedDiags.map(([diag, count]) => {
                const pct = Math.round((count / totalCases) * 100)
                return (
                  <div className="diag-breakdown-row" key={diag} onClick={() => set({ diagFilter: diag })}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {diag}
                      </div>
                      <div className="diag-bar-wrap">
                        <div className="diag-bar-fill" style={{ transform: `scaleX(${pct / 100})` }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', marginLeft: 8, flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>{count}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{pct}%</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}