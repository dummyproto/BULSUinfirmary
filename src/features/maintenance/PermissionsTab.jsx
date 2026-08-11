import { PRINT_PERMISSIONS } from './data/formOptions'
import Toggle from '@components/ui/Toggle'
import { ShieldIcon } from '@components/ui/icons'

export default function PermissionsTab({ users, onTogglePerm }) {
  const staff = users.filter((u) => u.role === 'staff')

  return (
    <div className="card">
      <div className="card-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><ShieldIcon width={15} height={15} /> Staff Permissions</h3>
      </div>
      <div style={{ padding: 18 }}>
        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          Configure which staff members can print specific document types, reset the Reports page, and delete log/record
          entries. Hover any permission with "(hover for details)" next to it for the full list of what it covers.
        </div>
        {staff.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-3)' }}>No staff accounts</div>}
        {staff.map((su) => (
          <div key={su.user_id} style={{ marginBottom: 18, padding: 14, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>{su.name}</div>
            {PRINT_PERMISSIONS.map(([key, label, detail]) => (
              <div className="perm-row" key={key} title={detail || undefined}>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {label}
                  {detail && <span style={{ color: 'var(--text-3)', marginLeft: 5 }}>(hover for details)</span>}
                </span>
                <Toggle checked={!!su.permissions?.[key]} onChange={() => onTogglePerm(su.user_id, key)} label={`${label} for ${su.name}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}