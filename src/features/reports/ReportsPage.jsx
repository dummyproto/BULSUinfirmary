import { useEffect, useRef, useState } from 'react'
import { useToast } from '@context/ToastContext'
import Spinner from '@components/ui/Spinner'
import { formatDate, formatDateTime } from '@lib/format'
import { getInventoryStatus, daysUntil } from '@features/inventory/lib/inventoryHelpers'
import { listInventory, listInventoryLogsInRange } from '@services/inventoryService'
import { listDocumentRequests } from '@services/documentRequestsService'
import { listConsultations } from '@services/consultationsService'
import { listAuditLogs } from '@services/auditLogsService'
import { listMedicinesAsInventoryItems, listReceivingRecordsInRange, listSuppliers, getMonthlyMovement } from '@services/medicineService'
import { exportToPDF, exportToExcel, exportToCSV } from './lib/exportReport'
import PrintPreviewModal from './PrintPreviewModal'
import { BarChartIcon, RefreshCwIcon, PrinterIcon, FileTextIcon, FileSpreadsheetIcon, DownloadIcon } from '@components/ui/icons'

// Clinic-wide reports (unchanged — still eagerly loaded on mount, exactly
// as before) vs. Inventory reports (Phase 11 — loaded lazily, on demand,
// only for the specific data a given report type actually needs; see
// loadInventoryData below).
const CLINIC_REPORT_TYPES = [
  { value: 'doc', label: 'Document Requests' },
  { value: 'consultation', label: 'Consultations / Health Records' },
  { value: 'audit', label: 'Audit Logs' },
]
const INVENTORY_REPORT_TYPES = [
  { value: 'daily-inventory', label: 'Daily Inventory' },
  { value: 'monthly-inventory', label: 'Monthly Inventory' },
  { value: 'expired-items', label: 'Expired Items' },
  { value: 'low-stock', label: 'Low Stock' },
  { value: 'inventory-movement', label: 'Inventory Movement' },
  { value: 'receiving-history', label: 'Receiving History' },
  { value: 'supplier-deliveries', label: 'Supplier Deliveries' },
]
const INVENTORY_TYPE_VALUES = new Set(INVENTORY_REPORT_TYPES.map((t) => t.value))

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function firstOfMonthStr() {
  return todayStr().slice(0, 7) + '-01'
}

function buildClinicReport(type, from, to, { docs, consultations, auditLogs }) {
  if (type === 'doc') {
    const data = docs.filter((d) => d.date_requested >= from && d.date_requested <= to)
    return {
      title: 'Document Requests Report',
      headers: ['Patient', 'User ID', 'Document Type', 'Date Requested', 'Date Needed', 'Status'],
      rows: data.map((d) => [d.patient_name, d.student_number, d.doc_type, formatDate(d.date_requested), formatDate(d.date_needed), d.status]),
      summary: [
        { label: 'Total Requests', value: data.length },
        { label: 'Pending', value: data.filter((d) => d.status === 'Pending').length, color: 'var(--warning)' },
        { label: 'Approved', value: data.filter((d) => d.status === 'Approved').length, color: 'var(--success)' },
      ],
    }
  }
  if (type === 'consultation') {
    const data = consultations.filter((c) => c.visit_date >= from && c.visit_date <= to)
    return {
      title: 'Consultation Records Report',
      headers: ['Patient', 'User ID', 'Date', 'Visit Type', 'Main Complaint', 'Assessment'],
      rows: data.map((c) => [
        c.patient_name,
        c.student_number,
        formatDate(c.visit_date),
        c.visit_type,
        c.chief_complaint,
        (c.assessment || '').length > 50 ? c.assessment.slice(0, 50) + '…' : c.assessment,
      ]),
    }
  }
  if (type === 'audit') {
    const data = auditLogs.filter((l) => l.created_at?.slice(0, 10) >= from && l.created_at?.slice(0, 10) <= to)
    return {
      title: 'Audit Log Report',
      headers: ['Date/Time', 'Staff', 'Action', 'Details'],
      rows: data.map((l) => [new Date(l.created_at).toLocaleString('en-PH'), l.user_name, l.action, l.details]),
    }
  }
  return null
}

