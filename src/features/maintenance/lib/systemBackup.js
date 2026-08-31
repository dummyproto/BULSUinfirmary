import * as XLSX from 'xlsx'
import { listUsers } from '@services/usersService'
import { listDocumentRequests } from '@services/documentRequestsService'
import { listConsultations } from '@services/consultationsService'
import { listAuditLogs } from '@services/auditLogsService'
import { listInventory, listInventoryLogs } from '@services/inventoryService'
import { listMedicinesAsInventoryItems } from '@services/medicineService'
import { formatDate, formatDateTime } from '@lib/format'

// What "System Backup" actually means here: there's no server-side DB
// dump available to a browser SPA running on the anon key (that needs
// direct Postgres/pg_dump access, or a Supabase Edge Function — neither
// exists in this project), so this pulls the same core tables the rest
// of the app already reads through their normal service functions and
// bundles them into one downloadable .xlsx workbook instead — one sheet
// per table, so it opens directly in Excel/Sheets/LibreOffice as a
// proper multi-sheet spreadsheet rather than a single wall of JSON. Each
// of those functions already caps how much it fetches (users is the one
// genuinely unbounded table; document_requests/consultations/
// audit_logs/inventory_logs are each capped at 300–500 rows in their own
// service — see the comments there) — this backup inherits those same
// limits rather than trying to quietly bypass them, so it's honestly
// "the most recent slice of every core table," not a full historical
// archive.
//
// `columns` curates exactly which fields make it onto each sheet, and
// in what order/label — the raw row objects carry dozens of fields each
// (every patient_profiles column on every user row, internal ids,
// foreign keys, etc.), most of which are irrelevant or blank for any
// given row (e.g. a staff member's row still carries every
// patient-only profile field, just all null). Dumping the raw object
// straight into a sheet would produce a huge, mostly-empty, hard-to-
// read table — a short, deliberate column list is what actually makes
// this readable as a real report, the same reasoning ReportsPage.jsx's
// existing CSV exports already follow.
const TABLES = [
  {
    key: 'users',
    label: 'Users & Profiles',
    fetch: () => listUsers(),
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'username', header: 'Username' },
      { key: 'email', header: 'Email' },
      { key: 'role', header: 'Role' },
      { key: 'phone', header: 'Phone' },
    ],
  },
  {
    key: 'document_requests',
    label: 'Document Requests',
    fetch: () => listDocumentRequests(),
    columns: [
      { key: 'patient_name', header: 'Patient' },
      { key: 'student_number', header: 'Student Number' },
      { key: 'doc_type', header: 'Document Type' },
      { key: 'purpose', header: 'Purpose' },
      { key: 'status', header: 'Status' },
      { key: 'date_needed', header: 'Date Needed', format: formatDate },
      { key: 'processed_by_name', header: 'Processed By' },
      { key: 'created_at', header: 'Date Requested', format: formatDateTime },
    ],
  },
  {
    key: 'consultations',
    label: 'Consultations',
    fetch: () => listConsultations(),
    columns: [
      { key: 'patient_name', header: 'Patient' },
      { key: 'student_number', header: 'Student Number' },
      { key: 'visit_type', header: 'Visit Type' },
      { key: 'complaint', header: 'Chief Complaint' },
      { key: 'diagnosis', header: 'Diagnosis' },
      { key: 'medications', header: 'Medications' },
      { key: 'visit_date', header: 'Visit Date', format: formatDate },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory Items',
    fetch: () => loadInventorySnapshot(),
    columns: [
      { key: 'name', header: 'Item Name' },
      { key: 'category', header: 'Category' },
      { key: 'quantity', header: 'Quantity' },
      { key: 'unit', header: 'Unit' },
      { key: 'min_stock', header: 'Min Stock' },
      { key: 'expiration_date', header: 'Expiration Date', format: formatDate },
      { key: 'supplier', header: 'Supplier' },
    ],
  },
  {
    key: 'inventory_logs',
    label: 'Inventory Logs',
    fetch: () => listInventoryLogs(),
    columns: [
      { key: 'item_name', header: 'Item' },
      { key: 'action_type', header: 'Action' },
      { key: 'quantity_change', header: 'Qty Change' },
      { key: 'previous_quantity', header: 'Previous Qty' },
      { key: 'new_quantity', header: 'New Qty' },
      { key: 'staff_name', header: 'Staff' },
      { key: 'notes', header: 'Notes' },
      { key: 'created_at', header: 'Date', format: formatDateTime },
    ],
  },
  {
    key: 'audit_logs',
    label: 'Audit Logs',
    fetch: () => listAuditLogs(),
    columns: [
      { key: 'created_at', header: 'Date', format: formatDateTime },
      { key: 'user_name', header: 'User' },
      { key: 'action', header: 'Action' },
      { key: 'details', header: 'Details' },
    ],
  },
]

