import Modal from '@components/ui/Modal'
import { PillIcon, InventoryIcon, CheckCircleIcon, ClipboardIcon, AlertTriangleIcon, InfoIcon } from '@components/ui/icons'

export default function MedDeductionModal({ isOpen, result, consultationId, onClose, onViewInventory }) {
  if (!result) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Inventory Deduction Report"
      icon={<PillIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onViewInventory}>
            <InventoryIcon width={13} height={13} /> View Inventory
          </button>
          <button type="button" className="btn btn-blue" onClick={onClose}>
            <CheckCircleIcon width={13} height={13} /> Done
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          <ClipboardIcon width={13} height={13} style={{ verticalAlign: -2, marginRight: 5 }} />Consultation #{consultationId} saved successfully.
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Inventory deduction results:</div>
      </div>

      {result.deductions.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="cons-section-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircleIcon width={13} height={13} /> Deducted Successfully</div>
          {result.deductions.map((d) => (
            <div className="deduction-row success" key={d.medicine}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PillIcon width={12} height={12} /> {d.medicine}</span>
              <span style={{ fontWeight: 700, color: 'var(--success)' }}>
                -{d.qty} {d.unit}
              </span>
              <span style={{ color: 'var(--text-3)' }}>Remaining: {d.remaining}</span>
            </div>
          ))}
        </div>
      )}

      {result.errors.length > 0 && (
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>
          <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangleIcon width={14} height={14} /> Stock Issues — {result.errors.length} item(s) could NOT be deducted:</strong>
          {result.errors.map((e) => (
            <div style={{ marginTop: 6, fontSize: 12 }} key={e.medicine}>
              • {e.message}
            </div>
          ))}
        </div>
      )}

      {result.skipped?.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
          <InfoIcon width={11} height={11} style={{ verticalAlign: -1, marginRight: 4 }} />Not matched in inventory (manual check needed): {result.skipped.join(', ')}
        </div>
      )}
    </Modal>
  )
}
