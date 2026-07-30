import Modal from '@components/ui/Modal'
import { formatDate } from '@lib/format'
import { openPrintWindow } from './lib/printReport'
import { PrinterIcon } from '@components/ui/icons'

export default function PrintPreviewModal({ isOpen, onClose, reportData }) {
  if (!reportData) return null
  const { title, headers, rows, from, to } = reportData
  const now = new Date().toLocaleString('en-PH')

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-blue"
            onClick={() => openPrintWindow(title, headers, rows, `Period: ${formatDate(from)} to ${formatDate(to)}`, now)}
          >
            <PrinterIcon width={13} height={13} /> Print
          </button>
        </>
      }
    >
      <div className="print-preview-page">
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>
          Generated: {now} · {rows.length} record(s)
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          Period: {formatDate(from)} to {formatDate(to)}
        </div>
        <div className="table-wrap">
          <table className="print-preview-table">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={headers.length} style={{ textAlign: 'center', padding: 20, color: 'var(--text-3)' }}>
                    No records in selected date range
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
