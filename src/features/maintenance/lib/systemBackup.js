import { listUsers } from '@services/usersService'
import { listDocumentRequests } from '@services/documentRequestsService'
import { listConsultations } from '@services/consultationsService'
import { listAuditLogs } from '@services/auditLogsService'
import { listInventory, listInventoryLogs } from '@services/inventoryService'
import { listMedicinesAsInventoryItems } from '@services/medicineService'

// What "System Backup" actually means here: there's no server-side DB
// dump available to a browser SPA running on the anon key (that needs
// direct Postgres/pg_dump access, or a Supabase Edge Function — neither
// exists in this project), so this pulls the same core tables the rest
// of the app already reads through their normal service functions and
// bundles them into one downloadable JSON file instead. Each of those
// functions already caps how much it fetches (users is the one genuinely
// unbounded table; document_requests/consultations/audit_logs/
// inventory_logs are each capped at 300–500 rows in their own service —
// see the comments there) — this backup inherits those same limits
// rather than trying to quietly bypass them, so it's honestly "the most
// recent slice of every core table," not a full historical archive.
const TABLES = [
  { key: 'users', label: 'Users & Profiles', fetch: () => listUsers() },
  { key: 'document_requests', label: 'Document Requests', fetch: () => listDocumentRequests() },
  { key: 'consultations', label: 'Consultations', fetch: () => listConsultations() },
  { key: 'inventory', label: 'Inventory Items', fetch: () => loadInventorySnapshot() },
  { key: 'inventory_logs', label: 'Inventory Logs', fetch: () => listInventoryLogs() },
  { key: 'audit_logs', label: 'Audit Logs', fetch: () => listAuditLogs() },
]

// Same legacy+medicine merge ReportsPage.jsx's Daily/Monthly Inventory
// reports already use — a plain listInventory() alone silently drops
// every medicine (they live in a separate, newer table).
async function loadInventorySnapshot() {
  const [legacy, medicines] = await Promise.all([listInventory(), listMedicinesAsInventoryItems()])
  return [...legacy.filter((i) => i.category !== 'Medicine'), ...medicines]
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Fetches every table in TABLES in parallel, bundles the result into one
// timestamped JSON file, and triggers the browser download. Returns
// { counts, filename } so the caller can show a toast and write the
// SYSTEM_BACKUP_INITIATED audit log entry with real record counts rather
// than a vague "backup created" with no detail.
export async function generateSystemBackup({ generatedByName } = {}) {
  const entries = await Promise.all(
    TABLES.map(async ({ key, fetch }) => {
      const rows = await fetch()
      return [key, rows]
    })
  )
  const tables = Object.fromEntries(entries)
  const counts = Object.fromEntries(entries.map(([key, rows]) => [key, rows.length]))

  const generatedAt = new Date()
  const payload = {
    backup_generated_at: generatedAt.toISOString(),
    generated_by: generatedByName || null,
    record_counts: counts,
    tables,
  }

  const filename = `bulsu-infirmary-backup_${generatedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
  downloadJson(filename, payload)

  return { counts, filename }
}

export { TABLES as SYSTEM_BACKUP_TABLES }