// Same legacy+medicine merge ReportsPage.jsx's Daily/Monthly Inventory
// reports already use — a plain listInventory() alone silently drops
// every medicine (they live in a separate, newer table).
async function loadInventorySnapshot() {
  const [legacy, medicines] = await Promise.all([listInventory(), listMedicinesAsInventoryItems()])
  return [...legacy.filter((i) => i.category !== 'Medicine'), ...medicines]
}

// Excel sheet names can't exceed 31 characters or contain \ / * ? : [ ] —
// none of this file's own labels actually hit either limit today, but
// sanitizing defensively means a future table added to TABLES with a
// longer/punctuated label can't silently corrupt the whole workbook
// (a bad sheet name is a hard write-time error in SheetJS, not a
// warning) just because nobody remembered this rule while adding it.
function safeSheetName(label) {
  return label.replace(/[\\/*?:[\]]/g, '-').slice(0, 31)
}

// Builds one sheet's full grid as an array-of-arrays: a title row
// ("Label (N records)"), a human-readable header row, then the actual
// data rows — matching a normal printed/report-style spreadsheet layout
// rather than a bare data table starting at row 1. aoa_to_sheet (not
// json_to_sheet) is what makes inserting that extra title row above the
// real headers possible at all.
function buildSheetRows(label, rows, columns) {
  const titleRow = [`${label} (${rows.length} record${rows.length === 1 ? '' : 's'})`]
  const headerRow = columns.map((c) => c.header)
  const dataRows = rows.map((row) =>
    columns.map((c) => {
      const value = row[c.key]
      if (value == null || value === '') return ''
      return c.format ? c.format(value) : value
    })
  )
  return [titleRow, headerRow, ...dataRows]
}

function buildWorkbook(tables, { generatedAt, generatedByName }) {
  const wb = XLSX.utils.book_new()

  // Cover sheet — carries what used to be top-level metadata on the old
  // JSON payload (backup_generated_at/generated_by). A workbook has no
  // equivalent "arbitrary custom metadata" slot the way a plain JS
  // object did, so this is a real sheet instead, first in the tab order.
  const infoRows = [
    ['Bulsu Infirmary — System Backup'],
    ['Generated At', formatDateTime(generatedAt)],
    ['Generated By', generatedByName || 'Unknown'],
    [],
    ['Table', 'Records'],
    ...tables.map((t) => [t.label, t.rows.length]),
  ]
  const infoWs = XLSX.utils.aoa_to_sheet(infoRows)
  infoWs['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
  infoWs['!cols'] = [{ wch: 28 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, infoWs, 'Backup Info')

  for (const { label, columns, rows } of tables) {
    const aoa = buildSheetRows(label, rows, columns)
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    // Merges the title row across every data column so it visually reads
    // as a report heading (matching the reference layout) rather than a
    // title crammed into column A alone with the rest of the row blank.
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(columns.length - 1, 0) } }]
    // Column widths sized off the longer of each column's own header or
    // its longest actual value (capped at 60 so one long Notes/Details
    // entry can't blow out the whole sheet's readability) — Excel's own
    // "AutoFit Column Width" default is unhelpfully narrow for anything
    // beyond short single-word headers otherwise.
    ws['!cols'] = columns.map((c, i) => {
      const headerLen = c.header.length
      const longestValue = aoa.slice(2).reduce((max, row) => Math.max(max, String(row[i] ?? '').length), 0)
      return { wch: Math.min(Math.max(headerLen, longestValue) + 2, 60) }
    })
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(label))
  }
  return wb
}

function downloadXlsx(filename, workbook) {
  XLSX.writeFile(workbook, filename)
}

// Fetches every table in TABLES in parallel, builds one multi-sheet
// .xlsx workbook, and triggers the browser download. Returns
// { counts, filename } so the caller can show a toast and write the
// SYSTEM_BACKUP_INITIATED audit log entry with real record counts rather
// than a vague "backup created" with no detail.
export async function generateSystemBackup({ generatedByName } = {}) {
  const entries = await Promise.all(
    TABLES.map(async (table) => {
      const rows = await table.fetch()
      return { ...table, rows }
    })
  )
  const counts = Object.fromEntries(entries.map((t) => [t.key, t.rows.length]))

  const generatedAt = new Date()
  const workbook = buildWorkbook(entries, { generatedAt, generatedByName })
  // Timestamp reused in the filename too (same format as the old JSON
  // version) for easy sorting/identification without opening the file.
  const filename = `bulsu-infirmary-backup_${generatedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.xlsx`
  downloadXlsx(filename, workbook)

  return { counts, filename }
}

export { TABLES as SYSTEM_BACKUP_TABLES }