import StatusBadge from '@components/ui/StatusBadge'
import SearchInput from '@components/ui/SearchInput'
import { formatDate } from '@lib/format'
import { FolderIcon, PrinterIcon, EyeIcon } from '@components/ui/icons'

export default function EHRRecordsTab({ consultations, search, onSearchChange, onView, onPrint }) {
  const q = search.toLowerCase()
  const filtered = search
    ? consultations.filter(
        (c) =>
          (c.patient_name || '').toLowerCase().includes(q) ||
          (c.diagnosis || c.assessment || '').toLowerCase().includes(q) ||
          (c.chief_complaint || '').toLowerCase().includes(q)
      )
    : consultations

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><FolderIcon width={15} height={15} /> Health Records</h3>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={onSearchChange} placeholder="Search records…" width={200} />
          <button type="button" className="btn btn-sm btn-blue" onClick={onPrint}>
            <PrinterIcon width={13} height={13} /> Print Report
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>User ID</th>
              <th>Date</th>
              <th>Visit Type</th>
              <th>Diagnosis</th>
              <th>Main Complaint</th>
              <th>Medications</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                  No records found
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.consultation_id}>
                <td>
                  <strong>{c.patient_name}</strong>
                </td>
                <td>
                  <code style={{ fontSize: 11 }}>{c.student_number}</code>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(c.visit_date)}</td>
                <td>
                  <StatusBadge status={c.visit_type} />
                </td>
                <td style={{ maxWidth: 160 }}>
                  <span className="diag-pill">{c.diagnosis || c.assessment.substring(0, 40)}</span>
                </td>
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