// Merges legacy `inventory` (Supply/Equipment) with the normalized
// medicines list — the exact same merge InventoryPage.jsx has used since
// Phase 3. The OLD version of this report called `listInventory()` alone,
// which silently excluded every medicine added after Phase 2/3 — a real,
// confirmed bug fixed as part of this phase (see KNOWN_ISSUES.md).
async function loadInventorySnapshot() {
  const [legacy, medicines] = await Promise.all([listInventory(), listMedicinesAsInventoryItems()])
  return [...legacy.filter((i) => i.category !== 'Medicine'), ...medicines]
}

export default function ReportsPage() {
  const { show } = useToast()
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [reportType, setReportType] = useState('doc')
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr())
  const [dateTo, setDateTo] = useState(todayStr())
  const [report, setReport] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [exporting, setExporting] = useState(null)
  const [source, setSource] = useState({ docs: [], consultations: [], auditLogs: [] })

  // Inventory-only cache — populated lazily the first time it's actually
  // needed, reused across report generations within the same visit so
  // switching between Daily/Expired/Low Stock (all built from the same
  // underlying snapshot) doesn't refetch it three times. Date-ranged data
  // (movement, receiving) is cached per exact (from,to) key instead, since
  // changing the date range genuinely does need a fresh query.
  const invCache = useRef({ snapshot: null, suppliers: null, ranged: {} })

  useEffect(() => {
    let cancelled = false
    Promise.all([listDocumentRequests(), listConsultations(), listAuditLogs()])
      .then(([docs, consultations, auditLogs]) => {
        if (!cancelled) setSource({ docs, consultations, auditLogs })
      })
      .catch((err) => show(`Failed to load report data: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function getSnapshot() {
    if (!invCache.current.snapshot) invCache.current.snapshot = await loadInventorySnapshot()
    return invCache.current.snapshot
  }
  async function getSuppliersCached() {
    if (!invCache.current.suppliers) invCache.current.suppliers = await listSuppliers()
    return invCache.current.suppliers
  }
  async function getRangedReceiving(from, to) {
    const key = `recv:${from}:${to}`
    if (!invCache.current.ranged[key]) invCache.current.ranged[key] = await listReceivingRecordsInRange(from, to)
    return invCache.current.ranged[key]
  }
  async function getRangedLogs(from, to) {
    const key = `log:${from}:${to}`
    if (!invCache.current.ranged[key]) invCache.current.ranged[key] = await listInventoryLogsInRange(from, to)
    return invCache.current.ranged[key]
  }

  async function buildInventoryReport(type, from, to) {
    if (type === 'daily-inventory' || type === 'expired-items' || type === 'low-stock') {
      const snapshot = await getSnapshot()
      if (type === 'expired-items') {
        const data = snapshot.filter((i) => getInventoryStatus(i) === 'Expired')
        return {
          title: 'Expired Items Report',
          headers: ['Item', 'Category', 'Quantity', 'Unit', 'Expiration Date', 'Days Expired'],
          rows: data.map((i) => {
            const days = -daysUntil(i.expiration_date)
            return [i.name, i.category, String(i.quantity), i.unit, formatDate(i.expiration_date), String(days)]
          }),
          summary: [{ label: 'Expired Items', value: data.length, color: 'var(--danger)' }],
        }
      }
      if (type === 'low-stock') {
        const data = snapshot.filter((i) => ['Low Stock', 'Critical Stock', 'Out of Stock'].includes(getInventoryStatus(i)))
        return {
          title: 'Low Stock Report',
          headers: ['Item', 'Category', 'Quantity', 'Unit', 'Min Stock', 'Status'],
          rows: data.map((i) => [i.name, i.category, String(i.quantity), i.unit, String(i.min_stock), getInventoryStatus(i)]),
          summary: [
            { label: 'Out of Stock', value: data.filter((i) => getInventoryStatus(i) === 'Out of Stock').length, color: 'var(--danger)' },
            { label: 'Critical Stock', value: data.filter((i) => getInventoryStatus(i) === 'Critical Stock').length, color: 'var(--danger)' },
            { label: 'Low Stock', value: data.filter((i) => getInventoryStatus(i) === 'Low Stock').length, color: 'var(--warning)' },
          ],
        }
      }
      // daily-inventory: full current snapshot. "Daily" reflects the
      // live current state as of today, not a reconstructed historical
      // point-in-time — there's no stored per-day snapshot to reconstruct
      // from, and replaying the full movement log to derive one would be
      // both expensive and, for a report meant to be generated fresh each
      // day, unnecessary: "today's report" IS today's live data.
      return {
        title: 'Daily Inventory Report',
        headers: ['Item', 'Category', 'Quantity', 'Unit', 'Min Stock', 'Status', 'Expiration'],
        rows: snapshot.map((i) => [i.name, i.category, String(i.quantity), i.unit, String(i.min_stock), getInventoryStatus(i), i.expiration_date ? formatDate(i.expiration_date) : 'N/A']),
        summary: [
          { label: 'Items Tracked', value: snapshot.length },
          { label: 'Low/Critical/Out', value: snapshot.filter((i) => ['Low Stock', 'Critical Stock', 'Out of Stock'].includes(getInventoryStatus(i))).length, color: 'var(--warning)' },
          { label: 'Expired', value: snapshot.filter((i) => getInventoryStatus(i) === 'Expired').length, color: 'var(--danger)' },
        ],
      }
    }

    if (type === 'monthly-inventory') {
      const snapshot = await getSnapshot()
      const monthDate = to.slice(0, 7) + '-01'
      const movement = await getMonthlyMovement(1) // just the current month bucket, computed server-side (Phase 10)
      const thisMonth = movement.find((m) => String(m.month).slice(0, 7) === monthDate.slice(0, 7))
      return {
        title: 'Monthly Inventory Report',
        headers: ['Item', 'Category', 'Quantity', 'Unit', 'Min Stock', 'Status', 'Expiration'],
        rows: snapshot.map((i) => [i.name, i.category, String(i.quantity), i.unit, String(i.min_stock), getInventoryStatus(i), i.expiration_date ? formatDate(i.expiration_date) : 'N/A']),
        summary: [
          { label: 'Items Tracked', value: snapshot.length },
          { label: 'Received This Month', value: thisMonth?.received_qty ?? 0, color: 'var(--success)' },
          { label: 'Released This Month', value: thisMonth?.released_qty ?? 0, color: 'var(--danger)' },
        ],
      }
    }

    if (type === 'inventory-movement') {
      const logs = await getRangedLogs(from, to)
      return {
        title: 'Inventory Movement Report',
        headers: ['Date/Time', 'Item', 'Action', 'Qty Change', 'Previous', 'New', 'Staff', 'Notes'],
        rows: logs.map((l) => [
          formatDateTime(l.created_at),
          l.item_name || '—',
          l.action_type,
          l.quantity_change > 0 ? `+${l.quantity_change}` : String(l.quantity_change),
          l.previous_quantity ?? '—',
          l.new_quantity ?? '—',
          l.staff_name || '—',
          l.notes || '',
        ]),
        summary: [
          { label: 'Total Movements', value: logs.length },
          { label: 'Received', value: logs.filter((l) => ['Received', 'Replenish'].includes(l.action_type) && l.quantity_change > 0).length, color: 'var(--success)' },
          { label: 'Released', value: logs.filter((l) => ['Released', 'Release'].includes(l.action_type)).length, color: 'var(--danger)' },
        ],
      }
    }

    if (type === 'receiving-history') {
      const records = await getRangedReceiving(from, to)
      return {
        title: 'Receiving History Report',
        headers: ['Date Received', 'Medicine', 'Batch', 'Supplier', 'Invoice #', 'Quantity', 'Received By'],
        rows: records.map((r) => [formatDate(r.received_date), r.medicine_name, r.batch?.batch_number || '—', r.supplier_name || '—', r.invoice_number || '—', `${r.quantity} ${r.unit}`, r.received_by_name]),
        summary: [
          { label: 'Deliveries', value: records.length },
          { label: 'Total Units Received', value: records.reduce((sum, r) => sum + r.quantity, 0), color: 'var(--success)' },
        ],
      }
    }

    if (type === 'supplier-deliveries') {
      // Reuses the exact same receiving_records fetch as Receiving
      // History above (same cache key for the same date range) — a
      // supplier-grouped view of the same underlying data, not a
      // separate query.
      const [records, suppliers] = await Promise.all([getRangedReceiving(from, to), getSuppliersCached()])
      const bySupplier = new Map()
      for (const r of records) {
        const key = r.supplier_id || 'unknown'
        if (!bySupplier.has(key)) bySupplier.set(key, { deliveries: 0, totalQty: 0, lastDate: null })
        const g = bySupplier.get(key)
        g.deliveries++
        g.totalQty += r.quantity
        if (!g.lastDate || r.received_date > g.lastDate) g.lastDate = r.received_date
      }
      const rows = [...bySupplier.entries()]
        .map(([supplierId, g]) => {
          const s = suppliers.find((sup) => sup.supplier_id === supplierId)
          return [s?.supplier_name || 'Unknown Supplier', s?.contact_person || '—', s?.phone || '—', String(g.deliveries), String(g.totalQty), formatDate(g.lastDate)]
        })
        .sort((a, b) => Number(b[4]) - Number(a[4]))
      return {
        title: 'Supplier Deliveries Report',
        headers: ['Supplier', 'Contact Person', 'Phone', 'Deliveries', 'Total Quantity', 'Last Delivery'],
        rows,
        summary: [
          { label: 'Suppliers Involved', value: bySupplier.size },
          { label: 'Total Deliveries', value: records.length },
        ],
      }
    }
    return null
  }

  async function handleGenerate() {
    if (!dateFrom || !dateTo) return show('Please select both date range fields', 'error')
    if (dateFrom > dateTo) return show('Date From must be before or equal to Date To', 'error')
    setGenerating(true)
    try {
      const result = INVENTORY_TYPE_VALUES.has(reportType) ? await buildInventoryReport(reportType, dateFrom, dateTo) : buildClinicReport(reportType, dateFrom, dateTo, source)
      setReport({ ...result, from: dateFrom, to: dateTo })
    } catch (err) {
      show(`Failed to generate report: ${err.message}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  function handleReset() {
    setReportType('doc')
    setDateFrom(firstOfMonthStr())
    setDateTo(todayStr())
    setReport(null)
  }

  async function handleExport(format, fn) {
    setExporting(format)
    try {
      await fn(report)
    } catch (err) {
      show(`Failed to export: ${err.message}`, 'error')
    } finally {
      setExporting(null)
    }
  }

  if (loading) return <Spinner label="Loading report data…" />

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Clinic Reports</h2>
          <p>Filter by date range to generate focused reports</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <BarChartIcon width={15} height={15} /> Report Configuration
          </h3>
          <button type="button" className="btn btn-sm btn-outline" onClick={handleReset}>
            <RefreshCwIcon width={13} height={13} /> Reset
          </button>
        </div>
        <div style={{ padding: 18, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ minWidth: 200 }}>
            <label>REPORT TYPE</label>
            <select className="form-select" value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <optgroup label="Clinic">
                {CLINIC_REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Inventory">
                {INVENTORY_REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="form-group">
            <label>DATE FROM *</label>
            <input className="form-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>DATE TO *</label>
            <input className="form-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-blue" onClick={handleGenerate} disabled={generating}>
              <BarChartIcon width={13} height={13} /> {generating ? 'Generating…' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {!report ? (
        <div className="empty-state" style={{ padding: 40 }}>
          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center', color: 'var(--text-3)' }}>
            <BarChartIcon width={36} height={36} />
          </div>
          <p>Select a report type and date range, then click Generate Report.</p>
        </div>
      ) : (
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3>{report.title}</h3>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Period: {formatDate(report.from)} to {formatDate(report.to)} — {report.rows.length} record(s)
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setPreviewOpen(true)}>
                <PrinterIcon width={13} height={13} /> Print
              </button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => handleExport('pdf', exportToPDF)} disabled={exporting !== null}>
                <FileTextIcon width={13} height={13} /> {exporting === 'pdf' ? 'Preparing…' : 'PDF'}
              </button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => handleExport('excel', exportToExcel)} disabled={exporting !== null}>
                <FileSpreadsheetIcon width={13} height={13} /> {exporting === 'excel' ? 'Preparing…' : 'Excel'}
              </button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => exportToCSV(report)}>
                <DownloadIcon width={13} height={13} /> CSV
              </button>
            </div>
          </div>
          {report.summary && (
            <div style={{ padding: 14 }}>
              <div className="report-summary">
                {report.summary.map((s) => (
                  <div className="rscard" key={s.label}>
                    <div className="num" style={s.color ? { color: s.color } : undefined}>
                      {s.value}
                    </div>
                    <div className="lbl">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {report.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 && (
                  <tr>
                    <td colSpan={report.headers.length} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
                      No records in selected date range
                    </td>
                  </tr>
                )}
                {report.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PrintPreviewModal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} reportData={report} />
    </>
  )
}
