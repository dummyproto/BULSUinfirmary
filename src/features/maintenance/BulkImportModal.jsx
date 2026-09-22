import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import Modal from '@components/ui/Modal'
import { validatePassword } from './lib/userHelpers'
import { FileSpreadsheetIcon, DownloadIcon, CheckCircleIcon, XCircleIcon, MailIcon } from '@components/ui/icons'

// Column headers the template ships with, and the row keys they map to.
// Matched case-insensitively (and with spaces/underscores collapsed) so a
// slightly-renamed header in a re-saved CSV still lines up correctly.
//
// Password IS used: it becomes each row's initial login password (mode:
// 'password' in MaintenancePage.jsx's handleBulkImportUsers). The account
// is still created unconfirmed and gets a verification email regardless
// — the CSV password just replaces "the new user picks their own via the
// email link" with "here's their starting password, they can change it
// later in Account Settings."
const COLUMNS = [
  { key: 'fullName', label: 'Full Name', required: true },
  { key: 'email', label: 'Email', required: true },
  { key: 'userId', label: 'User ID', required: true },
  { key: 'password', label: 'Password', required: true },
  { key: 'course', label: 'Course', required: false },
  { key: 'yearLevel', label: 'Year Level', required: false },
  { key: 'guardianFullName', label: 'Guardian Full Name', required: false },
  { key: 'relationship', label: 'Guardian Relationship', required: false },
  { key: 'contactNumber', label: 'Guardian Contact Number', required: false },
]

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[\s_]+/g, '')
}

const HEADER_LOOKUP = COLUMNS.reduce((acc, c) => {
  acc[normalizeHeader(c.label)] = c.key
  acc[normalizeHeader(c.key)] = c.key
  return acc
}, {})

function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.label)])
  XLSX.utils.book_append_sheet(wb, ws, 'Patients')
  XLSX.writeFile(wb, 'bulk-patient-import-template.csv')
}

function validateRow(row, rowNumber, existingUsers, seenEmails, seenUserIds) {
  const errors = []
  for (const col of COLUMNS) {
    if (col.required && !String(row[col.key] || '').trim()) errors.push(`${col.label} is required`)
  }
  const email = String(row.email || '').trim().toLowerCase()
  const userId = String(row.userId || '').replace(/[\s-]/g, '').toUpperCase()

  if (email) {
    if (existingUsers.some((u) => u.email?.toLowerCase() === email)) errors.push('Email already registered')
    else if (seenEmails.has(email)) errors.push('Duplicate email in this file')
  }
  if (userId) {
    if (existingUsers.some((u) => u.student_number?.toUpperCase() === userId)) errors.push('User ID already registered')
    else if (seenUserIds.has(userId)) errors.push('Duplicate User ID in this file')
  }
  if (row.password) {
    const pw = validatePassword(row.password)
    if (!pw.ok) errors.push(pw.msg)
  }
  return errors
}

export default function BulkImportModal({ isOpen, existingUsers, onClose, onImport, onError }) {
  const fileRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([]) // [{ rowNumber, ...fields, errors: [] }]
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null) // { createdCount, failedRows }

  const validRows = rows.filter((r) => r.errors.length === 0)
  const invalidCount = rows.length - validRows.length

  function reset() {
    setFileName('')
    setRows([])
    setImporting(false)
    setProgress({ done: 0, total: 0 })
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    if (importing) return
    reset()
    onClose()
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
        if (aoa.length < 2) {
          onError('The file has no data rows below the header.')
          setRows([])
          return
        }
        const headerRow = aoa[0].map(normalizeHeader)
        const keyForCol = headerRow.map((h) => HEADER_LOOKUP[h] || null)

        const seenEmails = new Set()
        const seenUserIds = new Set()
        const parsed = aoa.slice(1).map((line, idx) => {
          const row = { rowNumber: idx + 2 }
          keyForCol.forEach((key, colIdx) => {
            if (key) row[key] = String(line[colIdx] ?? '').trim()
          })
          const errors = validateRow(row, row.rowNumber, existingUsers, seenEmails, seenUserIds)
          if (row.email) seenEmails.add(row.email.toLowerCase())
          if (row.userId) seenUserIds.add(row.userId.replace(/[\s-]/g, '').toUpperCase())
          return { ...row, errors }
        })
        setRows(parsed)
      } catch {
        onError('Could not read that file. Make sure it\u2019s a CSV or Excel file saved from the template.')
        setRows([])
      }
    }
    reader.readAsBinaryString(file)
  }

  async function handleImport() {
    if (validRows.length === 0) return
    setImporting(true)
    setProgress({ done: 0, total: validRows.length })
    try {
      const res = await onImport(validRows, (done, total) => setProgress({ done, total }))
      setResult(res)
      setRows([])
    } catch (err) {
      onError(`Bulk import failed: ${err.message}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Users via CSV"
      icon={<FileSpreadsheetIcon width={16} height={16} />}
      wide
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={handleClose} disabled={importing}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button type="button" className="btn btn-blue" onClick={handleImport} disabled={importing || validRows.length === 0}>
              {importing ? `Importing… (${progress.done}/${progress.total})` : `Import ${validRows.length || ''} Valid Row${validRows.length === 1 ? '' : 's'}`}
            </button>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="alert alert-info">
          Bulk-import patient (student/personnel) accounts from a CSV or Excel file. Each row needs at least Full Name,
          Email, User ID, and Password (their initial password — they can change it later in Account Settings).
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <MailIcon width={12} height={12} /> Each new account gets a verification email at the address in that row —
            the account can't log in until it's confirmed.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={downloadTemplate} disabled={importing}>
            <DownloadIcon width={13} height={13} /> Download Template
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} disabled={importing} style={{ fontSize: 12.5 }} />
          {fileName && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{fileName}</span>}
        </div>

        {result && (
          <div className={`alert ${result.failedRows.length === 0 ? 'alert-success' : 'alert-warning'}`}>
            <strong>{result.createdCount}</strong> account{result.createdCount === 1 ? '' : 's'} created — a verification
            email was sent to each; they can't log in until it's confirmed.
            {result.failedRows.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {result.failedRows.length} row{result.failedRows.length === 1 ? '' : 's'} failed:
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                  {result.failedRows.map((f) => (
                    <li key={f.rowNumber}>
                      Row {f.rowNumber} ({f.email}): {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!result && rows.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 14, fontSize: 12.5 }}>
              <span style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CheckCircleIcon width={13} height={13} /> {validRows.length} valid
              </span>
              {invalidCount > 0 && (
                <span style={{ color: 'var(--danger, #EF4444)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <XCircleIcon width={13} height={13} /> {invalidCount} with errors (won't be imported)
                </span>
              )}
            </div>

            {importing && (
              <div style={{ height: 8, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                    background: 'var(--primary, #1B6FE8)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            )}

            <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="compact-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>User ID</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNumber}>
                      <td>{r.rowNumber}</td>
                      <td style={{ fontSize: 12 }}>{r.fullName || '—'}</td>
                      <td style={{ fontSize: 12 }}>{r.email || '—'}</td>
                      <td style={{ fontSize: 12 }}>
                        <code style={{ fontSize: 11 }}>{r.userId || '—'}</code>
                      </td>
                      <td style={{ fontSize: 11.5 }}>
                        {r.errors.length === 0 ? (
                          <span style={{ color: 'var(--success)' }}>Ready</span>
                        ) : (
                          <span style={{ color: 'var(--danger, #EF4444)' }} title={r.errors.join('; ')}>
                            {r.errors[0]}
                            {r.errors.length > 1 ? ` (+${r.errors.length - 1} more)` : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}