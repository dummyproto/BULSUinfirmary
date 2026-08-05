import Modal from '@components/ui/Modal'
import StatusBadge from '@components/ui/StatusBadge'
import { ConsultationIcon, PrinterIcon, BarChartIcon, InventoryIcon } from '@components/ui/icons'
import { formatDate } from '@lib/format'

export default function HealthDetailModal({ isOpen, onClose, consultation, attendedByName, deductionLogs, onPrint }) {
  if (!consultation) return null
  const c = consultation

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Health Record Details"
      icon={<ConsultationIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-blue" onClick={onPrint}>
            <PrinterIcon width={13} height={13} /> Print Record
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--primary-light)', borderRadius: 10, marginBottom: 16 }}>
        <div style={{ color: 'var(--primary)' }}><ConsultationIcon width={32} height={32} /></div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{c.patient_name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            ID: {c.student_number} · {formatDate(c.visit_date)} · <StatusBadge status={c.visit_type} />
          </div>
        </div>
      </div>

      {c.diagnosis && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>DIAGNOSIS</div>
          <span
            style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg,#6A3FA0,#1E7B5E)',
              color: 'white',
              padding: '6px 16px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {c.diagnosis}
          </span>
        </div>
      )}

      <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><BarChartIcon width={12} height={12} /> VITAL SIGNS</div>
        <div className="vital-signs-grid" style={{ textAlign: 'center' }}>
          {[
            ['BP', c.bp || '—', 'mmHg'],
            ['Temp', c.temp || '—', '°C'],
            ['Pulse', c.pulse || '—', 'bpm'],
            ['O₂ Sat', c.o2sat || '—', '%'],
          ].map(([l, v, u]) => (
            <div key={l}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{v}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                {l} {u}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="detail-row">
        <span className="detail-label">Main Complaint</span>
        <span className="detail-value">{c.chief_complaint}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Assessment / Notes</span>
        <span className="detail-value">{c.assessment}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Medications</span>
        <span className="detail-value">
          {c.prescribed_meds?.length > 0 ? (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Medicine</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Dosage</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Frequency</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {c.prescribed_meds.map((m) => (
                  <tr key={m.name}>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>{m.name}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>{m.dosage || '—'}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>{m.frequency || '—'}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontWeight: 700 }}>{m.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            c.medications || 'None'
          )}
        </span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Follow-up</span>
        <span className="detail-value">
          {c.follow_up_date ? formatDate(c.follow_up_date) : 'None'}
          {c.follow_up_notes ? ` — ${c.follow_up_notes}` : ''}
        </span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Attended By</span>
        <span className="detail-value">{attendedByName || '—'}</span>
      </div>

      {deductionLogs?.length > 0 && (
        <div style={{ marginTop: 14, padding: '12px 16px', background: '#ECFDF5', border: '1px solid #86EFAC', borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#065F46', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <InventoryIcon width={12} height={12} /> INVENTORY RELEASE ({deductionLogs.length} items)
          </div>
          {deductionLogs.map((l, i) => (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0', borderBottom: '1px solid #BBF7D0' }}
              >
                <span style={{ color: '#047857' }}>{l.item_name || 'Deducted item'}</span>
                <span style={{ fontWeight: 700, color: '#DC2626' }}>{l.quantity_change}</span>
                <span style={{ color: 'var(--text-3)', marginLeft: 'auto' }}>{formatDate(l.date)}</span>
              </div>
            ))}
        </div>
      )}
    </Modal>
  )
}