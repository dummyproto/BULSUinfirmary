import { useState } from 'react'
import { SaveIcon, DownloadIcon } from '@components/ui/icons'
import { SYSTEM_BACKUP_TABLES } from './lib/systemBackup'

export default function BackupTab({ onGenerateBackup, generating }) {
  const [lastResult, setLastResult] = useState(null) // { counts, filename } from the most recent backup this session

  async function handleClick() {
    const result = await onGenerateBackup()
    if (result) setLastResult(result)
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <SaveIcon width={15} height={15} /> System Backup &amp; Data Export
        </h3>
      </div>
      <div style={{ padding: 18 }}>
        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          Downloads a multi-sheet Excel (.xlsx) workbook — a Backup Info cover sheet, then one sheet per table: Users,
          Document Requests, Consultations, Inventory, Inventory Logs, and Audit Logs. Each table is capped at its
          usual page-list limit (300–500 most recent rows), same as everywhere else in the app, so this is a snapshot
          of recent activity rather than the full historical database.
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {SYSTEM_BACKUP_TABLES.map((t) => (
            <span key={t.key} className="badge badge-no-dot badge-gray">
              {t.label}
            </span>
          ))}
        </div>

        <button type="button" className="btn btn-blue" onClick={handleClick} disabled={generating}>
          <DownloadIcon width={14} height={14} /> {generating ? 'Preparing backup…' : 'Create System Backup'}
        </button>

        {lastResult && (
          <div style={{ marginTop: 16, padding: 14, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Last backup this session</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8, wordBreak: 'break-all' }}>{lastResult.filename}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SYSTEM_BACKUP_TABLES.map((t) => (
                <span key={t.key} className="badge badge-no-dot badge-blue">
                  {t.label}: {lastResult.counts[t.key] ?? 0}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}