// Every export function here consumes the exact same generic report
// shape already established by PrintPreviewModal / printReport.js
// ({title, headers, rows, from, to}) — Print already worked this way,
// so PDF/Excel/CSV just add new outputs for data that's already shaped
// correctly, rather than inventing a second report-data contract.
//
// jspdf/jspdf-autotable/xlsx are dynamically imported inside each
// function rather than statically at the top of this file — together
// they're a genuinely heavy dependency (jsPDF pulls in html2canvas), and
// most report views are Print or CSV, not PDF/Excel. Static imports
// would bundle ~700KB into the Reports page's initial chunk even for
// someone who never clicks those two buttons; dynamic imports mean that
// weight is only ever downloaded the moment it's actually needed.

function filenameFor(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export async function exportToPDF({ title, headers, rows, from, to }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' })
  doc.setFontSize(14)
  doc.text(title, 14, 16)
  doc.setFontSize(9)
  doc.setTextColor(120)
  const subtitle = from && to ? `Period: ${from} to ${to}` : `Generated: ${new Date().toLocaleString()}`
  doc.text(subtitle, 14, 22)
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 27,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 123, 94] },
  })
  doc.save(`${filenameFor(title)}.pdf`)
}

export async function exportToExcel({ title, headers, rows }) {
  const XLSX = await import('xlsx')
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report')
  XLSX.writeFile(workbook, `${filenameFor(title)}.xlsx`)
}

function csvEscape(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// CSV needs no library at all — kept synchronous, unlike the two above.
export function exportToCSV({ title, headers, rows }) {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filenameFor(title)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Combines multiple differently-shaped tables into ONE downloadable CSV
// file — used by Audit Trail's "Export All Records (CSV)" (see
// AuditTrailPage.jsx's handleExportAllCSV) to bundle Users & Profiles,
// Document Requests, Consultations, Inventory Items, Inventory Logs, and
// Audit Logs into a single file rather than six separate downloads. CSV
// is inherently a flat, single-table format — this uses the same
// convention any spreadsheet tool (Excel, Sheets) already opens fine:
// each table gets its own titled section (with its own row count), its
// own header row directly below that, then its data rows, with a blank
// line separating it from the next section. Reuses csvEscape so every
// value anywhere in the file is escaped exactly the same way the
// existing single-table exportToCSV above already does.
export function exportMultiSectionCSV({ title, sections }) {
  const blocks = sections.map(({ label, headers, rows }) => {
    const lines = [[`${label} (${rows.length} record${rows.length === 1 ? '' : 's'})`], headers, ...rows]
    return lines.map((row) => row.map(csvEscape).join(',')).join('\n')
  })
  const blob = new Blob([blocks.join('\n\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filenameFor(title)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
